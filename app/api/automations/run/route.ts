'use server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';
import type { DeliverableStatus } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
  posted: 'Posted',
};

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { data: actorProfile } = await supabase
    .from('profiles').select('name').eq('id', user.id).single() as { data: { name: string } | null; error: unknown };
  const actorName = actorProfile?.name ?? 'Someone';

  const body = await request.json();
  const { trigger_type, deliverable_id, deliverable_title, deliverable_type, assignee_id, to_status } = body as {
    trigger_type: 'status_changed' | 'deliverable_created';
    deliverable_id: string;
    deliverable_title: string;
    deliverable_type: string;
    assignee_id: string | null;
    to_status?: DeliverableStatus;
  };

  if (!trigger_type || !deliverable_id) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const admin = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch all enabled rules for this trigger
  const { data: allRules } = await (admin.from('automation_rules' as any) as any)
    .select('*')
    .eq('enabled', true)
    .eq('trigger_type', trigger_type);

  if (!allRules || allRules.length === 0) {
    return NextResponse.json({ ok: true, ran: 0 });
  }

  // Filter by trigger condition
  const rules = allRules.filter((rule: any) => {
    if (trigger_type === 'status_changed') {
      const cfg = rule.trigger_config as { to_status?: string };
      return !cfg.to_status || cfg.to_status === to_status;
    }
    return true;
  });

  let ran = 0;

  for (const rule of rules) {
    try {
      switch (rule.action_type) {
        case 'notify_assignee': {
          if (!assignee_id) break;
          const statusLabel = to_status ? (STATUS_LABELS[to_status] ?? to_status) : '';
          const message = trigger_type === 'status_changed'
            ? `[Auto] Your deliverable "${deliverable_title}" was moved to ${statusLabel}`
            : `[Auto] A new deliverable was assigned to you: "${deliverable_title}"`;

          await (admin.from('notifications' as any) as any).insert({
            user_id: assignee_id,
            actor_name: actorName,
            type: 'status_change',
            deliverable_id,
            deliverable_title,
            deliverable_type,
            message,
            read: false,
          });
          ran++;
          break;
        }

        case 'notify_team': {
          const { data: team } = await (admin.from('profiles' as any) as any)
            .select('id')
            .in('role', ['admin', 'internal'])
            .neq('id', user.id);

          if (!team || team.length === 0) break;

          const statusLabel = to_status ? (STATUS_LABELS[to_status] ?? to_status) : '';
          const message = trigger_type === 'status_changed'
            ? `[Auto] "${deliverable_title}" was moved to ${statusLabel}`
            : `[Auto] New deliverable created: "${deliverable_title}"`;

          await (admin.from('notifications' as any) as any).insert(
            team.map((u: { id: string }) => ({
              user_id: u.id,
              actor_name: actorName,
              type: 'status_change',
              deliverable_id,
              deliverable_title,
              deliverable_type,
              message,
              read: false,
            }))
          );
          ran++;
          break;
        }

        case 'auto_assign': {
          const cfg = rule.action_config as { assignee_id?: string };
          if (!cfg.assignee_id) break;

          await (admin.from('deliverables' as any) as any)
            .update({ assignee_id: cfg.assignee_id })
            .eq('id', deliverable_id);
          ran++;
          break;
        }
      }
    } catch {
      // Continue executing remaining rules even if one fails
    }
  }

  return NextResponse.json({ ok: true, ran });
}

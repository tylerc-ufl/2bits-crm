'use server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Get actor's display name
  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single() as { data: { name: string } | null; error: unknown };

  const actorName = actorProfile?.name ?? 'Someone';

  const body = await request.json();
  const { type, deliverable_id, deliverable_title, deliverable_type, message } = body as {
    type: 'comment' | 'status_change';
    deliverable_id: string;
    deliverable_title: string;
    deliverable_type: string;
    message: string;
  };

  if (!type || !deliverable_id || !deliverable_title || !deliverable_type || !message) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const adminClient = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch all internal/admin users except the actor
  const { data: recipients } = await (adminClient.from('profiles' as any) as any)
    .select('id')
    .in('role', ['admin', 'internal'])
    .neq('id', user.id);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const rows = recipients.map((r: { id: string }) => ({
    user_id: r.id,
    actor_name: actorName,
    type,
    deliverable_id,
    deliverable_title,
    deliverable_type,
    message,
    read: false,
  }));

  const { error: insertError } = await (adminClient.from('notifications' as any) as any).insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: rows.length });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data, error } = await (supabase.from('notifications' as any) as any)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

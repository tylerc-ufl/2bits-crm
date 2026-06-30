'use server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';

async function requireInternalUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase, error: 'Authentication required.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null; error: unknown };

  if (!profile || profile.role === 'client_athlete' || profile.role === 'client_brand') {
    return { user: null, supabase, error: 'Unauthorized.' };
  }
  return { user, supabase, error: null };
}

export async function GET() {
  const { user, supabase, error } = await requireInternalUser();
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  const { data, error: fetchError } = await (supabase.from('automation_rules' as any) as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
  }

  const { user, error } = await requireInternalUser();
  if (error || !user) return NextResponse.json({ error }, { status: 401 });

  const body = await request.json();
  const { name, trigger_type, trigger_config, action_type, action_config } = body;

  if (!name?.trim() || !trigger_type || !action_type) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const adminClient = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error: insertError } = await (adminClient.from('automation_rules' as any) as any)
    .insert({
      name: name.trim(),
      trigger_type,
      trigger_config: trigger_config ?? {},
      action_type,
      action_config: action_config ?? {},
      created_by: user.id,
      enabled: true,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ rule: data }, { status: 201 });
}

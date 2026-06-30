'use server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service role key is missing.' }, { status: 500 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null; error: unknown };

  if (!profile || profile.role === 'client_athlete' || profile.role === 'client_brand') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const body = await request.json();
  const { contactId, name, email, password, role } = body as {
    contactId: string;
    name: string;
    email: string;
    password: string;
    role: 'client_athlete' | 'client_brand';
  };

  if (!contactId || !name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const adminClient = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !userData.user) {
    return NextResponse.json({ error: createError?.message ?? 'Unable to create auth user.' }, { status: 500 });
  }

  const { error: insertError } = await adminClient
    .from('profiles')
    .upsert({
      id: userData.user.id,
      name,
      email,
      role,
      client_id: contactId,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ id: userData.user.id }, { status: 201 });
}

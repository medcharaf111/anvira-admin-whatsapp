import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('holidays')
    .select('id, starts_on, ends_on, label')
    .eq('client_id', client.id)
    .gte('ends_on', today)
    .order('starts_on', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holidays: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { starts_on?: string; ends_on?: string; label?: string }
    | null;
  if (!body || !body.starts_on || !body.ends_on) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!DATE_RE.test(body.starts_on) || !DATE_RE.test(body.ends_on)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (body.ends_on < body.starts_on) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('holidays')
    .insert({
      client_id: client.id,
      starts_on: body.starts_on,
      ends_on: body.ends_on,
      label: body.label?.trim() || null,
    })
    .select('id, starts_on, ends_on, label')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'holiday.add',
    targetType: 'holiday',
    targetId: data?.id,
    details: { starts_on: body.starts_on, ends_on: body.ends_on, label: body.label ?? null },
  });

  return NextResponse.json({ ok: true, holiday: data });
}

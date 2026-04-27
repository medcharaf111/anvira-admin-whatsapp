import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const { data, error } = await supabase
    .from('reply_templates')
    .select('id, label, body, language, sort_order')
    .eq('client_id', client.id)
    .order('sort_order')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { label?: string; body?: string; language?: string }
    | null;
  if (!body?.label?.trim() || !body?.body?.trim()) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('reply_templates')
    .insert({
      client_id: client.id,
      label: body.label.trim(),
      body: body.body.trim(),
      language: body.language ?? 'ar',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'template.create',
    targetType: 'template',
    targetId: data.id,
  });

  return NextResponse.json({ ok: true, template: data });
}

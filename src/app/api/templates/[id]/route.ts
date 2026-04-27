import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { label?: string; body?: string; language?: string; sort_order?: number }
    | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) updates.label = body.label.trim();
  if (body.body !== undefined) updates.body = body.body.trim();
  if (body.language !== undefined) updates.language = body.language;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const svc = createServiceClient();
  const { error } = await svc
    .from('reply_templates')
    .update(updates)
    .eq('id', id)
    .eq('client_id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'template.update',
    targetType: 'template',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const svc = createServiceClient();
  const { error } = await svc
    .from('reply_templates')
    .delete()
    .eq('id', id)
    .eq('client_id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'template.delete',
    targetType: 'template',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

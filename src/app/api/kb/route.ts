import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = await req.json();
  const svc = createServiceClient();

  // Drop fields that shouldn't be client-editable
  const { id: _id, updated_at: _ut, client_id: _cid, ...safe } = body;

  // Upsert by client_id — works whether the row exists yet or not
  const { error } = await svc
    .from('knowledge_base')
    .upsert({ ...safe, client_id: client.id }, { onConflict: 'client_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate backend KB cache for this tenant
  fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/kb/invalidate?client=${client.id}`,
    {
      method: 'POST',
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SHARED_SECRET ?? '' },
    }
  ).catch(() => {});

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kb.update',
    targetType: 'kb',
    details: { fields: Object.keys(safe) },
  });

  return NextResponse.json({ ok: true });
}

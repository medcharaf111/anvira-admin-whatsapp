import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
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

  const { id: _id, updated_at: _ut, client_id: _cid, ...safe } = body;

  const { error } = await svc
    .from('settings')
    .upsert({ ...safe, client_id: client.id }, { onConflict: 'client_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/settings/invalidate?client=${client.id}`,
    { method: 'POST' }
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const body = await req.json();
  const svc = createServiceClient();

  const { id: _id, updated_at: _ut, ...safe } = body;

  const { data: row } = await svc.from('settings').select('id').single();
  if (!row) return NextResponse.json({ error: 'settings missing' }, { status: 500 });

  const { error } = await svc.from('settings').update(safe).eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/settings/invalidate`, {
    method: 'POST',
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}

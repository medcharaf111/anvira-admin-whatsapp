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

  // Drop id/updated_at if present — shouldn't be client-editable
  const { id: _id, updated_at: _ut, ...safe } = body;

  const { data: row } = await svc.from('knowledge_base').select('id').single();
  if (!row) return NextResponse.json({ error: 'kb missing' }, { status: 500 });

  const { error } = await svc.from('knowledge_base').update(safe).eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate backend KB cache
  fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/kb/invalidate`, {
    method: 'POST',
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}

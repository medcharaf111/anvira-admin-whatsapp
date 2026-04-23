import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { paused } = await req.json();
  const svc = createServiceClient();
  await svc.from('conversations').update({ bot_paused: paused }).eq('id', id);

  if (!paused) {
    await svc
      .from('handoffs')
      .update({ resolved: true })
      .eq('conversation_id', id)
      .eq('resolved', false);
  }
  return NextResponse.json({ ok: true });
}

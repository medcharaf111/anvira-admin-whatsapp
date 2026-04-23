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

  const svc = createServiceClient();

  // Mark handoff resolved
  const { data: handoff } = await svc
    .from('handoffs')
    .update({ resolved: true })
    .eq('id', id)
    .select('conversation_id')
    .single();

  // Also resume the bot on that conversation
  if (handoff) {
    await svc
      .from('conversations')
      .update({ bot_paused: false })
      .eq('id', handoff.conversation_id);
  }

  return NextResponse.json({ ok: true });
}

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';
import { NextResponse } from 'next/server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const svc = createServiceClient();

  // Scope to this client
  const { data: handoff } = await svc
    .from('handoffs')
    .update({ resolved: true })
    .eq('id', id)
    .eq('client_id', client.id)
    .select('conversation_id')
    .single();

  if (handoff) {
    await svc
      .from('conversations')
      .update({ bot_paused: false })
      .eq('id', handoff.conversation_id)
      .eq('client_id', client.id);
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'handoff.resolve',
    targetType: 'handoff',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

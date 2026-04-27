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

  const body = (await req.json().catch(() => null)) as { notes?: string } | null;
  if (body === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('conversations')
    .update({ operator_notes: body.notes ?? '' })
    .eq('id', id)
    .eq('client_id', client.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'conversation.note_edit',
    targetType: 'conversation',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

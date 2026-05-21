import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leads/:id — updates the conversation-level lead fields:
 * lead_stage, lead_score, assigned_agent_id. The route param is the
 * conversation id (a lead is a conversation enriched with qualification
 * data, not a separate row), which keeps URL semantics consistent with
 * the rest of the admin.
 */
const ALLOWED = ['lead_stage', 'lead_score', 'assigned_agent_id'] as const;

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
  if (client.client_type !== 'real_estate') {
    return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED) if (body[k] !== undefined) updates[k] = body[k];

  // Clamp lead_score to the schema's smallint 0-100 contract.
  if (typeof updates.lead_score === 'number') {
    updates.lead_score = Math.max(0, Math.min(100, Math.round(updates.lead_score)));
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('conversations')
    .update(updates)
    .eq('id', id)
    .eq('client_id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'lead.update',
    targetType: 'conversation',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

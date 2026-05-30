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

// Canonical funnel rank — MUST match crm_stage_rank() in the migration and
// STAGE_RANK in anvira-backend/src/crm/stage.ts. 'lost' = 0 (terminal sink).
const STAGE_RANK: Record<string, number> = {
  lost: 0, cold: 1, warm: 2, hot: 3, viewing_booked: 4, deposited: 5, closed: 6,
};
const VALID_STAGES = new Set(Object.keys(STAGE_RANK));

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

  // ── H3a stage-transition guard ─────────────────────────────────────────
  // A stage edit may be forward (any member) or backward (owner/admin only,
  // via the audited override RPC). Validate the value and read current stage.
  if (typeof updates.lead_stage === 'string') {
    const toStage = updates.lead_stage as string;
    if (!VALID_STAGES.has(toStage)) {
      return NextResponse.json({ error: 'invalid_stage' }, { status: 400 });
    }

    const { data: convo } = await supabase
      .from('conversations')
      .select('lead_stage')
      .eq('id', id)
      .eq('client_id', client.id)
      .maybeSingle();
    if (!convo) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const fromStage = (convo.lead_stage ?? null) as string | null;
    const fromRank = fromStage ? STAGE_RANK[fromStage] ?? 0 : 0;
    const toRank = STAGE_RANK[toStage] ?? 0;

    // Backward = strictly lower rank AND not the terminal 'lost' sink (a move
    // to 'lost' is always allowed; the DB trigger agrees).
    const isBackward = toStage !== 'lost' && toRank < fromRank;

    if (isBackward) {
      if (client.current_user_role !== 'owner' && client.current_user_role !== 'admin') {
        return NextResponse.json(
          { error: 'forbidden', detail: 'backward_stage_requires_owner_or_admin' },
          { status: 403 }
        );
      }
      // Route the backward move through the audited override RPC, which sets
      // app.crm_stage_override='on' + updates + writes the 'crm.stage.override'
      // audit row atomically (the monotonic trigger blocks any other path).
      const { error: rpcErr } = await svc.rpc('crm_override_stage', {
        p_client_id: client.id,
        p_conversation_id: id,
        p_to_stage: toStage,
        p_reason: (typeof body.reason === 'string' ? body.reason : null) ?? 'admin_manual_override',
        p_actor_user_id: user.id,
        p_actor_email: user.email ?? null,
      });
      if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

      // Drop lead_stage from the plain update; it's already applied. Apply any
      // remaining allowed fields (lead_score / assigned_agent_id) normally.
      delete updates.lead_stage;
    }
    // Forward / same / -> 'lost' moves fall through to the normal update;
    // the trigger maintains max_stage_reached and permits them.
  }

  if (Object.keys(updates).length > 0) {
    // .select() forces a return of updated rows so we can verify the write
    // actually landed; a foreign UUID or one belonging to another tenant
    // updates 0 rows and we 404 honestly. Caught by the E2E run on
    // 2026-05-30 (Phase D — foreign UUIDs were silently returning 200 ok).
    const { data: updated, error } = await svc
      .from('conversations')
      .update(updates)
      .eq('id', id)
      .eq('client_id', client.id)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
  }

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

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Abandon-pair performs an Evolution delete (no logout — that's what 502'd
// on the contradictory-state incident at 15:27 UTC on 2026-06-04) plus a
// couple of small DB writes. The Evolution delete typically completes in
// under 3s, but we match the change-number/unlink 60s ceiling so a slow
// Evolution response or a Postgres hiccup doesn't get truncated by Vercel
// Hobby's 10s default and orphan the audit trail.
export const maxDuration = 60;

/**
 * POST /api/settings/whatsapp/abandon-pair — tenant-owner-gated proxy
 * that abandons an Evolution instance whose ownerJid contradicts the
 * tenant's registered wa_number. Triggered by the QR modal recovery
 * panel after sync-after-pair returns 409 `owner_jid_mismatch`.
 *
 * Auth (mirrors /api/settings/whatsapp/change-number):
 *   - Must be authenticated.
 *   - Tenant must be on the real-estate vertical (Phase-B pilot scope).
 *   - Must own/admin the tenant (current_user_role ∈ {owner, admin}).
 *
 * Body: `{ wa_number: string, recovery_reason?: 'owner_jid_mismatch' |
 *   'contradictory_state' }` — the wa_number whose Evolution pairing
 *   should be abandoned. The instance_name is resolved server-side from
 *   `dashboard_clients.evolution_instance`; the client never passes it.
 *   This prevents a tampered request from deleting another tenant's
 *   instance.
 *
 * The destructive work (Evolution deleteInstance, dashboard_clients
 * column clear, client_numbers status patch, audit trail) lives in
 * `anvira-backend` under `POST /internal/evolution/abandon-pair`. This
 * route exists to:
 *   1. Authenticate + authorise the operator.
 *   2. Resolve the tenant scope + tenant's current instance_name.
 *   3. Capture intent audit rows BEFORE and AFTER so we can trace
 *      partially-failed abandons (intent recorded, delete didn't happen).
 *
 * Idempotent — re-running on an already-abandoned instance returns 200
 * because the backend treats a 404 from Evolution's delete endpoint as
 * a successful no-op.
 */
export async function POST(req: NextRequest) {
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
  // Only owners and admins can abandon a tenant's Evolution pairing. The
  // operation is destructive (deletes the upstream Baileys session and
  // clears the tenant's evolution_instance/api_key) and tenant-wide;
  // agents/viewers must escalate.
  if (
    client.current_user_role !== 'owner' &&
    client.current_user_role !== 'admin'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        wa_number?: string;
        recovery_reason?: 'owner_jid_mismatch' | 'contradictory_state';
      }
    | null;

  const wa_number = String(body?.wa_number ?? '').trim();
  if (!wa_number) {
    return NextResponse.json(
      { error: 'missing_wa_number' },
      { status: 400 }
    );
  }

  // Constrained enum — accept only the two reasons the design contract
  // calls out. Anything else collapses to 'owner_jid_mismatch' (the
  // common case) so a malformed client doesn't smuggle freeform strings
  // into the audit trail.
  const recovery_reason: 'owner_jid_mismatch' | 'contradictory_state' =
    body?.recovery_reason === 'contradictory_state'
      ? 'contradictory_state'
      : 'owner_jid_mismatch';

  // Resolve the tenant's currently-paired Evolution instance from the
  // resolved client. We do NOT accept the instance_name from the client
  // — the request must operate on whatever this tenant's session has
  // linked, never on an attacker-chosen name that could target another
  // tenant's instance.
  const instance_name = (client.evolution_instance ?? '').trim();
  if (!instance_name) {
    return NextResponse.json(
      { error: 'no_instance_to_abandon' },
      { status: 400 }
    );
  }

  // Forensic metadata for the audit trail. IP + UA help correlate
  // against browser session logs when a tenant disputes an abandon
  // event (e.g. "I never clicked that recovery button").
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwardedFor.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  // AUDIT FIRST — intent recorded even if the backend call later fails.
  // Pairs with `.abandoned` (on success) or `.failed` (on backend error)
  // so an ops audit can spot half-completed abandons (Evolution deleted
  // but DB row not cleared, or vice versa).
  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.pair.abandon.intent',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      instance_name,
      wa_number,
      recovery_reason,
      actor_email: user.email ?? null,
      actor_role: client.current_user_role,
      ip,
      user_agent: userAgent,
    },
  });

  const ctx = getInternalContext(client.id);
  const result = await callInternal(
    ctx,
    '/internal/evolution/abandon-pair',
    {
      method: 'POST',
      headers: {
        // Backend reads this for audit metadata. Plain `x-` headers are
        // safe to forward — they are not on Cloudflare's restricted list.
        'x-operator-email': user.email ?? '',
      },
      body: JSON.stringify({
        instance_name,
        wa_number,
        recovery_reason,
      }),
    }
  );

  if (!result.provisioned) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.evolution.pair.abandon.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: {
        instance_name,
        wa_number,
        reason: 'backend_not_configured',
      },
    });
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 503 }
    );
  }

  const payload = (result.json ?? {}) as Record<string, unknown>;

  if (!result.ok) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.evolution.pair.abandon.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: {
        instance_name,
        wa_number,
        status: result.status,
        backend_error: payload.error ?? null,
        backend_detail: payload.detail ?? null,
      },
    });
    // Relay 4xx verbatim so the modal can render specific reasons
    // (number_not_found vs instance_name_mismatch). Map 5xx to 502 so
    // the client can distinguish "I'm broken" from "you sent bad input."
    const proxyStatus = result.status >= 500 ? 502 : result.status;
    return NextResponse.json(
      {
        error: (payload.error as string | undefined) ?? 'abandon_failed',
        message: (payload.detail as string | undefined) ?? null,
      },
      { status: proxyStatus }
    );
  }

  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.pair.abandoned',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      instance_name,
      wa_number,
      recovery_reason,
      instance_deleted: payload.instance_deleted ?? null,
    },
  });

  // Surface a flat shape the QR-modal recovery panel can read directly.
  // We don't echo the backend payload because the modal only needs the
  // boolean — anything else risks tempting the client into making
  // decisions on backend internals.
  return NextResponse.json(
    {
      abandoned: true,
      instance_deleted: Boolean(payload.instance_deleted),
      wa_number,
    },
    { status: 200 }
  );
}

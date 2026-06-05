import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Change-number performs an Evolution unlink (slow path — Baileys teardown
// + Evolution delete) THEN two DB writes. We match the unlink route's 60s
// ceiling so the proxy doesn't time out before the backend can finish the
// teardown + audit sequence.
export const maxDuration = 60;

/**
 * POST /api/settings/whatsapp/change-number — tenant-owner-gated proxy
 * that switches a tenant's primary WhatsApp number to a new E.164.
 *
 * Auth (mirrors /api/settings/evolution/unlink):
 *   - Must be authenticated.
 *   - Tenant must be on the real-estate vertical (Phase-B pilot scope).
 *   - Must own/admin the tenant (current_user_role ∈ {owner, admin}).
 *
 * Body: `{ new_wa_number: string }` — the target E.164. The "from"
 * number is resolved server-side from `dashboard_clients.wa_number` for
 * the session tenant; the client never passes it. This prevents a
 * tampered request from re-keying a row that isn't the primary.
 *
 * The destructive work (unlink old Evolution instance, swap
 * client_numbers.wa_number in-place, swap dashboard_clients.wa_number
 * mirror, audit) lives in `anvira-backend` under
 * `POST /internal/operator/change-wa-number`. This route exists to:
 *   1. Authenticate + authorise the operator.
 *   2. Resolve the tenant scope + current `from_wa_number`.
 *   3. Capture intent audit rows BEFORE and AFTER so we can trace
 *      partially-failed changes (intent recorded, mutation didn't happen).
 *
 * On success the backend returns the deterministic new instance name,
 * which the modal forwards to the parent so it can pre-populate the
 * QR pair modal without an extra round-trip.
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
  // Only owners and admins can re-key a tenant's WhatsApp number. The
  // operation is destructive (unlinks the live instance mid-flight) and
  // tenant-wide; agents/viewers must escalate.
  if (
    client.current_user_role !== 'owner' &&
    client.current_user_role !== 'admin'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { new_wa_number?: string }
    | null;
  const new_wa_number = String(body?.new_wa_number ?? '').trim();
  if (!new_wa_number) {
    return NextResponse.json(
      { error: 'missing_new_wa_number' },
      { status: 400 }
    );
  }

  // Client-side has the same regex but we re-check server-side because
  // the proxy is the trust boundary. E.164 = leading +, country digit
  // 1-9, total 8-15 digits per ITU-T. Rejects leading zero after `+`
  // (Algeria writes +213, never +0213).
  if (!/^\+[1-9]\d{7,14}$/.test(new_wa_number)) {
    return NextResponse.json({ error: 'e164_invalid' }, { status: 400 });
  }

  // Resolve from_wa_number from the tenant's primary mirror. We do NOT
  // accept this from the client — the request must operate on whatever
  // the session tenant currently has linked, never on an attacker-chosen
  // number that could collide with another tenant.
  const from_wa_number = (client.wa_number ?? '').trim();
  if (!from_wa_number) {
    return NextResponse.json(
      { error: 'no_number_to_change' },
      { status: 400 }
    );
  }

  if (from_wa_number === new_wa_number) {
    return NextResponse.json({ error: 'same_number_noop' }, { status: 400 });
  }

  // Forensic metadata for the audit trail. IP + UA help correlate
  // against browser session logs when a tenant disputes a change event.
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwardedFor.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  // AUDIT FIRST — intent recorded even if the backend call later fails.
  // Pairs with `.confirmed` (on success) or `.failed` (on backend error)
  // so an ops audit can spot half-completed changes.
  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.whatsapp.change_number.requested',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      from_wa_number,
      new_wa_number,
      actor_email: user.email ?? null,
      actor_role: client.current_user_role,
      ip,
      user_agent: userAgent,
    },
  });

  const ctx = getInternalContext(client.id);
  const result = await callInternal(
    ctx,
    '/internal/operator/change-wa-number',
    {
      method: 'POST',
      headers: {
        // Backend reads this for audit metadata. Plain `x-` headers are
        // safe to forward — they are not on Cloudflare's restricted list.
        'x-operator-email': user.email ?? '',
      },
      body: JSON.stringify({ from_wa_number, new_wa_number }),
    }
  );

  if (!result.provisioned) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.whatsapp.change_number.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: { from_wa_number, new_wa_number, reason: 'backend_not_configured' },
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
      action: 'settings.whatsapp.change_number.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: {
        from_wa_number,
        new_wa_number,
        status: result.status,
        backend_error: payload.error ?? null,
        backend_detail: payload.detail ?? null,
        backend_scope: payload.scope ?? null,
        backend_stage: payload.stage ?? null,
      },
    });
    // Relay 4xx verbatim so the modal can render specific reasons
    // (collision vs e164_invalid vs unlink_failed vs same_number_noop).
    // Map 5xx to 502 so the client can distinguish "I'm broken" from
    // "you sent bad input."
    const proxyStatus = result.status >= 500 ? 502 : result.status;
    return NextResponse.json(
      {
        error: (payload.error as string | undefined) ?? 'change_failed',
        // Backend uses `scope` on 409 (which table collided) and `stage`
        // on 500 (which db write failed). Forward both so the UI can
        // render a precise message.
        scope: (payload.scope as string | undefined) ?? null,
        stage: (payload.stage as string | undefined) ?? null,
        message: (payload.detail as string | undefined) ?? null,
      },
      { status: proxyStatus }
    );
  }

  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.whatsapp.change_number.confirmed',
    targetType: 'client_numbers',
    targetId: (payload.number_id as string | undefined) ?? null,
    details: {
      from_wa_number,
      new_wa_number,
      deterministic_instance_name:
        payload.deterministic_instance_name ?? null,
    },
  });

  // Pass through `new_wa_number` + `deterministic_instance_name` so the
  // modal can hand them to the parent for QR pre-population.
  return NextResponse.json(payload, { status: result.status });
}

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Sync after pair calls Evolution's fetchInstances + does a small DB
// transaction in the backend. It typically completes in under 2s, but we
// match the unlink route's 60s ceiling so a slow Evolution response or a
// Postgres hiccup doesn't get truncated by Vercel Hobby's 10s default.
export const maxDuration = 60;

/**
 * POST /api/settings/evolution/sync-after-pair — tenant-owner-gated
 * proxy that backfills `dashboard_clients.evolution_instance` +
 * `evolution_api_key` and stamps the matching `client_numbers` row
 * `connected` after a successful QR pair.
 *
 * Why this exists: the legacy create-instance flow assumed a Twilio
 * handoff and never wrote the Evolution token/instance to the tenant
 * row at pair-time — it relied on the next outbound resolve. The new
 * QR modal calls this route immediately after observing `state=open`
 * so the next message can be sent without a 60s cache wait, and so
 * idempotent re-pairs (same operator, same number, same tenant) rotate
 * the token cleanly.
 *
 * Auth:
 *   - Must be authenticated.
 *   - Must own/admin the tenant (current_user_role ∈ {owner, admin}).
 *   - Tenant must be on the real-estate vertical (Phase-B pilot scope).
 *
 * Body: `{ instance_name: string, wa_number: string }`
 *   - `instance_name` is the Evolution instance slug the modal just
 *     observed connecting. The BACKEND re-derives the expected name
 *     from `(client_id, wa_number)` and rejects mismatches — we never
 *     trust the client-supplied name as authoritative.
 *   - `wa_number` is the whatsapp:+E164 number the operator is pairing.
 *
 * The heavy lifting (fetchInstances against Evolution, ownerJid
 * validation, transactional DB write, audit row, resolver cache
 * invalidation) lives in `anvira-backend` under
 * `POST /internal/evolution/sync-to-db`.
 *
 * Idempotent — re-running on an already-synced state returns 200 with
 * `{ idempotent: true }` from the backend. Every call writes an audit
 * row regardless so a forensic trail exists for token-rotation events.
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
  // Mirror the unlink-route posture — pairing/syncing a number is a
  // tenant-wide configuration change (it sets which Evolution instance
  // the bot replies through), so we gate to owners and admins only.
  if (
    client.current_user_role !== 'owner' &&
    client.current_user_role !== 'admin'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { instance_name?: string; wa_number?: string }
    | null;

  const instance_name = (body?.instance_name ?? '').trim();
  const wa_number = (body?.wa_number ?? '').trim();
  if (!instance_name || !wa_number) {
    return NextResponse.json(
      { error: 'missing_fields', detail: 'instance_name and wa_number are required' },
      { status: 400 }
    );
  }

  // Forensic metadata — same pattern as unlink so the audit trail is
  // queryable on the same {ip, user_agent} keys.
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwardedFor.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  // AUDIT FIRST — intent recorded even if the backend call later fails.
  // Pairs with `.synced` (success) or `.failed` (backend error) so an
  // ops audit can spot half-completed syncs (instance paired on
  // Evolution side, DB row not backfilled).
  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.pair.sync.requested',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      instance_name,
      wa_number,
      actor_email: user.email ?? null,
      actor_role: client.current_user_role,
      ip,
      user_agent: userAgent,
    },
  });

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/evolution/sync-to-db', {
    method: 'POST',
    body: JSON.stringify({ wa_number, instance_name }),
  });

  // Backend not deployed yet (or env vars missing) — degrade gracefully
  // so the modal can surface a clear "service unavailable" rather than
  // a generic network error.
  if (!result.provisioned) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.evolution.pair.sync.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: { instance_name, wa_number, reason: 'backend_not_configured' },
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
      action: 'settings.evolution.pair.sync.failed',
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
    // 5xx → upstream gateway failure (502) so the client distinguishes
    // "I'm broken" from "you sent bad input." 4xx → relay verbatim so
    // the QR modal can render the exact validation error (e.g.
    // `owner_jid_mismatch`, `instance_name_mismatch`).
    const proxyStatus = result.status >= 500 ? 502 : result.status;
    return NextResponse.json(
      {
        error: (payload.error as string | undefined) ?? 'sync_failed',
        detail: payload.detail ?? null,
      },
      { status: proxyStatus }
    );
  }

  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.pair.synced',
    targetType: 'client_numbers',
    targetId: (payload.number_id as string | undefined) ?? null,
    details: {
      instance_name,
      wa_number,
      idempotent: payload.idempotent ?? false,
      token_rotated: payload.token_rotated ?? false,
    },
  });

  // Pass the backend payload through so the modal can read
  // `idempotent`, `token_rotated`, `number_id` directly.
  return NextResponse.json(payload, { status: result.status });
}

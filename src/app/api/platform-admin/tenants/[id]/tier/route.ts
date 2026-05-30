// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.3 — the atomic
// tier-change endpoint.
//
//   POST /api/platform-admin/tenants/[id]/tier
//
// Wraps public.set_billing_tier_admin (11-arg RPC from migration
// 20260618000000_platform_admin.sql §3.7). The RPC owns the actual
// auth+update+audit transaction; this handler is responsible for:
//
//   * withSuperAdmin gating (Gates 1–3)
//   * Body schema validation (cheap 400s before the DB round-trip)
//   * Pre-computing features_lost from the TS FEATURE_MIN_TIER map
//     (the RPC accepts the array; it does NOT recompute, see §3.7
//     "p_features_lost" docstring)
//   * Downgrade acknowledgement-phrase check (the DB doesn't enforce
//     this — it's a UX-layer rule, hence enforced here AND in the modal)
//   * Idempotency-Key replay handling (24h, per §4 "Idempotency model")
//   * Per-actor sliding-window rate limit (pa:write + pa:write:burst)
//   * Mapping Postgres exception messages to HTTP codes the UI can branch on
//
// Audit posture: the RPC writes a subscription_tier_changes row inside
// its own transaction (Gate E). We do NOT also write platform_admin_audit
// here — tier-change events live in their own table per §3.3 design.
// The two-table split is by design: subscription_tier_changes carries
// the legally-required impact snapshot (active KYC count, sanctions
// screenings, features lost); platform_admin_audit is the global
// operator log for the actions that don't have a dedicated table.
// ----------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { withSuperAdmin } from '@/lib/platform-admin/guard';
import { createPlatformAdminServiceClient } from '@/lib/platform-admin/service-client';
import { featuresLostBetween, isDowngrade } from '@/lib/platform-admin/tier-diff';
import {
  lookupIdempotency,
  saveIdempotencyRecord,
} from '@/lib/platform-admin/idempotency';
import {
  checkRateLimit,
  PA_RATE_LIMITS,
} from '@/lib/platform-admin/rate-limit';
import { ACK_PHRASE } from '@/lib/platform-admin/constants';
import { fetchTenantDetail } from '@/lib/platform-admin/fetch-tenant-detail';
import type { SubscriptionTier } from '@/lib/tier-gates';
import type { SubscriptionStatus } from '@/lib/platform-admin/tenants-query';
import type {
  ChangeTierRequest,
  ChangeTierResponse,
  ChangeTierErrorResponse,
} from '@/lib/platform-admin/tenant-detail-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Loose RFC-4122 UUID check — guards Postgres' "invalid input syntax"
// 500s before we touch the DB. Case-insensitive to match canonical text.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TIERS = new Set<SubscriptionTier>([
  'pilot',
  'team',
  'brokerage',
  'enterprise',
  'grandfather',
  'suspended',
]);

const VALID_STATUSES = new Set<SubscriptionStatus>([
  'pilot',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]);

// Mirror of validate_subscription_transition() trigger
// (anvira-backend/supabase/migrations/20260617000000_subscription_billing.sql:273).
// Source of truth is still the trigger; this map exists purely so the
// 422 response carries the `allowed_transitions` array for the UI
// without us round-tripping the DB to discover them.
const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  pilot: ['trialing', 'active', 'suspended', 'cancelled'],
  trialing: ['active', 'past_due', 'cancelled', 'suspended'],
  active: ['past_due', 'cancelled', 'suspended'],
  past_due: ['active', 'cancelled', 'suspended'],
  suspended: ['active', 'cancelled'],
  cancelled: ['active'],
};

function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function err(
  code: string,
  status: number,
  message?: string,
  extra?: Partial<ChangeTierErrorResponse>,
): NextResponse {
  const body: ChangeTierErrorResponse = {
    ok: false,
    error: code,
    ...(message ? { message } : {}),
    ...(extra ?? {}),
  };
  return json(body, status);
}

// The handler receives the Next.js route context as its 2nd arg; the
// withSuperAdmin guard's <Ctx> generic stays inferred from this callback
// (the CI guard regex `withSuperAdmin\s*\(` rejects an explicit type
// argument, so we cast inside the body instead of widening the call).
export const POST = withSuperAdmin(async (req, ctx, sa) => {
  const { id: tenantId } = await (
    ctx as { params: Promise<{ id: string }> }
  ).params;

  // ── 0. id sanity ──────────────────────────────────────────────────
  if (!UUID_RE.test(tenantId)) {
    return err('invalid_id', 400, 'tenant id must be a UUID');
  }

  // ── 1. Rate limit — both buckets must pass per §4. ────────────────
  // Order: burst first (3/10s) catches double-clicks cheaply, then the
  // 10/min ceiling. If either trips we 429 and bail before the DB hit.
  const burst = await checkRateLimit(PA_RATE_LIMITS.writeBurst, sa.userId);
  if (!burst.allowed) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: 'rate_limited',
        message: 'Too many writes — burst limit (3/10s)',
        bucket: burst.bucket,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((burst.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }
  const write = await checkRateLimit(PA_RATE_LIMITS.write, sa.userId);
  if (!write.allowed) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: 'rate_limited',
        message: 'Too many writes — 10/min ceiling',
        bucket: write.bucket,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((write.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // ── 2. Body parse ─────────────────────────────────────────────────
  let body: ChangeTierRequest;
  try {
    body = (await req.json()) as ChangeTierRequest;
  } catch {
    return err('invalid_json', 400, 'Request body must be valid JSON');
  }

  // ── 3. Schema checks (cheap 400s before the DB hop) ───────────────
  if (!body.to_tier || !VALID_TIERS.has(body.to_tier)) {
    return err('admin_invalid_tier', 400, 'Unknown tier value');
  }
  if (body.to_status && !VALID_STATUSES.has(body.to_status)) {
    return err('admin_invalid_status', 400, 'Unknown status value');
  }
  const reason = (body.reason ?? '').trim();
  if (reason.length < 12) {
    return err(
      'reason_too_short',
      400,
      'Reason must be at least 12 characters after trim',
    );
  }
  if (reason.length > 2000) {
    return err(
      'reason_too_long',
      400,
      'Reason capped at 2000 characters (DB CHECK)',
    );
  }

  // ── 4. Idempotency-Key replay ─────────────────────────────────────
  //
  // §4 spec: the UI computes sha256(tenant_id || to_tier || to_status ||
  // reason) and sends it as the Idempotency-Key header. We dedupe on
  // (actor, key) and compare body sha to surface 409 on key reuse with
  // different bodies.
  const idemKey = req.headers.get('idempotency-key');
  const bodyForHash = JSON.stringify({
    to_tier: body.to_tier,
    to_status: body.to_status ?? null,
    reason,
    acknowledged_text: body.acknowledged_text ?? null,
  });
  const bodySha = createHash('sha256').update(bodyForHash).digest('hex');

  if (idemKey) {
    const hit = await lookupIdempotency(sa.userId, idemKey, bodySha);
    if (hit.kind === 'conflict') {
      return err(
        'idempotency_key_conflict',
        409,
        'Same Idempotency-Key was previously used with a different request body',
      );
    }
    if (hit.kind === 'hit' && hit.record) {
      // Replay the original response verbatim.
      return json(hit.record.responseJson, hit.record.status);
    }
  }

  // ── 5. Snapshot current state (for features_lost + downgrade check) ──
  //
  // We re-fetch BEFORE the RPC so the modal's "features lost" preview
  // and the RPC's view of the world stay aligned. The RPC will FOR
  // UPDATE-lock the row again inside its own transaction — there's a
  // tiny TOCTOU window between our SELECT and the RPC's UPDATE where
  // another operator could race a different change in. That race is
  // bounded by the per-actor rate limit (10/min) and benign in practice;
  // the RPC's own row-lock + validate_subscription_transition trigger
  // catch any illegal end-state.
  const svc = createPlatformAdminServiceClient();
  const { data: current, error: currentErr } = await svc
    .from('dashboard_clients')
    .select('subscription_tier, subscription_status')
    .eq('id', tenantId)
    .maybeSingle();

  if (currentErr) {
    return err('db_error', 500, currentErr.message);
  }
  if (!current) {
    return err('admin_client_not_found', 404, 'No tenant with that id');
  }

  const fromTier = current.subscription_tier as SubscriptionTier;
  const fromStatus = current.subscription_status as SubscriptionStatus;
  // RPC requires p_to_status NOT NULL; default to current when omitted.
  const toStatus: SubscriptionStatus = body.to_status ?? fromStatus;

  const featuresLost = featuresLostBetween(fromTier, body.to_tier);

  // ── 6. Downgrade acknowledgement gate ─────────────────────────────
  const isDown = isDowngrade(fromTier, body.to_tier);
  if (isDown && body.acknowledged_text !== ACK_PHRASE) {
    return err(
      'acknowledgement_required',
      400,
      'Downgrades require typing the verbatim acknowledgement phrase',
    );
  }

  // ── 7. Capture actor envelope ─────────────────────────────────────
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const userAgent = req.headers.get('user-agent') ?? null;
  // x-forwarded-for is a comma-separated list; the client IP is the first.
  const xff = req.headers.get('x-forwarded-for');
  const actorIp =
    (xff ? xff.split(',')[0]?.trim() : null) ??
    req.headers.get('x-real-ip') ??
    null;

  // ── 8. Call the RPC (atomic auth+update+audit) ────────────────────
  //
  // The RPC signature (uuid,text,text,text,uuid,text,inet,text,text,text,text[])
  // is pinned in the migration's GRANT/REVOKE statement. Parameter names
  // match anvira-backend/supabase/migrations/20260618000000_platform_admin.sql:318.
  const { data: rpcData, error: rpcErr } = await svc.rpc(
    'set_billing_tier_admin',
    {
      p_client_id: tenantId,
      p_to_tier: body.to_tier,
      p_to_status: toStatus,
      p_reason: reason,
      p_actor_user_id: sa.userId,
      p_actor_email: sa.email,
      p_actor_ip: actorIp,
      p_user_agent: userAgent,
      p_request_id: requestId,
      p_acknowledged_text: isDown ? body.acknowledged_text : null,
      p_features_lost: featuresLost,
    },
  );

  if (rpcErr) {
    // The RPC raises with bare codes via RAISE EXCEPTION; PostgREST
    // surfaces them in error.message. The trigger raises with the
    // 'subscription_invalid_transition' code from
    // validate_subscription_transition().
    const msg = rpcErr.message ?? '';
    if (msg.includes('admin_actor_required'))
      return err('admin_actor_required', 403, msg);
    if (msg.includes('admin_actor_mismatch'))
      return err('admin_actor_mismatch', 403, msg);
    if (msg.includes('admin_not_super_admin'))
      return err('admin_not_super_admin', 403, msg);
    if (msg.includes('admin_reason_required'))
      return err('reason_too_short', 400, msg);
    if (msg.includes('admin_invalid_tier'))
      return err('admin_invalid_tier', 400, msg);
    if (msg.includes('admin_invalid_status'))
      return err('admin_invalid_status', 400, msg);
    if (msg.includes('admin_client_not_found'))
      return err('admin_client_not_found', 404, msg);
    if (msg.includes('subscription_invalid_transition')) {
      return err(
        'invalid_transition',
        422,
        `Cannot transition status from '${fromStatus}' to '${toStatus}'.`,
        { allowed_transitions: STATUS_TRANSITIONS[fromStatus] ?? [] },
      );
    }
    return err('rpc_failed', 500, msg);
  }

  // ── 9. Re-fetch the full TenantDetail payload for the response ────
  //
  // The RPC returns the subscription_tier_changes audit row, not the
  // updated client. We re-load via fetchTenantDetail so the client gets
  // the same shape the GET endpoint produces — simplifies the modal's
  // success path (just splice the response into local state).
  const detail = await fetchTenantDetail(tenantId);
  if (!detail) {
    // Should be impossible — we just successfully UPDATEd the row.
    return err('post_update_fetch_failed', 500, 'Tenant disappeared after update');
  }

  // The RPC RETURNS a single subscription_tier_changes row; PostgREST
  // unwraps that to `rpcData` directly when the RPC's return type is a
  // single composite. The audit row's `id` is the audit id we surface.
  const auditRow = rpcData as { id?: string } | null;
  const auditId = auditRow?.id ?? randomUUID();

  const response: ChangeTierResponse = {
    ok: true,
    tenant: detail.tenant,
    audit_id: auditId,
  };

  // ── 10. Persist for idempotent replay (24h TTL) ───────────────────
  if (idemKey) {
    await saveIdempotencyRecord({
      actorId: sa.userId,
      key: idemKey,
      bodySha256: bodySha,
      responseJson: response,
      status: 200,
      createdAt: new Date().toISOString(),
    });
  }

  return json(response);
});

// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §3.4 + §7 — write a row to platform_admin_audit
// AND emit the JSON log line that the structured-log forwarder (§8.7,
// Phase 3) will pick up.
//
// Why a single helper instead of two: every platform-admin action MUST
// produce both records — the DB row is the 5-year legal evidence, the
// JSON log is the 90-day operational signal. Splitting them risks the
// "we logged but didn't persist" or vice-versa failure mode.
//
// Database failure is FATAL: throws. The caller (usually a route
// handler) should refuse to ack the user's action if the audit row
// could not be written — `Gate 5: Audit FIRST, mutation SECOND`.
// Log emission is best-effort: stdout failures are swallowed so a
// broken log drain never blocks an audit-defensible mutation.
// ----------------------------------------------------------------------------

import { createPlatformAdminServiceClient } from '@/lib/platform-admin/service-client';

export interface PlatformAuditEntry {
  /** auth.users.id of the operator performing the action. */
  actorUserId: string;
  /** Denormalised email for human-readable forensics even after the user is deleted. */
  actorEmail: string;
  /** Stable action namespace, e.g. 'super_admin.grant', 'tenant.suspend'. */
  action: string;
  /** Optional polymorphic target — 'user' | 'client' | 'service'. */
  targetType?: 'user' | 'client' | 'service' | null;
  /** Free-form id matching targetType. */
  targetId?: string | null;
  /** Tenant scope when the action applies to one. Optional. */
  targetClientId?: string | null;
  /**
   * Operator-supplied reason. ≥12 chars enforced at DB CHECK; the
   * helper does NOT validate length so the caller can return a
   * structured 400 with field-level errors before getting here.
   */
  reason: string;
  /** Before / after column diff for the action. PII-free per §7. */
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  /** Request envelope — populated by the route handler from the request. */
  ip?: string | null;
  userAgent?: string | null;
  /** Request id for cross-system correlation (required at DB layer). */
  requestId: string;
}

/**
 * Append-only write to public.platform_admin_audit AND a JSON log
 * line to stdout. Throws on DB error so the caller can abort the
 * mutation per §8.1 Gate 5.
 */
export async function logPlatformAction(
  entry: PlatformAuditEntry
): Promise<{ auditId: string }> {
  const svc = createPlatformAdminServiceClient();
  const insert = await svc
    .from('platform_admin_audit')
    .insert({
      actor_user_id: entry.actorUserId,
      actor_email: entry.actorEmail,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_client_id: entry.targetClientId ?? null,
      reason: entry.reason,
      before_state: entry.beforeState ?? null,
      after_state: entry.afterState ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      request_id: entry.requestId,
    })
    .select('id')
    .single();

  if (insert.error || !insert.data) {
    throw new Error(
      `[platform-admin] audit write failed: ${
        insert.error?.message ?? 'no row returned'
      }`
    );
  }

  // Best-effort structured log. Picked up by the §8.7 forwarder when
  // wired in Phase 3. DO NOT include before/after state at this layer
  // — that lives only in the DB row (PII guard is the DB CHECK on
  // reason + the schema-level absence of customer fields).
  try {
    console.log(
      JSON.stringify({
        type: 'platform_admin_audit',
        audit_id: insert.data.id,
        actor_user_id: entry.actorUserId,
        actor_email: entry.actorEmail,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_client_id: entry.targetClientId ?? null,
        request_id: entry.requestId,
        ts: new Date().toISOString(),
      })
    );
  } catch {
    // stdout failure — never block on this.
  }

  return { auditId: insert.data.id as string };
}

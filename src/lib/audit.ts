import { createServiceClient } from '@/lib/supabase/server';

export interface AuditEntry {
  clientId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Append-only operator action log. Server-side only (writes via service role).
 * Failures are logged but never throw — auditing should not block user actions.
 */
export async function logAction(entry: AuditEntry): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from('audit_log').insert({
      client_id: entry.clientId,
      actor_user_id: entry.actorUserId,
      actor_email: entry.actorEmail,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    console.error('[audit] log failed:', err);
  }
}

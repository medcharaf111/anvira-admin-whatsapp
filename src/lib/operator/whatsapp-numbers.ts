import { createServiceClient } from '@/lib/supabase/server';

/**
 * Server-only helpers for WhatsApp-number lifecycle bookkeeping.
 *
 * Lives at the lib layer (not inside an API route) so that the unlink
 * modal, the platform-admin tenant detail page, and any future
 * onboarding-rollback flow can all share the same "how many active
 * threads will this break?" math.
 *
 * IMPORTANT: every export here calls the SERVICE-ROLE supabase client
 * and assumes the caller has already authenticated + authorised the
 * operator. Never expose these counts cross-tenant.
 */

/**
 * The window we treat as "active" for the unlink-warning UI. Matches
 * the spec: anything that received traffic in the last 7 days counts
 * against the operator's "you'll cut these threads off" warning.
 *
 * Note this is INTENTIONALLY narrower than the transport-switch gate
 * (30 days) — unlinking is reversible by linking a new number, so we
 * only need to surface threads the operator is realistically still
 * engaging with right now. The 30-day gate exists to block hard
 * transport flips, which are much more disruptive.
 */
const ACTIVE_CONVERSATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ActiveConversationCount {
  count: number;
  /** ISO-8601 of the inclusive lower bound the count was taken with. */
  since: string;
}

/**
 * Count conversations on this tenant that are likely to be cut off if
 * the operator unlinks their WhatsApp number now.
 *
 * "Active" =
 *   - belongs to this client (tenant scope),
 *   - bot is still serving the thread (`bot_paused = false`; paused
 *     conversations are already in human-handoff and won't notice the
 *     bot going silent), AND
 *   - had a message touch within the last 7 days
 *     (`last_message_at >= now - 7d`).
 *
 * Returns 0 on any error so the modal's warning never blocks the
 * operator from proceeding — a missing count is degraded UX, not a
 * blocker, and the destructive action is itself idempotent.
 */
export async function fetchActiveConversations(
  clientId: string
): Promise<ActiveConversationCount> {
  const since = new Date(
    Date.now() - ACTIVE_CONVERSATION_WINDOW_MS
  ).toISOString();

  try {
    const svc = createServiceClient();
    const { count, error } = await svc
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('bot_paused', false)
      .gte('last_message_at', since);

    if (error) {
      // Don't throw — the unlink modal should still render with `0`
      // so the operator isn't blocked by a count-query glitch.
      console.error(
        '[whatsapp-numbers] fetchActiveConversations failed:',
        error
      );
      return { count: 0, since };
    }
    return { count: count ?? 0, since };
  } catch (err) {
    console.error(
      '[whatsapp-numbers] fetchActiveConversations threw:',
      err
    );
    return { count: 0, since };
  }
}

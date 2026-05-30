// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §4 "Idempotency model" — Redis-backed
// Idempotency-Key store with 24h TTL for endpoints #3 (tier) and #4
// (pilot-extend).
//
// Phase 1 ships the import surface ONLY — the route handlers that need
// it land in Phase 2. The in-memory fallback keeps the helper callable
// from unit tests + locally without forcing a Redis dep until §4
// endpoints actually exist. Phase 2 swaps the backend to Upstash
// (sliding-window already in the same lib via rate-limit.ts) without
// touching the call sites.
//
// Spec quote:
//   "Server stores (actor_id, key, body_sha256, response_json, created_at)
//    in Redis TTL 24h. Replay with same key+body → cached 200. Same key
//    + different body → 409 idempotency_key_conflict."
//
// Key derivation MUST be deterministic from form state (per §4 spec
// note). The UI computes sha256(tenant_id || to_tier || to_status ||
// reason) and sends it as the Idempotency-Key header. A fresh UUID per
// click would make the plumbing theatre.
// ----------------------------------------------------------------------------

export interface IdempotencyRecord {
  /** auth.users.id of the original caller. */
  actorId: string;
  /** Header value, opaque from the server's POV. */
  key: string;
  /** sha256 of the canonical request body. */
  bodySha256: string;
  /** Serialised response that was returned with the original request. */
  responseJson: unknown;
  /** Original request HTTP status code (200, 201, etc.). */
  status: number;
  /** Wall-clock timestamp of original write, ISO 8601. */
  createdAt: string;
}

export interface IdempotencyLookupResult {
  kind: 'hit' | 'miss' | 'conflict';
  /** Present when kind === 'hit'. */
  record?: IdempotencyRecord;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h per spec.

// In-memory fallback. Sufficient for Phase 1 (no callers) + unit tests.
// Phase 2 swaps to Upstash Redis. Map is keyed by `${actorId}:${key}`
// so distinct operators with colliding keys never share records.
const _mem = new Map<string, IdempotencyRecord>();

function compositeKey(actorId: string, key: string): string {
  return `${actorId}:${key}`;
}

function purgeExpired(now: number) {
  for (const [k, v] of _mem) {
    if (now - new Date(v.createdAt).getTime() > TTL_MS) {
      _mem.delete(k);
    }
  }
}

/**
 * Check an Idempotency-Key against the store.
 *  - 'hit'      : same actor + same key + same body sha → replay safe.
 *  - 'conflict' : same actor + same key + DIFFERENT body → caller must 409.
 *  - 'miss'     : no record; caller proceeds with the mutation and then
 *                 calls saveIdempotencyRecord() to persist the outcome.
 */
export async function lookupIdempotency(
  actorId: string,
  key: string,
  bodySha256: string
): Promise<IdempotencyLookupResult> {
  purgeExpired(Date.now());
  const existing = _mem.get(compositeKey(actorId, key));
  if (!existing) return { kind: 'miss' };
  if (existing.bodySha256 !== bodySha256) {
    return { kind: 'conflict', record: existing };
  }
  return { kind: 'hit', record: existing };
}

/**
 * Persist the response of a successful mutation against its
 * Idempotency-Key so subsequent retries replay the same response.
 */
export async function saveIdempotencyRecord(
  record: IdempotencyRecord
): Promise<void> {
  _mem.set(compositeKey(record.actorId, record.key), record);
}

/**
 * Test-only — clear the in-memory store. Will be unused once the
 * backend swaps to Upstash. Exposed so Phase 2 tests can reset
 * between cases.
 */
export function __resetIdempotencyStoreForTests(): void {
  _mem.clear();
}

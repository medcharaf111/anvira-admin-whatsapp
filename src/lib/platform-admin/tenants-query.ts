// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Foundation Slice §3 — shared query helper
// for the tenants list. Single source of truth used by:
//
//   * src/app/api/platform-admin/tenants/route.ts (JSON API)
//   * src/app/(app)/platform-admin/tenants/page.tsx (SSR page)
//
// Both call queryTenants() so the column projection, owner-email join,
// cursor pagination, and `q` sanitisation stay byte-identical no matter
// which surface a caller hits. Diverging from this helper risks the
// "API says 25 rows, page renders 23" class of bug.
//
// Schema sources of truth:
//   * dashboard_clients          → tenant primary fields
//   * tenant_members (role=owner)→ owner_user_id (one row per tenant
//                                  in well-formed data; we pick the
//                                  oldest by created_at as a tiebreaker)
//   * auth.users.email           → owner_email (batched via
//                                  supabase.auth.admin.listUsers per
//                                  the operator/page.tsx pattern)
//
// Why two queries instead of a nested `tenant_members!inner` join:
// `!inner` silently excludes tenants that have zero member rows, which
// the operator UI today shows (owner_id fallback). The 2-query pattern
// matches operator/page.tsx and keeps owner-less tenants visible with
// owner_email = null instead of hiding them.
//
// Why we over-fetch limit+1: detect "has next page" without a second
// count query. The +1 row is sliced off before serialising.
// ----------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

// ───── Exported enums (mirrored verbatim from the API route contract) ─────
export type SubscriptionTier =
  | 'pilot'
  | 'team'
  | 'brokerage'
  | 'enterprise'
  | 'grandfather'
  | 'suspended';

export type SubscriptionStatus =
  | 'pilot'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled';

export type ClientType = 'real_estate' | 'clinic' | 'salon';

export type Country = 'UAE' | 'KSA' | null;

export interface TenantsListItem {
  /** dashboard_clients.id (uuid) */
  id: string;
  /** dashboard_clients.name */
  name: string;
  /** dashboard_clients.slug */
  slug: string;
  /** dashboard_clients.country */
  country: Country;
  /** dashboard_clients.client_type */
  client_type: ClientType;
  /** dashboard_clients.subscription_tier */
  subscription_tier: SubscriptionTier;
  /** dashboard_clients.subscription_status */
  subscription_status: SubscriptionStatus;
  /** ISO 8601 timestamptz; null when pilot N/A */
  pilot_ends_at: string | null;
  /** ISO 8601 timestamptz (also used in cursor) */
  created_at: string;
  /** Owner email from auth.users via tenant_members(role='owner'). Null when no owner. */
  owner_email: string | null;
}

export interface TenantsListResponse {
  tenants: TenantsListItem[];
  /** Opaque base64 of {created_at, id}; null when no more pages. */
  next_cursor: string | null;
  /** From pg_class.reltuples; null until Phase 3 wires it. */
  total_estimate: number | null;
}

export interface TenantsListError {
  /** Machine code, e.g. 'invalid_cursor', 'invalid_limit'. */
  error: string;
  /** Human-readable English (caller localises if needed). */
  message: string;
}

export interface Cursor {
  created_at: string;
  id: string;
}

// ───── Cursor codec ─────
//
// Opaque base64(JSON). Used for keyset pagination on
// (created_at DESC, id DESC). We never include the cursor in URLs as
// raw fields so the schema can change without breaking deep-links.

export function decodeCursor(raw: string | null | undefined): Cursor | null | 'invalid' {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (
      typeof json !== 'object' ||
      json === null ||
      typeof (json as { created_at?: unknown }).created_at !== 'string' ||
      typeof (json as { id?: unknown }).id !== 'string'
    ) {
      return 'invalid';
    }
    return {
      created_at: (json as Cursor).created_at,
      id: (json as Cursor).id,
    };
  } catch {
    return 'invalid';
  }
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64');
}

// ───── `q` sanitiser ─────
//
// PostgREST's or() filter parses commas and parens specially. A user-
// supplied `q` like `Acme, Inc)` would crash the request. We strip
// these to underscores before composing the ilike pattern. Underscore
// is a single-char wildcard in ilike but for a free-text search that
// false-positive is fine; it never widens the match enough to leak.
//
// We also escape ilike wildcard metacharacters (% and _) and the
// backslash escape character itself. Without this, a search for "50%"
// would match every tenant. Order matters: escape backslash first so
// we don't double-escape the backslashes we add for % and _.
export function sanitiseQ(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/[,()]/g, '_');
  return trimmed.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => '\\' + c);
}

// ───── Cursor field validators ─────
//
// The cursor is opaque base64 from our own encodeCursor(), but a hostile
// caller can craft any payload they like. Once decoded, we string-
// interpolate created_at + id into a PostgREST .or() clause; without
// strict validation a payload like `2026-01-01,subscription_tier.eq.suspended)`
// would break out of the filter expression. These regexes guarantee the
// values are exactly what encodeCursor() would have produced.
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:?\d{2}|Z)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ───── Validators ─────

export const VALID_TIERS: ReadonlySet<SubscriptionTier> = new Set([
  'pilot',
  'team',
  'brokerage',
  'enterprise',
  'grandfather',
  'suspended',
]);

export const VALID_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'pilot',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]);

export const VALID_COUNTRIES: ReadonlySet<string> = new Set(['UAE', 'KSA']);

// ───── Query input + entry point ─────

export interface TenantsQueryInput {
  tier?: SubscriptionTier | null;
  status?: SubscriptionStatus | null;
  country?: 'UAE' | 'KSA' | null;
  q?: string | null;
  cursor?: Cursor | null;
  /** 1..50; the caller enforces bounds. Default 25 if omitted. */
  limit?: number;
}

/**
 * Shape of one row returned from the dashboard_clients projection. Kept
 * narrow on purpose — adding columns here means adding them to the
 * `.select(...)` string below.
 */
interface DashboardClientRow {
  id: string;
  name: string;
  slug: string;
  country: 'UAE' | 'KSA' | null;
  client_type: ClientType;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  pilot_ends_at: string | null;
  created_at: string;
}

interface TenantMemberRow {
  client_id: string;
  user_id: string;
  created_at: string | null;
}

export async function queryTenants(
  supabase: SupabaseClient,
  input: TenantsQueryInput,
): Promise<TenantsListResponse> {
  const limit = input.limit ?? 25;

  // Over-fetch by 1 to detect "has next page" cheaply.
  let q = supabase
    .from('dashboard_clients')
    .select(
      'id, name, slug, country, client_type, subscription_tier, subscription_status, pilot_ends_at, created_at',
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (input.tier) q = q.eq('subscription_tier', input.tier);
  if (input.status) q = q.eq('subscription_status', input.status);
  if (input.country) q = q.eq('country', input.country);

  const cleanQ = sanitiseQ(input.q);
  if (cleanQ) {
    q = q.or(`name.ilike.%${cleanQ}%,slug.ilike.%${cleanQ}%`);
  }

  if (input.cursor) {
    // Validate cursor fields before string-interpolating into the .or()
    // clause. A malformed cursor (hand-edited base64) could otherwise
    // smuggle PostgREST operators / commas into the filter expression.
    // The route handler maps this thrown Error to 400 invalid_cursor.
    if (!ISO_TIMESTAMP_RE.test(input.cursor.created_at)) {
      throw new Error('invalid_cursor: created_at not a valid ISO-8601 timestamp');
    }
    if (!UUID_RE.test(input.cursor.id)) {
      throw new Error('invalid_cursor: id not a valid UUID');
    }
    // Keyset: (created_at, id) strictly less than cursor.
    // Either created_at < cursor.created_at, OR
    // (created_at == cursor.created_at AND id < cursor.id).
    q = q.or(
      `created_at.lt.${input.cursor.created_at},and(created_at.eq.${input.cursor.created_at},id.lt.${input.cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) {
    // Surface a typed error to the caller; route.ts wraps it in a 500
    // and the SSR page falls back to an empty-state with a banner.
    throw new Error(`db_error: ${error.message}`);
  }

  const rows = (data ?? []) as DashboardClientRow[];

  // ── Owner enrichment, two-query pattern ──
  //
  // Step 1: pull owner tenant_members for the page's tenant ids. We use
  // `role='owner'` and pick one per client by oldest created_at (defensive
  // tiebreaker for the pathological multi-owner case — should not happen
  // in well-formed data).
  const tenantIds = rows.map((r) => r.id);
  const ownerByClient = new Map<string, string>(); // client_id -> user_id

  if (tenantIds.length > 0) {
    const { data: members } = await supabase
      .from('tenant_members')
      .select('client_id, user_id, created_at')
      .in('client_id', tenantIds)
      .eq('role', 'owner');

    const sorted = ([...(members ?? [])] as TenantMemberRow[]).sort((a, b) => {
      const at = a.created_at ?? '';
      const bt = b.created_at ?? '';
      return at.localeCompare(bt);
    });
    for (const m of sorted) {
      if (!ownerByClient.has(m.client_id)) {
        ownerByClient.set(m.client_id, m.user_id);
      }
    }
  }

  // Step 2: fetch emails for the unique owner user_ids via per-owner
  // getUserById lookups. We previously used listUsers({perPage:200})
  // which silently truncated past 200 auth users, causing owner_email
  // to come back null for any tenant whose owner sits past row 200 in
  // auth.users. Per-owner lookups bound the work to at most one call
  // per displayed-tenant owner (≤ limit, so ≤50 calls / page).
  const ownerUserIds = Array.from(new Set<string>(ownerByClient.values()));
  const emailByUserId = new Map<string, string>();
  if (ownerUserIds.length > 0) {
    const results = await Promise.all(
      ownerUserIds.map((id) =>
        supabase.auth.admin
          .getUserById(id)
          .then((res) => ({ id, email: res.data?.user?.email ?? null }))
          .catch(() => ({ id, email: null as string | null })),
      ),
    );
    for (const { id, email } of results) {
      if (email) emailByUserId.set(id, email);
    }
  }

  // ── Slice off the over-fetched row + shape response ──
  const slice = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const tenants: TenantsListItem[] = slice.map((row) => {
    const ownerUserId = ownerByClient.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      country: row.country,
      client_type: row.client_type,
      subscription_tier: row.subscription_tier,
      subscription_status: row.subscription_status,
      pilot_ends_at: row.pilot_ends_at,
      created_at: row.created_at,
      owner_email: ownerUserId ? (emailByUserId.get(ownerUserId) ?? null) : null,
    };
  });

  const last = slice[slice.length - 1];
  const next_cursor =
    hasMore && last
      ? encodeCursor({ created_at: last.created_at, id: last.id })
      : null;

  return {
    tenants,
    next_cursor,
    // total_estimate via pg_class.reltuples lands in Phase 3.
    total_estimate: null,
  };
}

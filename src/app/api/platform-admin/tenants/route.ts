// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Foundation Slice §1 + §3 — list endpoint.
//
//   GET /api/platform-admin/tenants
//     ?tier=...&status=...&country=...&q=...&cursor=...&limit=...
//
// Gates: 0..3 are enforced by withSuperAdmin (Gate 0 = path origin check,
// Gates 1..3 = auth + super-admin + service-role re-verify). This route
// performs NO mutation, so Gate 5 (audit FIRST) is intentionally skipped
// — read endpoints in this slice do not call logPlatformAction.
//
// Source of truth for the SQL projection + cursor codec + sanitiser:
//   src/lib/platform-admin/tenants-query.ts
//
// Why no audit on read: PLATFORM_ADMIN_PLAN.md §7 distinguishes
// mutations (must audit) from reads (free). A separate "platform admin
// viewed tenants list" log line is appealing but would balloon the
// audit table on every page hop. Phase 3 adds a structured-log line
// (no DB row) for read attribution.
// ----------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/platform-admin/guard';
import { createPlatformAdminServiceClient } from '@/lib/platform-admin/service-client';
import {
  queryTenants,
  decodeCursor,
  VALID_TIERS,
  VALID_STATUSES,
  VALID_COUNTRIES,
  type SubscriptionTier,
  type SubscriptionStatus,
  type TenantsListError,
  type TenantsListResponse,
} from '@/lib/platform-admin/tenants-query';

// Re-export the contract types from the route file too, per the design
// plan's "single source of truth" note. Consumers can import from
// either path; both resolve to the same symbols.
export type {
  SubscriptionTier,
  SubscriptionStatus,
  ClientType,
  Country,
  TenantsListItem,
  TenantsListResponse,
  TenantsListError,
} from '@/lib/platform-admin/tenants-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withSuperAdmin(async (req) => {
  const url = new URL(req.url);
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');
  const country = url.searchParams.get('country');
  const q = url.searchParams.get('q');
  const limitRaw = url.searchParams.get('limit');
  const cursorRaw = url.searchParams.get('cursor');

  // ── validate enums ──
  if (tier && !VALID_TIERS.has(tier as SubscriptionTier)) {
    return NextResponse.json<TenantsListError>(
      { error: 'invalid_tier', message: 'Unknown tier value' },
      { status: 400 },
    );
  }
  if (status && !VALID_STATUSES.has(status as SubscriptionStatus)) {
    return NextResponse.json<TenantsListError>(
      { error: 'invalid_status', message: 'Unknown status value' },
      { status: 400 },
    );
  }
  if (country && !VALID_COUNTRIES.has(country)) {
    return NextResponse.json<TenantsListError>(
      { error: 'invalid_country', message: 'Country must be UAE or KSA' },
      { status: 400 },
    );
  }

  // ── validate limit ──
  let limit = 25;
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return NextResponse.json<TenantsListError>(
        { error: 'invalid_limit', message: 'limit must be an integer 1..50' },
        { status: 400 },
      );
    }
    limit = n;
  }

  // ── validate cursor ──
  const cursor = decodeCursor(cursorRaw);
  if (cursor === 'invalid') {
    return NextResponse.json<TenantsListError>(
      { error: 'invalid_cursor', message: 'Cannot decode cursor' },
      { status: 400 },
    );
  }

  // ── run the query ──
  const supabase = createPlatformAdminServiceClient();
  try {
    const result: TenantsListResponse = await queryTenants(supabase, {
      tier: (tier as SubscriptionTier) ?? null,
      status: (status as SubscriptionStatus) ?? null,
      country: (country as 'UAE' | 'KSA') ?? null,
      q: q ?? null,
      cursor,
      limit,
    });
    return NextResponse.json<TenantsListResponse>(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // queryTenants() throws `invalid_cursor: <detail>` when the cursor
    // payload fails strict field validation (ISO timestamp + UUID). Map
    // to 400 rather than 500 so the SSR page and programmatic callers
    // can treat it as a recoverable bad input.
    if (message.startsWith('invalid_cursor')) {
      return NextResponse.json<TenantsListError>(
        { error: 'invalid_cursor', message },
        { status: 400 },
      );
    }
    return NextResponse.json<TenantsListError>(
      { error: 'db_error', message },
      { status: 500 },
    );
  }
});

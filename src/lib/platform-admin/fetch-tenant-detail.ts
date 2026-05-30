// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.4 — server-side
// loader for the tenant-detail RSC page.
//
// Identical query logic to GET /api/platform-admin/tenants/[id] (Deliv 2);
// extracted here so both surfaces share one projection and can never
// drift. The page imports this directly (avoiding the RSC→same-process-
// API double-hop antipattern that we already avoid in the tenants list).
//
// Service-role usage is OK in this file because:
//   * It lives under src/lib/platform-admin/, allow-listed by
//     scripts/check-no-service-role-leak.ts (§8.5 contract).
//   * The page that imports this is a server component under
//     (app)/platform-admin/** which is gated by the layout's
//     requireSuperAdminOptional() — so this loader never runs for
//     unauthenticated traffic.
//
// Owner email is enriched via per-owner getUserById() lookups (same
// pattern as tenants-query.ts) instead of listUsers({perPage:200}) which
// silently truncates past row 200.
//
// kyc_cases_30d is fetched defensively: the kyc_cases table may not
// exist in early pilots. We use Promise.allSettled and fall back to 0
// on failure so the page never 500s for a missing-table reason.
// ----------------------------------------------------------------------------

import { createPlatformAdminServiceClient } from './service-client';
import type {
  TenantDetail,
  TenantDetailResponse,
  TierChange,
  Invoice,
  TenantCounts,
} from './tenant-detail-types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Load the full tenant-detail payload by id. Returns null when the
 * tenant row doesn't exist (the page should call notFound()).
 *
 * Throws on DB error — callers should let Next surface error.tsx,
 * since a partial render of a tenant detail page is worse than a
 * full error boundary.
 */
export async function fetchTenantDetail(
  id: string,
): Promise<TenantDetailResponse | null> {
  const svc = createPlatformAdminServiceClient();

  // ── 1. Tenant row ─────────────────────────────────────────────────
  //
  // Schema-reality notes (verified against
  // anvira-backend/supabase/migrations/*):
  //
  //   * The canonical column is `regulatory_jurisdiction` (added in
  //     20260603000000_regulatory_jurisdiction.sql), exposed via
  //     PostgREST alias `jurisdiction:regulatory_jurisdiction` so the
  //     TenantDetail TS shape can stay friendly.
  //   * The canonical column is `wa_number` (the multi-number table at
  //     client_wa_numbers mirrors `is_primary=true` here), aliased to
  //     `wa_phone_number` for the same reason.
  //   * `dashboard_clients` has NO `updated_at` column — the table
  //     predates 20260519000000_realestate_pivot.sql's set_updated_at()
  //     trigger pattern. The detail page wants both timestamps for the
  //     overview tab; we fall back to `created_at` for `updated_at`
  //     below rather than 500-ing on a missing column.
  const { data: tenantRow, error: tenantErr } = await svc
    .from('dashboard_clients')
    .select(
      `id, slug, name, country, client_type,
       jurisdiction:regulatory_jurisdiction,
       business_timezone,
       wa_phone_number:wa_number,
       kyc_enabled,
       subscription_tier, subscription_status, pilot_ends_at,
       created_at, owner_id`,
    )
    .eq('id', id)
    .maybeSingle();

  if (tenantErr) {
    throw new Error(`fetchTenantDetail: ${tenantErr.message}`);
  }
  if (!tenantRow) return null;

  // ── 2. Owner email — single per-owner lookup, never listUsers() ──
  let owner_email: string | null = null;
  if (tenantRow.owner_id) {
    try {
      const { data: u } = await svc.auth.admin.getUserById(tenantRow.owner_id);
      owner_email = u?.user?.email ?? null;
    } catch {
      owner_email = null;
    }
  }

  // updated_at fallback — see schema-reality note above. dashboard_clients
  // has no updated_at column, so we mirror created_at to keep the type
  // contract honest while we wait on a future migration to add the column.
  const tenant: TenantDetail = {
    ...(tenantRow as Omit<TenantDetail, 'owner_email' | 'updated_at'>),
    owner_email,
    updated_at: (tenantRow as { created_at: string }).created_at,
  };

  // ── 3. Recent tier changes (last 10, newest first) ───────────────
  //
  // Schema-reality: subscription_tier_changes.created_at is the timestamp
  // column (per migration 20260618000000_platform_admin.sql §3.3). We
  // alias it to `changed_at` in the projection so the TierChange TS
  // shape stays UI-friendly (operators read this as "when the change
  // happened", not "when the row was created"). Also alias
  // downgrade_warning_acknowledged_text → acknowledged_text for the
  // same reason.
  const { data: changesData } = await svc
    .from('subscription_tier_changes')
    .select(
      `id,
       changed_at:created_at,
       from_tier, to_tier, from_status, to_status,
       actor_user_id, actor_email, reason, features_lost,
       acknowledged_text:downgrade_warning_acknowledged_text,
       request_id`,
    )
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  const recent_tier_changes: TierChange[] = (changesData ?? []) as TierChange[];

  // ── 4. Recent invoices (last 10, newest first) ───────────────────
  // The billing_invoices table is allowed to be empty during pilot —
  // we simply render the section without invoices.
  const { data: invoicesData } = await svc
    .from('billing_invoices')
    .select(
      `id, invoice_number, period_start, period_end, amount, currency,
       tax_amount, tax_rate, status, due_date, pdf_url, issued_at, paid_at`,
    )
    .eq('client_id', id)
    .order('issued_at', { ascending: false })
    .limit(10);

  const recent_invoices: Invoice[] = (invoicesData ?? []) as Invoice[];

  // ── 5. 30-day counts ─────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [agentsRes, convRes, leadsRes, kycRes] = await Promise.allSettled([
    svc
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id),
    svc
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)
      .gte('created_at', thirtyDaysAgo),
    svc
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)
      .gte('created_at', thirtyDaysAgo),
    svc
      .from('kyc_cases')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)
      .gte('created_at', thirtyDaysAgo),
  ]);

  const counts: TenantCounts = {
    agents:
      agentsRes.status === 'fulfilled' ? (agentsRes.value.count ?? 0) : 0,
    conversations_30d:
      convRes.status === 'fulfilled' ? (convRes.value.count ?? 0) : 0,
    leads_30d:
      leadsRes.status === 'fulfilled' ? (leadsRes.value.count ?? 0) : 0,
    // kyc_cases may not exist in early pilots — swallow silently
    kyc_cases_30d:
      kycRes.status === 'fulfilled' ? (kycRes.value.count ?? 0) : 0,
  };

  return { tenant, recent_tier_changes, recent_invoices, counts };
}

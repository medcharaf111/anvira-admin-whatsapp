// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.4 — tenant detail page.
//
// Server-rendered detail surface for a single tenant. Reached from the
// /platform-admin/tenants list by clicking any row. Auth is already
// handled by /(app)/platform-admin/layout.tsx (requireSuperAdminOptional
// + redirect), so this page performs NO additional guard.
//
// Data path — same rationale as the tenants list:
//   This page calls fetchTenantDetail() directly (which uses the
//   service-role client) instead of hopping through
//   GET /api/platform-admin/tenants/[id]. RSC→same-process-API in
//   Next.js is a known anti-pattern: extra serialisation, lost stack
//   traces, double auth work. The API route exists for the modal /
//   programmatic callers (Implementer B, Deliv 2); this page bypasses
//   it deliberately.
//
// Layout shape:
//   • Custom header (NOT PageHeader) so we can inline TierChip + StatusChip
//     next to the tenant name, plus a breadcrumb "← all tenants" link.
//   • <TenantActions/> client component wraps the tabs and owns the
//     ChangeTierModal open-state (so the header [تغيير الباقة] button
//     and the Subscription-tab "+ تغيير الباقة" button share one modal
//     instance via React context).
//   • <TenantDetailTabs/> renders Overview + Subscription bodies.
//
// notFound() is used when the tenant id doesn't resolve — the segment
// not-found.tsx at /(app)/platform-admin/not-found.tsx renders.
// ----------------------------------------------------------------------------

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TierChip } from '@/components/platform-admin/tier-chip';
import { StatusChip } from '@/components/platform-admin/status-chip';
import { TenantActions } from '@/components/platform-admin/tenant-actions';
import { TenantDetailTabs } from '@/components/platform-admin/tenant-detail-tabs';
import { fetchTenantDetail } from '@/lib/platform-admin/fetch-tenant-detail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Lightweight UUID shape check so a bare typo in the URL ("/tenants/foo")
// hits notFound() immediately instead of cascading into a DB error. The
// actual DB lookup is still authoritative — this is a fast-path.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TenantDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const data = await fetchTenantDetail(id);
  if (!data) {
    notFound();
  }

  const { tenant, recent_tier_changes, recent_invoices, counts } = data;

  return (
    <div dir="rtl" className="page-shell">
      {/* Breadcrumb — keeps the platform-admin frame obvious. The arrow
          flips physically (rtl:rotate-180) so it always points "back". */}
      <Link
        href="/platform-admin/tenants"
        className="inline-flex items-center gap-2 text-xs mb-6 link-anim"
        style={{ color: 'var(--ink-soft)' }}
      >
        <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden />
        <span>كل المستأجِرين · ALL TENANTS</span>
      </Link>

      {/* Custom header — name + chips inline, no PageHeader because
          PageHeader doesn't expose a slot for inline pill chips next
          to the H1 (and we want tier/status visible above the fold). */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="eyebrow">TENANT · مستأجِر</span>
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1
              className="display-ar text-[1.75rem] sm:text-[2rem] tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {tenant.name}
            </h1>
            <TierChip tier={tenant.subscription_tier} />
            <StatusChip status={tenant.subscription_status} />
          </div>
          <div
            dir="ltr"
            className="shrink-0"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--ink-faint)',
            }}
          >
            {tenant.slug}
          </div>
        </div>
        <div className="hair-rule mt-6" />
      </header>

      {/* TenantActions owns the ChangeTierModal state and renders the
          two header action buttons (Change Tier + Impersonate). It
          also publishes openChangeTier() to the tabs subtree via
          context so the Subscription tab's timeline button reuses it. */}
      <TenantActions tenant={tenant}>
        <TenantDetailTabs
          tenant={tenant}
          counts={counts}
          recentTierChanges={recent_tier_changes}
          recentInvoices={recent_invoices}
        />
      </TenantActions>
    </div>
  );
}

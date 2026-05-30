'use client';

// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.4 — tabbed body for
// the tenant-detail page.
//
// Two tabs (Overview / Subscription) rendered as a controlled tab list.
// Pure client component — owns only the tab-active piece of UI state.
// All data is server-rendered into props by the parent RSC page.
//
// The Subscription tab's "+ تغيير الباقة" timeline button calls
// useOpenChangeTier() from <TenantActions/>'s context so it reuses the
// same modal instance the header button opens. No second useState dialog.
//
// AnimatePresence cross-fades between tabs the same way the existing
// detail surfaces in the app do (mode="wait", short y-shift); the
// 0.18s + cubic-bezier(0.22, 1, 0.36, 1) timing matches the rest of
// the admin's motion vocabulary.
//
// Date formatting policy:
//   * Timestamps that are part of an audit trail (tier change timestamps,
//     invoice issue dates) stay LTR + monospace + en-GB so the admin can
//     read them at a glance and copy/paste into a ticket without RTL
//     mojibake.
//   * Human-prose timestamps (created/updated/pilot-ends in the Overview
//     "what is this tenant" table) render in ar-AE so they read naturally
//     inside the Arabic two-column layout.
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { TierChip } from './tier-chip';
import { StatusChip } from './status-chip';
import { useOpenChangeTier } from './tenant-actions';
import type {
  TenantDetail,
  TenantCounts,
  TierChange,
  Invoice,
} from '@/lib/platform-admin/tenant-detail-types';

type Tab = 'overview' | 'subscription';

const TAB_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

// Audit-trail date formatter — LTR mono, en-GB so the admin can paste
// "30/05/2026, 14:23:01" into a Linear issue without surprises.
const AUDIT_DT_FMT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Dubai',
});

// Human-prose date formatter for the Overview metadata column.
const HUMAN_DT_FMT = new Intl.DateTimeFormat('ar-AE', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const AUDIT_DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Dubai',
});

function fmtAuditDt(iso: string): string {
  return AUDIT_DT_FMT.format(new Date(iso));
}
function fmtAuditDate(iso: string): string {
  return AUDIT_DATE_FMT.format(new Date(iso));
}
function fmtHumanDt(iso: string | null): string {
  if (!iso) return '—';
  return HUMAN_DT_FMT.format(new Date(iso));
}

const CLIENT_TYPE_LABEL_AR: Record<TenantDetail['client_type'], string> = {
  real_estate: 'عقارات',
  clinic: 'عيادة',
  salon: 'صالون',
};

// ───── Top-level component ─────

export function TenantDetailTabs({
  tenant,
  counts,
  recentTierChanges,
  recentInvoices,
}: {
  tenant: TenantDetail;
  counts: TenantCounts;
  recentTierChanges: TierChange[];
  recentInvoices: Invoice[];
}) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div>
      <TabBar tab={tab} onChange={setTab} />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={TAB_TRANSITION}
        >
          {tab === 'overview' && (
            <OverviewTab tenant={tenant} counts={counts} />
          )}
          {tab === 'subscription' && (
            <SubscriptionTab
              changes={recentTierChanges}
              invoices={recentInvoices}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ───── Tab bar ─────

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="أقسام المستأجِر"
      className="flex gap-1 mb-6"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <TabPill
        active={tab === 'overview'}
        onClick={() => onChange('overview')}
        labelAr="نظرة عامة"
        labelEn="OVERVIEW"
      />
      <TabPill
        active={tab === 'subscription'}
        onClick={() => onChange('subscription')}
        labelAr="تاريخ الاشتراك"
        labelEn="SUBSCRIPTION"
      />
    </div>
  );
}

function TabPill({
  active,
  onClick,
  labelAr,
  labelEn,
}: {
  active: boolean;
  onClick: () => void;
  labelAr: string;
  labelEn: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-baseline gap-2 px-4 py-2.5 text-sm transition-colors"
      style={{
        background: active ? 'var(--paper-sink)' : 'transparent',
        border: active ? '1px solid var(--rule)' : '1px solid transparent',
        borderBottom: 'none',
        color: active ? 'var(--ink)' : 'var(--ink-soft)',
        borderRadius: '4px 4px 0 0',
        marginBottom: '-1px',
      }}
    >
      <span>{labelAr}</span>
      <span
        dir="ltr"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6875rem',
          letterSpacing: '0.08em',
          color: 'var(--ink-faint)',
        }}
      >
        {labelEn}
      </span>
    </button>
  );
}

// ───── Overview tab ─────

function OverviewTab({
  tenant,
  counts,
}: {
  tenant: TenantDetail;
  counts: TenantCounts;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    [
      'المعرف الفريد (slug)',
      <span
        key="slug"
        dir="ltr"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
      >
        {tenant.slug}
      </span>,
    ],
    [
      'المالك',
      tenant.owner_email ? (
        <span
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
        >
          {tenant.owner_email}
        </span>
      ) : (
        <span style={{ color: 'var(--ink-faint)' }}>—</span>
      ),
    ],
    [
      'الدولة',
      tenant.country ? (
        <span dir="ltr" style={{ fontFamily: 'var(--font-mono)' }}>
          {tenant.country}
        </span>
      ) : (
        <span style={{ color: 'var(--ink-faint)' }}>—</span>
      ),
    ],
    [
      'الولاية القضائية',
      tenant.jurisdiction ? (
        <span dir="ltr" style={{ fontFamily: 'var(--font-mono)' }}>
          {tenant.jurisdiction}
        </span>
      ) : (
        <span style={{ color: 'var(--ink-faint)' }}>—</span>
      ),
    ],
    ['نوع العميل', CLIENT_TYPE_LABEL_AR[tenant.client_type]],
    [
      'المنطقة الزمنية',
      tenant.business_timezone ? (
        <span dir="ltr" style={{ fontFamily: 'var(--font-mono)' }}>
          {tenant.business_timezone}
        </span>
      ) : (
        <span style={{ color: 'var(--ink-faint)' }}>—</span>
      ),
    ],
    ['التحقق من الهوية (KYC)', tenant.kyc_enabled ? 'مفعّل' : 'غير مفعّل'],
    [
      'رقم واتساب',
      tenant.wa_phone_number ? (
        <span dir="ltr" style={{ fontFamily: 'var(--font-mono)' }}>
          {tenant.wa_phone_number}
        </span>
      ) : (
        <span style={{ color: 'var(--ink-faint)' }}>—</span>
      ),
    ],
    ['نهاية الفترة التجريبية', fmtHumanDt(tenant.pilot_ends_at)],
    ['تاريخ الإنشاء', fmtHumanDt(tenant.created_at)],
    ['آخر تعديل', fmtHumanDt(tenant.updated_at)],
  ];

  return (
    <div className="space-y-8">
      {/* Metadata table — single column on mobile, two on md+ */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="eyebrow">METADATA · بيانات المستأجِر</span>
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-0 panel">
          {rows.map(([label, value], idx) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 px-5 py-3.5"
              style={{
                // Hairline rule between rows; skip on the very last row
                // of each column for visual cleanliness.
                borderBottom:
                  idx < rows.length - 2 ? '1px solid var(--rule-soft)' : 'none',
              }}
            >
              <span
                className="text-xs shrink-0"
                style={{ color: 'var(--ink-faint)' }}
              >
                {label}
              </span>
              <span
                className="text-sm text-end min-w-0"
                style={{ color: 'var(--ink)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 30-day rollup counts */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="eyebrow">USAGE · النشاط (آخر ٣٠ يوماً)</span>
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CountCard label="الوكلاء" labelEn="AGENTS" value={counts.agents} />
          <CountCard
            label="المحادثات"
            labelEn="CONVERSATIONS"
            value={counts.conversations_30d}
          />
          <CountCard
            label="العملاء المحتملون"
            labelEn="LEADS"
            value={counts.leads_30d}
          />
          <CountCard
            label="حالات الـKYC"
            labelEn="KYC CASES"
            value={counts.kyc_cases_30d}
          />
        </div>
      </section>
    </div>
  );
}

function CountCard({
  label,
  labelEn,
  value,
}: {
  label: string;
  labelEn: string;
  value: number;
}) {
  return (
    <div
      className="p-4"
      style={{
        background: 'var(--paper-sink)',
        border: '1px solid var(--rule)',
        borderRadius: '4px',
      }}
    >
      <div
        className="text-xs mb-1"
        style={{ color: 'var(--ink-faint)' }}
      >
        {label}
      </div>
      <div
        dir="ltr"
        className="mb-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.625rem',
          letterSpacing: '0.08em',
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
        }}
      >
        {labelEn}
      </div>
      <div
        dir="ltr"
        style={{
          fontSize: '1.75rem',
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.toLocaleString('en-US')}
      </div>
    </div>
  );
}

// ───── Subscription tab ─────

function SubscriptionTab({
  changes,
  invoices,
}: {
  changes: TierChange[];
  invoices: Invoice[];
}) {
  const openChangeTier = useOpenChangeTier();

  return (
    <div className="space-y-10">
      {/* Tier change timeline */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="eyebrow">TIER HISTORY · تاريخ تغييرات الباقة</span>
            <span
              className="h-px flex-1 max-w-[120px]"
              style={{ background: 'var(--rule)' }}
            />
          </div>
          <button
            type="button"
            onClick={openChangeTier}
            className="btn-ghost inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            <span>تغيير الباقة</span>
          </button>
        </div>

        {changes.length === 0 ? (
          <div
            className="panel px-5 py-10 text-center"
            style={{ color: 'var(--ink-faint)', fontSize: '0.875rem' }}
          >
            لا توجد تغييرات سابقة لهذا المستأجِر.
          </div>
        ) : (
          <ol className="panel" style={{ overflow: 'hidden' }}>
            {changes.map((c, idx) => (
              <li
                key={c.id}
                className="px-5 py-4"
                style={{
                  borderBottom:
                    idx < changes.length - 1
                      ? '1px solid var(--rule-soft)'
                      : 'none',
                }}
              >
                {/* Row 1: from → to chips + timestamp */}
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  {c.from_tier ? (
                    <TierChip tier={c.from_tier} />
                  ) : (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      —
                    </span>
                  )}
                  <span style={{ color: 'var(--ink-faint)' }} aria-hidden>
                    ←
                  </span>
                  <TierChip tier={c.to_tier} />
                  {c.to_status && <StatusChip status={c.to_status} />}
                  <span
                    dir="ltr"
                    className="ms-auto"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {fmtAuditDt(c.changed_at)}
                  </span>
                </div>

                {/* Row 2: actor */}
                {c.actor_email && (
                  <div
                    dir="ltr"
                    className="mb-1"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    by {c.actor_email}
                  </div>
                )}

                {/* Row 3: reason */}
                {c.reason && (
                  <div
                    className="text-sm mt-1"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    <span style={{ color: 'var(--ink-faint)' }}>السبب: </span>
                    {c.reason}
                  </div>
                )}

                {/* Row 4: features lost (if any) */}
                {c.features_lost && c.features_lost.length > 0 && (
                  <div
                    className="text-xs mt-2 inline-flex items-baseline gap-2 flex-wrap"
                    style={{ color: 'var(--warn)' }}
                  >
                    <span>الميزات المفقودة:</span>
                    {c.features_lost.map((f) => (
                      <span
                        key={f}
                        dir="ltr"
                        className="px-1.5 py-0.5"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.6875rem',
                          background: 'var(--warn-soft)',
                          border: '1px solid var(--warn)',
                          borderRadius: '3px',
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Invoices (Phase-3 surface; rendered only when rows exist) */}
      {invoices.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="eyebrow">INVOICES · الفواتير الأخيرة</span>
            <span
              className="h-px flex-1 max-w-[120px]"
              style={{ background: 'var(--rule)' }}
            />
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div
              className="grid items-center px-5 py-3"
              style={{
                gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 0.6fr',
                gap: '1rem',
                borderBottom: '1px solid var(--rule)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              <div>INVOICE</div>
              <div>ISSUED</div>
              <div>PERIOD</div>
              <div>AMOUNT</div>
              <div>STATUS</div>
            </div>
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                className="grid items-center px-5 py-3.5"
                style={{
                  gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 0.6fr',
                  gap: '1rem',
                  borderBottom:
                    idx < invoices.length - 1
                      ? '1px solid var(--rule-soft)'
                      : 'none',
                }}
              >
                <div
                  dir="ltr"
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                  }}
                >
                  {inv.pdf_url ? (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-anim"
                      style={{ color: 'var(--primary-glow)' }}
                    >
                      {inv.invoice_number}
                    </a>
                  ) : (
                    inv.invoice_number
                  )}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--ink-soft)',
                  }}
                >
                  {fmtAuditDate(inv.issued_at)}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--ink-soft)',
                  }}
                >
                  {fmtAuditDate(inv.period_start)} → {fmtAuditDate(inv.period_end)}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inv.amount} {inv.currency}
                </div>
                <div>
                  <InvoiceStatusChip status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InvoiceStatusChip({ status }: { status: Invoice['status'] }) {
  const variant =
    status === 'paid'
      ? 'pill-success'
      : status === 'void'
        ? 'pill-signal'
        : 'pill-warn';
  const label =
    status === 'paid' ? 'مدفوعة' : status === 'void' ? 'ملغاة' : 'صادرة';
  return (
    <span className={`pill ${variant}`}>
      <span className="pill-dot" />
      <span>{label}</span>
    </span>
  );
}

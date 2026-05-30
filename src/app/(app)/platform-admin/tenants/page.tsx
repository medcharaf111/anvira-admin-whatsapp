// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Foundation Slice §5 — tenants list page.
//
// Server-rendered cross-tenant directory for super-admins. The page goes
// straight to the service-role client via the shared queryTenants() helper
// rather than hop through our own /api/platform-admin/tenants endpoint —
// double-hopping from RSC to a same-process route is a known Next.js
// anti-pattern (extra serialisation, lost stack traces, doubled auth work).
//
// The /platform-admin/layout.tsx wrapper already enforced super-admin via
// requireSuperAdminOptional(), so this page does NOT re-check the guard.
// That keeps a single concentration of the 6-gate dance on the layout.
//
// Filters are URL-driven (?tier=&status=&country=&q=&cursor=) so deep-
// links, browser back/forward, and shareable filtered views work without
// any client-side JS. The filter bar is a plain <form method="GET">.
//
// Pagination is keyset (created_at DESC, id DESC) via the opaque base64
// cursor minted by queryTenants(). The "next" link carries the cursor
// alongside the active filters so the cursor never escapes its filter
// context.
//
// Each row links to /platform-admin/tenants/[id] — that detail page does
// NOT exist yet (ships in the next slice). The plan acknowledges this: a
// 404 on click is the expected interim state.
// ----------------------------------------------------------------------------

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { TierChip } from '@/components/platform-admin/tier-chip';
import { StatusChip } from '@/components/platform-admin/status-chip';
import { createPlatformAdminServiceClient } from '@/lib/platform-admin/service-client';
import {
  queryTenants,
  decodeCursor,
  VALID_TIERS,
  VALID_STATUSES,
  VALID_COUNTRIES,
} from '@/lib/platform-admin/tenants-query';
import type {
  TenantsListResponse,
  SubscriptionTier,
  SubscriptionStatus,
} from '@/app/api/platform-admin/tenants/route';

export const dynamic = 'force-dynamic';

interface SearchParams {
  tier?: string;
  status?: string;
  country?: string;
  q?: string;
  cursor?: string;
}

// Grid template kept identical between header and body rows so the
// columns line up. Width ratios: TENANT (name+slug) > OWNER > COUNTRY
// > TIER > STATUS > PILOT ENDS > CREATED.
const GRID_TEMPLATE = '1.4fr 1.4fr 0.7fr 0.9fr 0.9fr 1fr 0.8fr';

// Format an ISO timestamp as YYYY-MM-DD in Dubai (UTC+4). Using
// toISOString().slice(0,10) would render a tenant created at 03:00
// Dubai on 2026-06-15 (= 23:00 UTC on 2026-06-14) as "2026-06-14",
// which is wrong for our UAE/KSA operator audience. en-CA gives us
// the YYYY-MM-DD shape we want without locale fiddling.
const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dubai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return DATE_FMT.format(new Date(iso));
}

interface NormalisedParams {
  tier: SubscriptionTier | null;
  status: SubscriptionStatus | null;
  country: 'UAE' | 'KSA' | null;
  q: string | null;
  cursor: ReturnType<typeof decodeCursor>;
}

/**
 * Coerce raw URLSearchParam strings into the typed enums queryTenants()
 * expects. Invalid values are dropped silently so a hand-edited URL
 * doesn't 500 the page — the filter bar will surface the empty result
 * and the user can re-pick from the dropdowns.
 *
 * The API endpoint (/api/platform-admin/tenants) DOES 400 on invalid
 * filters because programmatic callers should learn about typos; the
 * SSR page intentionally degrades gracefully for the human case.
 */
function normaliseParams(raw: SearchParams): NormalisedParams {
  const tier =
    raw.tier && VALID_TIERS.has(raw.tier as SubscriptionTier)
      ? (raw.tier as SubscriptionTier)
      : null;
  const status =
    raw.status && VALID_STATUSES.has(raw.status as SubscriptionStatus)
      ? (raw.status as SubscriptionStatus)
      : null;
  const country =
    raw.country && VALID_COUNTRIES.has(raw.country)
      ? (raw.country as 'UAE' | 'KSA')
      : null;
  const q = raw.q?.trim() ? raw.q.trim() : null;
  const cursor = decodeCursor(raw.cursor ?? null);
  return { tier, status, country, q, cursor };
}

/**
 * Build the URLSearchParams object for the "next page" link so we
 * preserve every active filter while appending the cursor. Skips
 * empty values so we don't render `?tier=&status=&...` clutter.
 */
function buildNextQuery(
  raw: SearchParams,
  nextCursor: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw.tier) out.tier = raw.tier;
  if (raw.status) out.status = raw.status;
  if (raw.country) out.country = raw.country;
  if (raw.q) out.q = raw.q;
  out.cursor = nextCursor;
  return out;
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const params = normaliseParams(raw);

  // ── Data load ──
  // If queryTenants throws (DB outage, bad migration state), surface
  // an empty-state with a banner rather than crashing the route — a
  // super-admin should always be able to load the page enough to see
  // what's wrong and reach the audit log.
  let result: TenantsListResponse = {
    tenants: [],
    next_cursor: null,
    total_estimate: null,
  };
  let loadError: string | null = null;

  // decodeCursor returns 'invalid' if the cursor body was corrupted by
  // hand-editing. We treat it as "start from page 1" rather than 500.
  const cursorForQuery = params.cursor === 'invalid' ? null : params.cursor;

  try {
    const svc = createPlatformAdminServiceClient();
    result = await queryTenants(svc, {
      tier: params.tier,
      status: params.status,
      country: params.country,
      q: params.q,
      cursor: cursorForQuery,
      limit: 25,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'unknown_error';
  }

  const { tenants, next_cursor } = result;

  // Subtitle composition — count, filter state hint, pagination hint.
  const activeFilterCount =
    (params.tier ? 1 : 0) +
    (params.status ? 1 : 0) +
    (params.country ? 1 : 0) +
    (params.q ? 1 : 0);
  const subtitleParts: string[] = [`${tenants.length} مستأجر معروض`];
  if (activeFilterCount > 0) subtitleParts.push(`${activeFilterCount} فلتر نشط`);
  if (next_cursor) subtitleParts.push('توجد صفحات إضافية');
  const subtitle = subtitleParts.join(' · ');

  return (
    <div dir="rtl" className="page-shell">
      <PageHeader
        eyebrow="TENANTS"
        title="المستأجِرون"
        subtitle={subtitle}
      />

      <TenantsFilterBar current={raw} />

      {loadError && (
        <div
          className="mt-4 p-4 text-sm"
          style={{
            background: 'var(--signal-soft)',
            border: '1px solid var(--signal)',
            color: 'var(--signal)',
            borderRadius: '3px',
          }}
        >
          فشل تحميل قائمة المستأجِرين.
          <span
            dir="ltr"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              marginInlineStart: '0.5rem',
            }}
          >
            {loadError}
          </span>
        </div>
      )}

      <div className="panel mt-4 overflow-hidden">
        {/* Column headers — uppercase mono per the eyebrow convention. */}
        <div
          className="grid items-center px-4 py-3"
          style={{
            gridTemplateColumns: GRID_TEMPLATE,
            gap: '1.25rem',
            borderBottom: '1px solid var(--rule)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          <div>TENANT</div>
          <div>OWNER</div>
          <div>COUNTRY</div>
          <div>TIER</div>
          <div>STATUS</div>
          <div>PILOT ENDS</div>
          <div>CREATED</div>
        </div>

        {tenants.length === 0 && !loadError && (
          <div
            className="px-4 py-12 text-center"
            style={{ color: 'var(--ink-faint)', fontSize: '0.875rem' }}
          >
            {activeFilterCount > 0
              ? 'لا يوجد مستأجرون مطابقون للفلترة الحالية. جرّب توسيع المعايير.'
              : 'لا يوجد مستأجرون بعد.'}
          </div>
        )}

        {tenants.map((t) => (
          <Link
            key={t.id}
            href={`/platform-admin/tenants/${t.id}`}
            className="grid items-center px-4 py-4 row-hover"
            style={{
              gridTemplateColumns: GRID_TEMPLATE,
              gap: '1.25rem',
              borderBottom: '1px solid var(--rule-soft)',
              textDecoration: 'none',
            }}
          >
            {/* TENANT — Arabic name on top, mono slug below */}
            <div className="min-w-0">
              <div
                className="truncate"
                style={{ color: 'var(--ink)', fontWeight: 500, fontSize: '0.9375rem' }}
              >
                {t.name}
              </div>
              <div
                className="truncate"
                dir="ltr"
                style={{
                  color: 'var(--ink-faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  marginTop: '0.125rem',
                }}
              >
                {t.slug}
              </div>
            </div>

            {/* OWNER — email is LTR-locked mono island */}
            <div
              className="truncate"
              dir="ltr"
              style={{
                color: t.owner_email ? 'var(--ink-soft)' : 'var(--ink-faint)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
              }}
            >
              {t.owner_email ?? '—'}
            </div>

            {/* COUNTRY — short uppercase code, mono */}
            <div
              dir="ltr"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: t.country ? 'var(--ink)' : 'var(--ink-faint)',
                letterSpacing: '0.05em',
              }}
            >
              {t.country ?? '—'}
            </div>

            <div>
              <TierChip tier={t.subscription_tier} />
            </div>

            <div>
              <StatusChip status={t.subscription_status} />
            </div>

            {/* PILOT ENDS — YYYY-MM-DD in Asia/Dubai, LTR mono. */}
            <div
              dir="ltr"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: t.pilot_ends_at ? 'var(--ink-soft)' : 'var(--ink-faint)',
              }}
            >
              {formatDate(t.pilot_ends_at)}
            </div>

            {/* CREATED — YYYY-MM-DD in Asia/Dubai, LTR mono. */}
            <div
              dir="ltr"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--ink-faint)',
              }}
            >
              {formatDate(t.created_at)}
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination — single "next page" link in keyset style. The
          design plan deliberately ships only next/forward; prev is
          unreliable with keyset pagination and ships in Phase 3. */}
      {next_cursor && (
        <div className="flex justify-start mt-6">
          <Link
            href={{
              pathname: '/platform-admin/tenants',
              query: buildNextQuery(raw, next_cursor),
            }}
            className="btn-ghost"
          >
            الصفحة التالية ←
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Plain HTML <form method="GET"> filter bar. No client JS — submitting
 * re-renders this server component with the new searchParams.
 *
 * The form intentionally does NOT carry the `cursor` field: any time
 * the user changes filters we want to reset to page 1, and omitting
 * `cursor` from the submitted form achieves exactly that.
 */
function TenantsFilterBar({ current }: { current: SearchParams }) {
  return (
    <form
      method="GET"
      className="panel-sunken mt-4 px-4 py-4"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1.6fr) repeat(3, minmax(140px, 1fr)) auto',
        gap: '0.875rem',
        alignItems: 'end',
      }}
    >
      <label className="block">
        <span className="field-label">بحث · NAME OR SLUG</span>
        <input
          type="text"
          name="q"
          defaultValue={current.q ?? ''}
          placeholder="الاسم أو الـslug…"
          className="input-boxed w-full"
        />
      </label>

      <label className="block">
        <span className="field-label">الباقة · TIER</span>
        <select
          name="tier"
          defaultValue={current.tier ?? ''}
          className="input-boxed w-full"
        >
          <option value="">— الكل —</option>
          <option value="pilot">تجريبي</option>
          <option value="team">فريق</option>
          <option value="brokerage">وساطة</option>
          <option value="enterprise">مؤسّسي</option>
          <option value="grandfather">مُورَّث</option>
          <option value="suspended">موقوف</option>
        </select>
      </label>

      <label className="block">
        <span className="field-label">الحالة · STATUS</span>
        <select
          name="status"
          defaultValue={current.status ?? ''}
          className="input-boxed w-full"
        >
          <option value="">— الكل —</option>
          <option value="pilot">تجريبي</option>
          <option value="trialing">تحت التجربة</option>
          <option value="active">نشط</option>
          <option value="past_due">متأخر</option>
          <option value="suspended">موقوف</option>
          <option value="cancelled">ملغى</option>
        </select>
      </label>

      <label className="block">
        <span className="field-label">الدولة · COUNTRY</span>
        <select
          name="country"
          defaultValue={current.country ?? ''}
          className="input-boxed w-full"
        >
          <option value="">— الكل —</option>
          <option value="UAE">UAE</option>
          <option value="KSA">KSA</option>
        </select>
      </label>

      <button type="submit" className="btn-primary">
        تطبيق
      </button>
    </form>
  );
}

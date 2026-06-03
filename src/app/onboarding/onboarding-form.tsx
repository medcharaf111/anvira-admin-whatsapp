'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { GULF_TIMEZONES } from '@/lib/timezones';

const TIMEZONES = GULF_TIMEZONES.map((tz) => ({
  value: tz.iana,
  label: `${tz.label} · ${tz.utcOffset}`,
}));

const LANGUAGES = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

// Country + jurisdiction selection. UAE and KSA are both visible primary
// choices so a Saudi broker is not buried in a dropdown — but KSA stays
// hard-gated to the waitlist per KSA_ADAPTATION_PLAN.md §1 (the REGA/SAFIU
// path isn't shipped yet). DIFC/ADGM are blocked under UAE for distinct
// DP-law reasons until v1.5.
type Country = 'UAE' | 'KSA';
type Jurisdiction =
  | 'uae_mainland'
  | 'ksa_mainland'
  | 'difc'
  | 'adgm'
  | 'other';

const COUNTRY_OPTIONS: Array<{ value: Country; label_ar: string; label_en: string; supported: boolean }> = [
  { value: 'UAE', label_ar: 'الإمارات', label_en: 'United Arab Emirates', supported: true },
  { value: 'KSA', label_ar: 'السعودية', label_en: 'Saudi Arabia', supported: false },
];

// Sub-jurisdictions filtered per country. Only uae_mainland is currently
// onboardable end-to-end; everything else routes to a waitlist insert.
const JURISDICTIONS_BY_COUNTRY: Record<Country, Array<{ value: Jurisdiction; label: string; blocked: boolean }>> = {
  UAE: [
    { value: 'uae_mainland', label: 'UAE — Mainland (مكتب في الإمارات، خارج المناطق الحرة)', blocked: false },
    { value: 'difc', label: 'UAE — DIFC (Dubai International Financial Centre)', blocked: true },
    { value: 'adgm', label: 'UAE — ADGM (Abu Dhabi Global Market)', blocked: true },
    { value: 'other', label: 'Other / Else (مكتب خارج التصنيفات أعلاه)', blocked: true },
  ],
  KSA: [
    { value: 'ksa_mainland', label: 'KSA — Mainland (مكتب في المملكة العربية السعودية)', blocked: true },
  ],
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [language, setLanguage] = useState('ar');
  const [country, setCountry] = useState<Country>('UAE');
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('uae_mainland');

  // When the broker switches country, snap jurisdiction to the first option
  // for that country so the form never holds an inconsistent (country, jurisdiction)
  // pair across renders (e.g. country=KSA + jurisdiction=uae_mainland).
  function handleCountryChange(c: Country) {
    setCountry(c);
    const first = JURISDICTIONS_BY_COUNTRY[c][0];
    setJurisdiction(first.value);
  }

  const currentJurisdictions = JURISDICTIONS_BY_COUNTRY[country];
  const currentJurisdiction = currentJurisdictions.find((j) => j.value === jurisdiction)
    ?? currentJurisdictions[0];
  // PDPL + legal-posture addendum: brokerage administrator must accept
  // the Terms of Service + Privacy Policy before account creation. The
  // server-side route writes the acceptance into audit_log (action=
  // 'onboarding.tos_accepted') so the consent is timestamped and tied
  // to the actor user, which is what a regulator would ask for.
  const [acceptedTos, setAcceptedTos] = useState(false);
  // Slice 4 / Architect Brief §1.11 — license capture as an AUDIT RECORD.
  // SOFT: only the UAE-mainland real-estate flow surfaces these inputs, and
  // even there they are non-blocking (empty submit still creates the tenant).
  // KSA / DIFC / ADGM / 'other' never reach the create-tenant branch so
  // they don't see these inputs at all.
  const [reraPermitNumber, setReraPermitNumber] = useState('');
  const [responsibleBrokerName, setResponsibleBrokerName] = useState('');
  const [tradeLicenceNumber, setTradeLicenceNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name
  function handleNameChange(v: string) {
    setName(v);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(v));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    // KSA + DIFC + ADGM + other are blocked at signup per the legal-posture
    // addendum + KSA_ADAPTATION_PLAN.md §1. Client-side guard mirrors a
    // server-side check in the onboarding route so a curl-savvy operator
    // can't bypass it.
    if (currentJurisdiction.blocked) {
      setError(
        jurisdiction === 'ksa_mainland'
          ? 'لا ندعم حالياً المكاتب التي تعمل ضمن الإطار التنظيمي السعودي (REGA). ' +
              'سجّلناك في قائمة انتظار السعودية — راسلنا على legal@anviraplus.it.com لنُعلمك عند الإطلاق.'
          : 'لا ندعم حالياً المكاتب المسجّلة في DIFC / ADGM أو خارج الإمارات المنطقة الرئيسية. ' +
              'انضم لقائمة الانتظار: legal@anviraplus.it.com'
      );
      return;
    }

    if (!acceptedTos) {
      setError('يرجى الموافقة على شروط الخدمة وسياسة الخصوصية للمتابعة');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          timezone,
          language,
          regulatory_jurisdiction: jurisdiction,
          // Per legal-posture addendum — server logs this as an
          // audit_log row tied to the actor user + IP.
          tos_accepted_at: new Date().toISOString(),
          // Slice 4 / Architect Brief §1.11 — license capture as a SOFT
          // audit record. Empty strings sent through as null so the server
          // can decide whether to arm license_captured_at + the
          // 'onboarding.license.captured' audit row.
          rera_permit_number: reraPermitNumber.trim() || null,
          responsible_broker_name: responsibleBrokerName.trim() || null,
          trade_licence_number: tradeLicenceNumber.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'failed');
      router.push('/conversations');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="field-label">اسم العمل</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="مثلاً: عيادة الأمل للأسنان"
          required
          maxLength={80}
          className="input-boxed"
        />
      </div>

      <div>
        <label className="field-label">المعرّف (Slug)</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          placeholder="marina-realty"
          required
          dir="ltr"
          className="input-boxed text-left"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
          يُستخدم في الروابط الداخلية. أحرف إنجليزية وأرقام فقط.
        </p>
      </div>

      <div>
        <label className="field-label">المنطقة الزمنية</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="input-boxed"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label">اللغة الأساسية</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="input-boxed"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Country (UAE / KSA) is the primary regulatory decision and gets its
          own visible step. UAE is fully supported today; KSA is a waitlist
          flow per KSA_ADAPTATION_PLAN.md §1 — the broker still progresses
          through the form, but submit triggers a ksa_waitlist insert + 403
          rather than a tenant creation, with honest copy explaining why. */}
      <div>
        <label className="field-label">الدولة · Country</label>
        <div className="grid grid-cols-2 gap-2">
          {COUNTRY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => handleCountryChange(c.value)}
              aria-pressed={country === c.value}
              className="h-12 px-4 text-[13px] transition-all relative"
              style={{
                background:
                  country === c.value ? 'var(--ink)' : 'var(--paper-sink)',
                color: country === c.value ? 'var(--paper)' : 'var(--ink-soft)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
              }}
            >
              <span dir="rtl">{c.label_ar}</span>
              <span className="mx-2" style={{ opacity: 0.5 }}>·</span>
              <span dir="ltr">{c.label_en}</span>
              {!c.supported && (
                <span
                  className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5"
                  style={{
                    background: 'color-mix(in srgb, var(--warn, #b6852b) 25%, transparent)',
                    color: country === c.value ? 'var(--paper)' : 'var(--ink-soft)',
                    borderRadius: '2px',
                    letterSpacing: '0.05em',
                  }}
                  dir="rtl"
                >
                  قائمة انتظار
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }} dir="rtl">
          {country === 'KSA'
            ? 'إصدار Anvira الحالي مصمَّم للإمارات. مسار السعودية (REGA / SAFIU) قيد الإعداد — التسجيل هنا يُسجّلك في قائمة الانتظار.'
            : 'إصدار Anvira الحالي يدعم الإمارات المنطقة الرئيسية. الإمارات المناطق الحرة (DIFC / ADGM) قائمة انتظار.'}
        </p>
      </div>

      <div>
        <label className="field-label">الاختصاص التنظيمي · Regulatory jurisdiction</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
          className="input-boxed"
        >
          {currentJurisdictions.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
              {j.blocked ? ' — (غير مدعوم حالياً)' : ''}
            </option>
          ))}
        </select>
        {currentJurisdiction.blocked && (
          <div
            className="mt-2 p-3 text-[11px] leading-relaxed"
            style={{
              background: 'color-mix(in srgb, var(--warn, #b6852b) 12%, var(--paper-sink))',
              border: '1px solid color-mix(in srgb, var(--warn, #b6852b) 40%, var(--rule))',
              borderRadius: '3px',
              color: 'var(--ink-soft)',
            }}
            dir="rtl"
          >
            {country === 'KSA' ? (
              <>
                الإطار التنظيمي السعودي (REGA / SAFIU) يختلف عن إطار الإمارات،
                وإصدار Anvira الحالي مصمَّم للإمارات المنطقة الرئيسية فقط. سجّلناك
                في قائمة انتظار السعودية. للتواصل، راسلنا على{' '}
                <a
                  href="mailto:legal@anviraplus.it.com"
                  style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
                >
                  legal@anviraplus.it.com
                </a>
                .
              </>
            ) : (
              <>
                DIFC و ADGM يعملان وفق قوانين حماية بيانات خاصة (DIFC DP Law،
                ADGM DPR) تختلف عن PDPL الاتحادي. v1 من Anvira غير مصمَّمة لها.
                للانضمام لقائمة الانتظار، راسلنا على{' '}
                <a
                  href="mailto:legal@anviraplus.it.com"
                  style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
                >
                  legal@anviraplus.it.com
                </a>
                .
              </>
            )}
          </div>
        )}
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
          {country === 'UAE'
            ? 'PDPL الاتحادي يحكم الإمارات المنطقة الرئيسية. المناطق الحرة المالية (DIFC / ADGM) لها قوانين خاصة.'
            : 'KSA — REGA / SAFIU. v1 من Anvira لا تدعمها بعد.'}
        </p>
      </div>

      {/* Slice 4 / Architect Brief §1.11 — License capture (SOFT audit record).
          Only visible on the UAE-mainland flow (the only flow that provisions
          a real tenant). Fields are NON-BLOCKING: empty submit is allowed.
          The server stores whatever is provided as an audit record, never as
          an enforcement gate. */}
      {country === 'UAE' && jurisdiction === 'uae_mainland' && (
        <div className="space-y-3">
          <div>
            <label className="field-label">رقم تسجيل المكتب (ORN)</label>
            <input
              type="text"
              value={reraPermitNumber}
              onChange={(e) => setReraPermitNumber(e.target.value)}
              placeholder="12345"
              dir="ltr"
              maxLength={32}
              className="input-boxed text-left"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div>
            <label className="field-label">اسم الوسيط المسؤول</label>
            <input
              type="text"
              value={responsibleBrokerName}
              onChange={(e) => setResponsibleBrokerName(e.target.value)}
              placeholder="محمد أحمد"
              maxLength={120}
              className="input-boxed"
            />
          </div>

          <div>
            <label className="field-label">رقم الرخصة التجارية (BLN)</label>
            <input
              type="text"
              value={tradeLicenceNumber}
              onChange={(e) => setTradeLicenceNumber(e.target.value)}
              placeholder="1234567"
              dir="ltr"
              maxLength={32}
              className="input-boxed text-left"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <p
            className="text-[10px] leading-relaxed p-2"
            style={{
              color: 'var(--ink-faint)',
              background: 'var(--paper-sink)',
              border: '1px dashed var(--rule)',
              borderRadius: '3px',
            }}
            dir="rtl"
          >
            هذه المعلومات للتدقيق فقط — لا نتحقّق منها تلقائياً عبر دائرة الأراضي حالياً.
            ستبقى الخدمة فعّالة حتى مع رقم منتهي الصلاحية، لكن سيُسجَّل التحذير.
          </p>
        </div>
      )}

      {/* ToS / Privacy acceptance gate. Workflow-assistance framing —
          uses "I agree to terms" not "I agree to be compliant", which
          would be a false claim per the legal-posture addendum. */}
      <label
        className="flex items-start gap-3 text-[12px] leading-relaxed cursor-pointer p-3"
        style={{
          background: 'var(--paper-sink)',
          border: '1px dashed var(--rule)',
          borderRadius: '3px',
          color: 'var(--ink-soft)',
        }}
      >
        <input
          type="checkbox"
          checked={acceptedTos}
          onChange={(e) => setAcceptedTos(e.target.checked)}
          className="mt-0.5 shrink-0"
          required
        />
        <span dir="rtl">
          أوافق على{' '}
          <a
            href="https://anviraplus.it.com/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
          >
            شروط الخدمة
          </a>{' '}
          و
          <a
            href="https://anviraplus.it.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
          >
            سياسة الخصوصية
          </a>
          . Anvira مزوّد برمجيات يوفّر أدوات سير عمل. تبقى المسؤولية التنظيمية
          كمكتب عقاري بموجب قوانين الإمارات والسعودية على عاتقك.
        </span>
      </label>

      {error && (
        <p className="text-xs" style={{ color: 'var(--signal)' }}>
          خطأ: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          submitting ||
          !name.trim() ||
          !slug.trim() ||
          !acceptedTos ||
          currentJurisdiction.blocked
        }
        className="btn-primary group w-full h-12 mt-4"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جارٍ الإنشاء...</span>
          </>
        ) : (
          <>
            <span>أنشئ الحساب</span>
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}

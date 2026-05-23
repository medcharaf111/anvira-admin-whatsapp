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

// Per legal-posture addendum. DIFC + ADGM are blocked at signup with
// a waitlist explainer until v1.5 supports their distinct DP laws.
// Order matches the typical confusion gradient: UAE-mainland and KSA
// first (the supported cases), then DIFC/ADGM (the blocked ones),
// then "other" (covered by a different explainer).
type Jurisdiction =
  | 'uae_mainland'
  | 'ksa_mainland'
  | 'difc'
  | 'adgm'
  | 'other';

const JURISDICTIONS: Array<{ value: Jurisdiction; label: string; blocked: boolean }> = [
  { value: 'uae_mainland', label: 'UAE — Mainland (مكتب في الإمارات، خارج المناطق الحرة المالية)', blocked: false },
  { value: 'ksa_mainland', label: 'KSA — Mainland (مكتب في السعودية)', blocked: false },
  { value: 'difc', label: 'UAE — DIFC (Dubai International Financial Centre)', blocked: true },
  { value: 'adgm', label: 'UAE — ADGM (Abu Dhabi Global Market)', blocked: true },
  { value: 'other', label: 'Other / Else (واتساب لاحقاً)', blocked: true },
];

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
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('uae_mainland');
  // PDPL + legal-posture addendum: brokerage administrator must accept
  // the Terms of Service + Privacy Policy before account creation. The
  // server-side route writes the acceptance into audit_log (action=
  // 'onboarding.tos_accepted') so the consent is timestamped and tied
  // to the actor user, which is what a regulator would ask for.
  const [acceptedTos, setAcceptedTos] = useState(false);
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

    // DIFC / ADGM / other are blocked at signup per the legal-posture
    // addendum. Client-side guard mirrors a server-side check in the
    // onboarding route so a curl-savvy operator can't bypass it.
    const j = JURISDICTIONS.find((x) => x.value === jurisdiction);
    if (j?.blocked) {
      setError(
        'لا ندعم حالياً المكاتب المسجّلة في DIFC / ADGM أو خارج الإمارات والسعودية. ' +
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
          placeholder="amal-clinic"
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

      <div>
        <label className="field-label">الاختصاص التنظيمي · Regulatory jurisdiction</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
          className="input-boxed"
        >
          {JURISDICTIONS.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
              {j.blocked ? ' — (غير مدعوم حالياً)' : ''}
            </option>
          ))}
        </select>
        {JURISDICTIONS.find((j) => j.value === jurisdiction)?.blocked && (
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
          </div>
        )}
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
          نحتاج هذا الحقل لاختيار إطار الامتثال الصحيح (PDPL اتحادي، أو
          قوانين المناطق الحرة).
        </p>
      </div>

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
          (JURISDICTIONS.find((x) => x.value === jurisdiction)?.blocked ?? false)
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

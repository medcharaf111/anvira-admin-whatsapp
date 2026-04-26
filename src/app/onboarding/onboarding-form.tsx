'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي / أبو ظبي (GMT+4)' },
  { value: 'Asia/Qatar', label: 'الدوحة (GMT+3)' },
  { value: 'Asia/Kuwait', label: 'الكويت (GMT+3)' },
  { value: 'Asia/Bahrain', label: 'البحرين (GMT+3)' },
  { value: 'Asia/Muscat', label: 'مسقط (GMT+4)' },
  { value: 'Africa/Casablanca', label: 'الدار البيضاء (GMT+1)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
];

const LANGUAGES = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
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

      {error && (
        <p className="text-xs" style={{ color: 'var(--signal)' }}>
          خطأ: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !name.trim() || !slug.trim()}
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

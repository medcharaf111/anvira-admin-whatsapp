'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Loader2, Copy, Check } from 'lucide-react';

const TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Africa/Tunis',
  'Africa/Casablanca',
];

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

export function NewClientButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary h-10 px-4 text-sm gap-2"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        <span>إضافة عميل</span>
      </button>

      <AnimatePresence>
        {open && <NewClientModal onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function NewClientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [language, setLanguage] = useState<'ar' | 'en' | 'fr'>('ar');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [plan, setPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function autoSlugFromName() {
    if (slug) return;
    const generated = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    if (generated) setSlug(generated);
  }

  async function copyCredentials() {
    if (!created) return;
    // Read the admin domain at runtime so previews / staging / domain
    // changes surface in the credentials block automatically. Falls back
    // to the production URL if NEXT_PUBLIC_ADMIN_URL isn't set.
    const adminUrl =
      process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.anviraplus.it.com';
    await navigator.clipboard.writeText(
      `أنفيرا — بيانات الدخول\n\nالبريد: ${created.email}\nكلمة المرور: ${created.password}\n\nسجّل الدخول من: ${adminUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit() {
    setError(null);
    if (!businessName.trim() || !slug || !email || !password) {
      setError('عبّي كل الحقول الإلزامية');
      return;
    }
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      setError('Slug يجب أن يكون أحرف لاتينية صغيرة وأرقام وشرطات فقط');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/operator/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        business_name: businessName.trim(),
        slug,
        language,
        timezone,
        plan,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`فشل: ${j.error ?? 'unknown'}${j.detail ? ` · ${j.detail}` : ''}`);
      return;
    }
    setCreated({ email: email.trim(), password });
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl p-7"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="eyebrow mb-2">NEW CLIENT · عميل جديد</div>
            <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
              {created ? 'تم الإنشاء' : 'إضافة عميل'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <div
              className="p-4"
              style={{
                background: 'var(--paper-lift)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
              }}
            >
              <div className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>
                البريد
              </div>
              <div
                className="text-sm tabular mb-3"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
                dir="ltr"
              >
                {created.email}
              </div>
              <div className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>
                كلمة المرور
              </div>
              <div
                className="text-sm tabular"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
                dir="ltr"
              >
                {created.password}
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              احفظ هذه البيانات الآن — لن تظهر مرة أخرى. أرسلها للعميل عبر واتساب.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={copyCredentials}
                className="btn-ghost h-10 px-4 text-sm gap-2"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'تم النسخ' : 'نسخ البيانات'}</span>
              </button>
              <button onClick={onClose} className="btn-primary h-10 px-5 text-sm">
                تم
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="اسم الشركة / النشاط *">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                onBlur={autoSlugFromName}
                placeholder="عيادة الأمل لطب الأسنان"
                className="input-boxed w-full"
              />
            </Field>

            <Field label="Slug (لا يمكن تغييره لاحقاً) *">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="al-amal-clinic"
                dir="ltr"
                className="input-boxed text-left w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                أحرف لاتينية صغيرة وأرقام وشرطات فقط — يستخدم في URLs الداخلية
              </p>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="بريد العميل *">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@clinic.sa"
                  dir="ltr"
                  className="input-boxed text-left w-full"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </Field>

              <Field label="كلمة المرور *">
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="input-boxed text-left flex-1"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    onClick={() => setPassword(generatePassword())}
                    className="btn-ghost h-10 px-3 text-xs whitespace-nowrap"
                    type="button"
                  >
                    عشوائي
                  </button>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="اللغة">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'ar' | 'en' | 'fr')}
                  className="input-boxed w-full"
                >
                  <option value="ar">عربي</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </Field>

              <Field label="المنطقة الزمنية">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input-boxed w-full"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </Field>

              <Field label="الباقة">
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as 'starter' | 'pro' | 'business')}
                  className="input-boxed w-full"
                >
                  <option value="starter">الأساسية</option>
                  <option value="pro">الاحترافية</option>
                  <option value="business">الأعمال</option>
                </select>
              </Field>
            </div>

            {error && (
              <div
                className="text-xs p-3"
                style={{
                  background: 'var(--signal-soft)',
                  border: '1px solid var(--signal)',
                  color: 'var(--signal)',
                  borderRadius: '3px',
                }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="btn-ghost h-10 px-5 text-sm">
                إلغاء
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="btn-primary h-10 px-5 text-sm gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>إنشاء العميل</span>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

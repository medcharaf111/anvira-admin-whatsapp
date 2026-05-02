'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, X, Loader2, Phone, Calendar, Crown, FlaskConical } from 'lucide-react';
import { GULF_TIMEZONES } from '@/lib/timezones';

export interface OperatorClient {
  id: string;
  slug: string;
  name: string;
  wa_number: string | null;
  is_sandbox: boolean;
  business_timezone: string;
  plan: 'starter' | 'pro' | 'business';
  subscription_status: 'trial' | 'active' | 'past_due' | 'cancelled';
  paid_until: string | null;
  notes: string | null;
  created_at: string;
  owner_email: string | null;
}

const STATUS_LABEL: Record<OperatorClient['subscription_status'], string> = {
  trial: 'تجريبي',
  active: 'نشط',
  past_due: 'متأخر',
  cancelled: 'ملغى',
};

const STATUS_VARIANT: Record<OperatorClient['subscription_status'], 'success' | 'warn' | 'idle' | 'signal'> = {
  trial: 'idle',
  active: 'success',
  past_due: 'warn',
  cancelled: 'signal',
};

const PLAN_LABEL: Record<OperatorClient['plan'], string> = {
  starter: 'الأساسية',
  pro: 'الاحترافية',
  business: 'الأعمال',
};

export function OperatorClientTable({ clients }: { clients: OperatorClient[] }) {
  const [editing, setEditing] = useState<OperatorClient | null>(null);

  if (clients.length === 0) {
    return (
      <div
        className="py-20 text-center panel"
        style={{ borderStyle: 'dashed' }}
      >
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          لا يوجد عملاء بعد. اضغط "إضافة عميل" للبدء.
        </p>
      </div>
    );
  }

  return (
    <>
      <div>
        {clients.map((c) => {
          const variant = STATUS_VARIANT[c.subscription_status];
          return (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-5 items-center py-4 px-4 row-hover"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              {/* Name + email + slug */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {c.name}
                  </span>
                  {c.is_sandbox && (
                    <FlaskConical
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--ink-faint)' }}
                      strokeWidth={1.5}
                    />
                  )}
                  {c.plan === 'business' && (
                    <Crown
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--primary-glow)' }}
                      strokeWidth={1.5}
                    />
                  )}
                </div>
                <div
                  className="text-[11px] mt-0.5 tabular truncate"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                  dir="ltr"
                >
                  {c.owner_email ?? '—'} · {c.slug}
                </div>
              </div>

              {/* Plan */}
              <div
                className="text-xs px-2 py-1"
                style={{
                  background: 'var(--paper-lift)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                  color: 'var(--ink-soft)',
                  minWidth: '5rem',
                  textAlign: 'center',
                }}
              >
                {PLAN_LABEL[c.plan]}
              </div>

              {/* WhatsApp number */}
              <div
                className="text-[11px] tabular flex items-center gap-1.5 shrink-0"
                style={{ fontFamily: 'var(--font-mono)', color: c.wa_number ? 'var(--ink)' : 'var(--ink-faint)' }}
                dir="ltr"
              >
                <Phone className="w-3 h-3" strokeWidth={1.5} />
                {c.wa_number ? c.wa_number.replace('whatsapp:', '') : 'غير معيّن'}
              </div>

              {/* Status */}
              <div className="shrink-0">
                <span className={`pill pill-${variant}`}>
                  <span className="pill-dot" />
                  <span>{STATUS_LABEL[c.subscription_status]}</span>
                </span>
                {c.paid_until && c.subscription_status === 'active' && (
                  <div
                    className="text-[10px] mt-1 flex items-center gap-1 tabular"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                  >
                    <Calendar className="w-2.5 h-2.5" />
                    {new Date(c.paid_until).toLocaleDateString('ar-AE', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </div>

              {/* Edit */}
              <button
                onClick={() => setEditing(c)}
                className="btn-ghost h-9 w-9 p-0"
                aria-label="تعديل"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <EditClientModal client={editing} onClose={() => setEditing(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function EditClientModal({
  client,
  onClose,
}: {
  client: OperatorClient;
  onClose: () => void;
}) {
  const router = useRouter();
  const [waNumber, setWaNumber] = useState(client.wa_number ?? '');
  const [timezone, setTimezone] = useState(client.business_timezone);
  const [plan, setPlan] = useState(client.plan);
  const [status, setStatus] = useState(client.subscription_status);
  const [paidUntil, setPaidUntil] = useState(
    client.paid_until ? client.paid_until.slice(0, 10) : ''
  );
  const [notes, setNotes] = useState(client.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    // Normalize wa_number: ensure 'whatsapp:' prefix if non-empty
    let normalizedWa: string | null = null;
    if (waNumber.trim()) {
      let cleaned = waNumber.trim();
      if (!cleaned.startsWith('whatsapp:')) cleaned = `whatsapp:${cleaned}`;
      if (!/^whatsapp:\+\d{6,}$/.test(cleaned)) {
        setError('رقم واتساب غير صالح. الصيغة: whatsapp:+966...');
        setSaving(false);
        return;
      }
      normalizedWa = cleaned;
    }

    const res = await fetch(`/api/operator/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wa_number: normalizedWa,
        timezone,
        plan,
        subscription_status: status,
        paid_until: paidUntil ? new Date(paidUntil).toISOString() : null,
        notes: notes.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`فشل: ${j.error ?? 'unknown'}${j.detail ? ` · ${j.detail}` : ''}`);
      return;
    }
    router.refresh();
    onClose();
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
        className="w-full max-w-lg p-7"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="eyebrow mb-2">EDIT · تعديل</div>
            <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
              {client.name}
            </h2>
            <div
              className="text-[11px] mt-1 tabular"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              dir="ltr"
            >
              {client.owner_email}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          <Field label="رقم واتساب">
            <input
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="whatsapp:+97142XXXXXX"
              dir="ltr"
              className="input-boxed text-left w-full"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p
              className="text-[10px] mt-1.5"
              style={{ color: 'var(--ink-faint)' }}
            >
              الرقم الذي اشتريته عبر Twilio لهذا العميل. يجب أن يبدأ بـ whatsapp:+
            </p>
          </Field>

          <Field label="المنطقة الزمنية">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="input-boxed w-full"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {GULF_TIMEZONES.map((tz) => (
                <option key={tz.iana} value={tz.iana}>
                  {tz.label} · {tz.utcOffset}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="الباقة">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as OperatorClient['plan'])}
                className="input-boxed w-full"
              >
                <option value="starter">الأساسية</option>
                <option value="pro">الاحترافية</option>
                <option value="business">الأعمال</option>
              </select>
            </Field>

            <Field label="حالة الاشتراك">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OperatorClient['subscription_status'])}
                className="input-boxed w-full"
              >
                <option value="trial">تجريبي</option>
                <option value="active">نشط</option>
                <option value="past_due">متأخر</option>
                <option value="cancelled">ملغى</option>
              </select>
            </Field>
          </div>

          <Field label="مدفوع حتى">
            <input
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
              className="input-boxed w-full"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>

          <Field label="ملاحظات داخلية">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-boxed w-full"
              placeholder="ملاحظات لا تظهر للعميل..."
            />
          </Field>

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
              onClick={save}
              disabled={saving}
              className="btn-primary h-10 px-5 text-sm gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>حفظ</span>
            </button>
          </div>
        </div>
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

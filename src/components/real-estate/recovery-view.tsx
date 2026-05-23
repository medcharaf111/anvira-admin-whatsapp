'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Archive,
  Download,
  Loader2,
  LifeBuoy,
  Phone,
  ShieldAlert,
  X,
  Check,
  ArrowRightLeft,
} from 'lucide-react';

interface ClientNumber {
  id: string;
  wa_number: string;
  label: string | null;
  is_primary: boolean;
  instance_status: string;
  replaced_by: string | null;
  replaced_at: string | null;
  replacement_reason: string | null;
  created_at: string;
}

interface ConversationArchive {
  id: string;
  storage_path: string;
  archived_at: string;
  conversation_count: number;
  message_count: number;
  size_bytes: number;
}

/**
 * Recovery view — broker self-service for when a WhatsApp number is dead
 * (banned, lost SIM, voluntary migration). Three concerns:
 *
 *   1. Reassure: explain what's preserved across a number change
 *      (everything in the DB) vs what's lost (in-flight QR pairings,
 *      Baileys session state).
 *   2. Let the operator download a nightly archive of their conversation
 *      history — belt-and-suspenders for incidents that escalate past
 *      "swap the number" into "we need to hand the data to the client
 *      and walk away."
 *   3. One-button provision of a fresh Evolution instance against a
 *      new number the broker procures separately. The backend handles
 *      the lineage (replaced_by/replaced_at) atomically.
 *
 * Evolution-only by design — see [[anvira-evolution-only]] in memory.
 * There is no WABA failover. The "new number" the operator types must
 * be a real WhatsApp-capable line they already have.
 */
export function RecoveryView({
  numbers,
  archives,
}: {
  numbers: ClientNumber[];
  archives: ConversationArchive[];
}) {
  return (
    <div className="space-y-12 mt-8">
      <ExplainerCard />
      <ArchivesSection initialArchives={archives} />
      <NumbersSection numbers={numbers} />
    </div>
  );
}

/* ── Explainer ─────────────────────────────────────────────── */

function ExplainerCard() {
  return (
    <section
      className="p-6 md:p-8"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-start gap-4 mb-6">
        <LifeBuoy
          className="w-6 h-6 shrink-0 mt-0.5"
          style={{ color: 'var(--primary-glow)' }}
          strokeWidth={1.5}
        />
        <div>
          <h2 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
            ماذا يحدث إذا تعطّل رقم الواتساب؟
          </h2>
          <p
            className="text-[11px] tracking-widest uppercase mt-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            Number-loss recovery · what's preserved, what's not
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3
            className="text-sm font-medium mb-2 flex items-center gap-2"
            style={{ color: 'var(--ink)' }}
          >
            <Check className="w-4 h-4" style={{ color: 'var(--success, #2d9b6a)' }} />
            يبقى محفوظاً
          </h3>
          <ul
            className="text-[13px] leading-relaxed space-y-1.5"
            style={{ color: 'var(--ink-soft)' }}
            dir="rtl"
          >
            <li>• كل محادثاتك السابقة وأسماء العملاء وأرقامهم</li>
            <li>• حالة كل عميل (cold / warm / hot / handoff)</li>
            <li>• الموافقات (PDPL) ونطاقاتها</li>
            <li>• كتالوج العقارات وخطط الأقساط ونماذج RERA</li>
            <li>• سجل التدقيق + الأرشيف الليلي للمحادثات</li>
          </ul>
        </div>
        <div>
          <h3
            className="text-sm font-medium mb-2 flex items-center gap-2"
            style={{ color: 'var(--ink)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--warn, #b6852b)' }} />
            يضيع مع الرقم القديم
          </h3>
          <ul
            className="text-[13px] leading-relaxed space-y-1.5"
            style={{ color: 'var(--ink-soft)' }}
            dir="rtl"
          >
            <li>• جلسة Baileys على الجهاز المرتبط (تحتاج مسح QR جديد)</li>
            <li>• ربط WhatsApp Web بأجهزتك الأخرى (سيقطعها واتساب تلقائياً)</li>
            <li>• استمرارية رقم الواتساب نفسه على إعلانات المنصات</li>
          </ul>
        </div>
      </div>

      <div
        className="mt-6 pt-5 text-[12px] leading-relaxed"
        style={{ borderTop: '1px solid var(--rule)', color: 'var(--ink-faint)' }}
      >
        <p dir="rtl">
          <strong style={{ color: 'var(--ink-soft)' }}>الوقت المتوقّع:</strong>{' '}
          24–48 ساعة. يتضمّن: شراء شريحة جديدة، تجهيز رقم بديل، مسح QR على
          الجهاز، تحديث الرقم في إعلانات Bayut / Property Finder / Dubizzle.
          المحادثات الحالية تستأنف فور اقتران الجهاز الجديد.
        </p>
      </div>
    </section>
  );
}

/* ── Archives ──────────────────────────────────────────────── */

function ArchivesSection({
  initialArchives,
}: {
  initialArchives: ConversationArchive[];
}) {
  const [archives] = useState(initialArchives);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/recovery/archives/${id}/signed-url`, {
        method: 'POST',
      });
      const j = (await res.json().catch(() => ({}))) as {
        signed_url?: string;
        error?: string;
      };
      if (!res.ok || !j.signed_url) {
        toast.error(`تعذّر التحميل: ${j.error ?? 'unknown'}`);
        return;
      }
      window.open(j.signed_url, '_blank');
      toast.success('تم فتح رابط التحميل');
    } catch {
      toast.error('فشل الاتصال');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <Archive className="w-5 h-5" style={{ color: 'var(--primary-glow)' }} strokeWidth={1.5} />
        <h2 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
          الأرشيف الليلي
        </h2>
        <span
          className="text-[11px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          Nightly conversation archive · 30-day retention
        </span>
      </div>

      <p
        className="text-[12px] leading-relaxed mb-5 max-w-2xl"
        style={{ color: 'var(--ink-soft)' }}
        dir="rtl"
      >
        نسخة احتياطية يومية مضغوطة (gzip JSON) من كل محادثاتك ورسائلك وسجلّ
        الموافقات. كل تحميل يُسجَّل في سجل التدقيق (الفاعل + الوقت + IP).
      </p>

      {archives.length === 0 ? (
        <div
          className="px-4 py-10 text-[12px] text-center"
          style={{
            background: 'var(--paper-sink)',
            border: '1px dashed var(--rule)',
            borderRadius: '3px',
            color: 'var(--ink-faint)',
          }}
          dir="rtl"
        >
          لا توجد أرشيفات بعد. أول نسخة احتياطية تُكتب الليلة الساعة 02:30 UTC.
        </div>
      ) : (
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          {archives.map((a, i) => (
            <div
              key={a.id}
              className="flex items-center gap-4 px-4 md:px-5 py-3"
              style={{ borderBottom: i < archives.length - 1 ? '1px solid var(--rule)' : 'none' }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] tabular"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink)',
                    letterSpacing: '0.03em',
                  }}
                  dir="ltr"
                >
                  {a.archived_at.slice(0, 10)}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: 'var(--ink-faint)' }}
                  dir="rtl"
                >
                  {a.conversation_count.toLocaleString('ar')} محادثة ·{' '}
                  {a.message_count.toLocaleString('ar')} رسالة · {formatBytes(a.size_bytes)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => download(a.id)}
                disabled={busyId === a.id}
                className="flex items-center gap-2 h-9 px-3 text-[12px] transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--paper-sink)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-soft)',
                }}
              >
                {busyId === a.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>DOWNLOAD</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/* ── Numbers ───────────────────────────────────────────────── */

function NumbersSection({ numbers }: { numbers: ClientNumber[] }) {
  const [provisioningFor, setProvisioningFor] = useState<ClientNumber | null>(null);

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <Phone className="w-5 h-5" style={{ color: 'var(--primary-glow)' }} strokeWidth={1.5} />
        <h2 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
          أرقام واتساب التشغيلية
        </h2>
        <span
          className="text-[11px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          WhatsApp numbers · status + replacement
        </span>
      </div>

      <div
        className="overflow-hidden"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {numbers.map((n, i) => {
          const replaceable =
            n.replaced_by == null &&
            (n.instance_status === 'connected' ||
              n.instance_status === 'banned' ||
              n.instance_status === 'disconnected');
          return (
            <div
              key={n.id}
              className="flex items-center gap-4 px-4 md:px-5 py-3"
              style={{ borderBottom: i < numbers.length - 1 ? '1px solid var(--rule)' : 'none' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className="text-[13px] tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink)',
                      letterSpacing: '0.04em',
                    }}
                    dir="ltr"
                  >
                    {n.wa_number}
                  </span>
                  <StatusPill status={n.instance_status} replacedBy={n.replaced_by} />
                  {n.is_primary && (
                    <span
                      className="text-[10px] tracking-widest uppercase px-2 py-0.5"
                      style={{
                        background: 'var(--paper-sink)',
                        border: '1px solid var(--rule)',
                        color: 'var(--ink-soft)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Primary
                    </span>
                  )}
                </div>
                {n.label && (
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                    {n.label}
                  </div>
                )}
                {n.replaced_at && (
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }} dir="rtl">
                    استُبدل في {n.replaced_at.slice(0, 10)}
                    {n.replacement_reason && ` — السبب: ${reasonLabel(n.replacement_reason)}`}
                  </div>
                )}
              </div>
              {replaceable && (
                <button
                  type="button"
                  onClick={() => setProvisioningFor(n)}
                  className="flex items-center gap-2 h-9 px-3 text-[12px] transition-colors"
                  style={{
                    background: 'var(--paper-sink)',
                    border: '1px solid var(--rule)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-soft)',
                  }}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>REPLACE</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {provisioningFor && (
          <ProvisionModal
            oldNumber={provisioningFor}
            onClose={() => setProvisioningFor(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function StatusPill({ status, replacedBy }: { status: string; replacedBy: string | null }) {
  const label = replacedBy
    ? 'Replaced'
    : status === 'connected'
      ? 'Connected'
      : status === 'banned'
        ? 'Banned'
        : status === 'disconnected'
          ? 'Disconnected'
          : status === 'qr_pending'
            ? 'QR pending'
            : 'Unknown';
  const color = replacedBy
    ? 'var(--ink-faint)'
    : status === 'connected'
      ? 'var(--success, #2d9b6a)'
      : status === 'banned' || status === 'disconnected'
        ? 'var(--warn, #b6852b)'
        : 'var(--ink-soft)';
  return (
    <span
      className="text-[10px] tracking-widest uppercase px-2 py-0.5"
      style={{
        fontFamily: 'var(--font-mono)',
        color,
        border: `1px solid ${color}`,
        borderRadius: '2px',
      }}
    >
      {label}
    </span>
  );
}

function reasonLabel(r: string): string {
  switch (r) {
    case 'banned':
      return 'حظر من واتساب';
    case 'voluntary_migration':
      return 'تبديل اختياري';
    case 'lost_number':
      return 'فقدان الشريحة';
    default:
      return r;
  }
}

/* ── Provision modal ───────────────────────────────────────── */

function ProvisionModal({
  oldNumber,
  onClose,
}: {
  oldNumber: ClientNumber;
  onClose: () => void;
}) {
  const [newNumber, setNewNumber] = useState('');
  const [reason, setReason] = useState<'banned' | 'voluntary_migration' | 'lost_number' | 'other'>(
    oldNumber.instance_status === 'banned' ? 'banned' : 'voluntary_migration'
  );
  const [busy, setBusy] = useState(false);

  const valid = /^\+\d{7,15}$/.test(newNumber.trim());

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch('/api/recovery/provision-new-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_number_id: oldNumber.id,
          new_wa_number: newNumber.trim(),
          replacement_reason: reason,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        new_number_id?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !j.ok) {
        toast.error(
          `تعذّر التجهيز: ${j.error ?? 'unknown'}${j.detail ? ` (${j.detail})` : ''}`
        );
        return;
      }
      toast.success('تم تجهيز الرقم الجديد — افتح الإعدادات لمسح QR');
      onClose();
      // Soft reload so the new row + updated old row show up.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error('فشل الاتصال');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-md w-full p-6"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="w-5 h-5 mt-0.5"
              style={{ color: 'var(--warn, #b6852b)' }}
              strokeWidth={1.5}
            />
            <div>
              <h3 className="text-base font-medium" style={{ color: 'var(--ink)' }}>
                تجهيز رقم بديل
              </h3>
              <p
                className="text-[11px] tracking-widest uppercase mt-1"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              >
                Replace · {oldNumber.wa_number}
              </p>
            </div>
          </div>
          <button onClick={onClose} type="button" aria-label="close">
            <X className="w-4 h-4" style={{ color: 'var(--ink-faint)' }} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              className="block text-[10px] tracking-widest uppercase mb-1.5"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              الرقم الجديد · NEW NUMBER
            </label>
            <input
              type="tel"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="+9715XXXXXXXX"
              className="w-full px-3 h-10 text-[13px] tabular outline-none"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
                letterSpacing: '0.04em',
              }}
              dir="ltr"
              autoFocus
              disabled={busy}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }} dir="rtl">
              صيغة E.164 مع <code style={{ fontFamily: 'var(--font-mono)' }}>+</code> ورمز الدولة. مثال:{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>+971501234567</code>
            </p>
          </div>

          <div>
            <label
              className="block text-[10px] tracking-widest uppercase mb-1.5"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              سبب الاستبدال · REASON
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="w-full px-3 h-10 text-[13px] outline-none"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
              }}
              disabled={busy}
              dir="rtl"
            >
              <option value="banned">حظر من واتساب</option>
              <option value="voluntary_migration">تبديل اختياري</option>
              <option value="lost_number">فقدان الشريحة</option>
              <option value="other">أخرى</option>
            </select>
          </div>

          <div
            className="text-[11px] leading-relaxed p-3"
            style={{
              background: 'var(--paper-sink)',
              border: '1px dashed var(--rule)',
              color: 'var(--ink-faint)',
              borderRadius: '3px',
            }}
            dir="rtl"
          >
            بعد التجهيز: ستحصل على رابط مسح QR. امسحه من جهاز جديد. كل
            محادثاتك السابقة ستظهر تلقائياً بعد اقتران الجهاز.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 text-[12px]"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-soft)',
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="btn-primary h-10 px-5 text-[12px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'تجهيز الرقم البديل'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

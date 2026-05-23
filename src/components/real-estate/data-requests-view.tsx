'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Trash2,
  X,
  Loader2,
  ShieldAlert,
  Check,
  Clock,
  Ban,
} from 'lucide-react';

interface DataRequest {
  id: string;
  conversation_id: string | null;
  customer_phone: string;
  requested_at: string;
  trigger_message: string | null;
  status: 'pending' | 'confirmed' | 'auto_confirmed' | 'cancelled';
  confirmed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
}

/**
 * PDPL deletion-request management. Pending requests at top with
 * confirm / cancel actions; resolved requests below as a read-only
 * audit log. Auto-refresh on action so the list stays accurate.
 */
export function DataRequestsView({ initial }: { initial: DataRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = initial.filter((r) => r.status === 'pending');
  const resolved = initial.filter((r) => r.status !== 'pending');

  async function confirm(id: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'تأكيد الحذف؟ هذا الإجراء نهائي — سيتم محو محادثة العميل، رسائلها، حالات الامتثال، والوثائق المرتبطة. ' +
          'يُحفَظ سجل التدقيق فقط (بدون البيانات الشخصية).'
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/data-requests/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(`تعذّر التأكيد: ${j.error ?? 'unknown'}`);
        return;
      }
      toast.success('تم تنفيذ الحذف');
      router.refresh();
    } catch {
      toast.error('فشل الاتصال');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('إلغاء الطلب؟ سيتم إغلاق الطلب بدون تنفيذ الحذف.')
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/data-requests/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast.error('تعذّر الإلغاء');
        return;
      }
      toast.success('تم إلغاء الطلب');
      router.refresh();
    } catch {
      toast.error('فشل الاتصال');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10 mt-8">
      {/* PDPL explainer */}
      <section
        className="p-5"
        style={{
          background: 'var(--paper-sink)',
          border: '1px dashed var(--rule)',
          borderRadius: '3px',
        }}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--warn, #b6852b)' }}
            strokeWidth={1.5}
          />
          <div className="flex-1 space-y-2 text-[12px] leading-relaxed">
            <p style={{ color: 'var(--ink-soft)' }} dir="rtl">
              PDPL يُلزم بالاستجابة لطلبات حذف البيانات خلال ٣٠ يوماً. الطلبات
              التي لا تُؤكَّد يدوياً تُنفَّذ تلقائياً بعد انتهاء المهلة. التأكيد
              يحذف محادثة العميل + الرسائل + حالات الامتثال + الوثائق المرتبطة
              نهائياً. سجل التدقيق يحتفظ بحقيقة الحذف فقط (بدون البيانات
              الشخصية).
            </p>
            <p
              style={{
                color: 'var(--ink-faint)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              UAE PDPL Art. 8 / KSA PDPL Art. 10 — 30-day SLA. Confirmed
              deletion is irreversible; the audit log preserves the event
              without the deleted PII.
            </p>
          </div>
        </div>
      </section>

      {/* Pending requests */}
      <section>
        <div className="flex items-baseline gap-3 mb-4">
          <Clock
            className="w-5 h-5"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.5}
          />
          <h2
            className="text-lg font-medium"
            style={{ color: 'var(--ink)' }}
          >
            طلبات معلَّقة ({pending.length})
          </h2>
          <span
            className="text-[11px] tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
            }}
          >
            PENDING REQUESTS
          </span>
        </div>

        {pending.length === 0 ? (
          <div
            className="p-8 text-center text-[12px]"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
              color: 'var(--ink-faint)',
            }}
            dir="rtl"
          >
            لا توجد طلبات حذف معلَّقة حالياً.
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
            <AnimatePresence initial={false}>
              {pending.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4 md:p-5"
                  style={{
                    borderBottom:
                      i < pending.length - 1 ? '1px solid var(--rule)' : 'none',
                  }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink)',
                          letterSpacing: '0.04em',
                        }}
                        dir="ltr"
                      >
                        {r.customer_phone}
                      </div>
                      <div
                        className="text-[11px] mt-1"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        طُلب في {new Date(r.requested_at).toLocaleString('ar')}
                      </div>
                      {r.trigger_message && (
                        <div
                          className="mt-2 text-[12px] p-2 italic"
                          style={{
                            background: 'var(--paper-sink)',
                            border: '1px solid var(--rule)',
                            borderRadius: '3px',
                            color: 'var(--ink-soft)',
                            maxWidth: '40rem',
                          }}
                          dir="auto"
                        >
                          "{r.trigger_message}"
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => cancel(r.id)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 h-9 px-3 text-[12px] transition-colors disabled:opacity-50"
                        style={{
                          background: 'var(--paper-sink)',
                          border: '1px solid var(--rule)',
                          borderRadius: '3px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>CANCEL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(r.id)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 h-9 px-3 text-[12px] transition-colors disabled:opacity-50"
                        style={{
                          background: 'var(--signal, #a8262c)',
                          color: 'var(--paper)',
                          borderRadius: '3px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>CONFIRM DELETE</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Resolved requests (audit) */}
      {resolved.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-4">
            <Check
              className="w-5 h-5"
              style={{ color: 'var(--ink-faint)' }}
              strokeWidth={1.5}
            />
            <h2
              className="text-lg font-medium"
              style={{ color: 'var(--ink)' }}
            >
              سجل سابق ({resolved.length})
            </h2>
            <span
              className="text-[11px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
            >
              RESOLVED
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
            {resolved.map((r, i) => (
              <div
                key={r.id}
                className="px-4 md:px-5 py-3 flex items-center gap-4 flex-wrap"
                style={{
                  borderBottom:
                    i < resolved.length - 1 ? '1px solid var(--rule)' : 'none',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[12px] tabular"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-soft)',
                      }}
                      dir="ltr"
                    >
                      {r.customer_phone}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
                  <div
                    className="text-[10px] mt-0.5"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {r.status === 'cancelled' && r.cancelled_at
                      ? `أُلغي في ${new Date(r.cancelled_at).toLocaleString('ar')}`
                      : r.confirmed_at
                        ? `نُفِّذ في ${new Date(r.confirmed_at).toLocaleString('ar')}`
                        : `طُلب في ${new Date(r.requested_at).toLocaleString('ar')}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DataRequest['status'] }) {
  const config: Record<DataRequest['status'], { label: string; color: string }> = {
    pending: { label: 'معلَّق', color: 'var(--warn, #b6852b)' },
    confirmed: { label: 'مُنفَّذ يدوياً', color: 'var(--signal, #a8262c)' },
    auto_confirmed: { label: 'تنفيذ تلقائي', color: 'var(--signal, #a8262c)' },
    cancelled: { label: 'مُلغى', color: 'var(--ink-faint)' },
  };
  const cfg = config[status];
  const Icon = status === 'cancelled' ? Ban : status === 'pending' ? Clock : Check;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase px-2 py-0.5"
      style={{
        fontFamily: 'var(--font-mono)',
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        borderRadius: '2px',
      }}
    >
      <Icon className="w-3 h-3" />
      <span>{cfg.label}</span>
    </span>
  );
}

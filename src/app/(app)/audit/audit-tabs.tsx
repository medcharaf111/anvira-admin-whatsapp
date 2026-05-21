'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ScrollText,
  ShieldCheck,
  Eye,
  EyeOff,
  Download,
  Loader2,
  FileWarning,
} from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';

export interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type ConsentEvent =
  | 'requested'
  | 'granted'
  | 'revoked'
  | 'reminded'
  | 'auto_expired';

export interface ConsentRow {
  id: string;
  event: ConsentEvent | string;
  customer_phone: string | null;
  conversation_id: string | null;
  trigger_message: string | null;
  recorded_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  'conversation.takeover_on': 'تولّى الرد',
  'conversation.takeover_off': 'أعاد البوت',
  'conversation.note_edit': 'حدّث ملاحظات',
  'customer.block': 'حظر رقم',
  'customer.unblock': 'ألغى الحظر',
  'kb.update': 'حدّث قاعدة المعرفة',
  'settings.update': 'حدّث الإعدادات',
  'booking.create': 'أنشأ موعد',
  'booking.cancel': 'ألغى موعد',
  'handoff.resolve': 'حلّ تنبيه',
  'lead_source.email.enable': 'فعّل تحويل البريد',
  'lead_source.email.disable': 'أوقف تحويل البريد',
  'compliance.update': 'حدّث الامتثال',
  'compliance.export': 'صدّر سجل الموافقات',
  'template.create': 'أنشأ ردّاً جاهزاً',
  'template.update': 'حدّث ردّاً جاهزاً',
  'template.delete': 'حذف ردّاً جاهزاً',
  'template.seed_re': 'هيّأ باقة الردود العقارية',
  'branch_number.create': 'أضاف رقم فرع',
  'branch_number.update': 'حدّث رقم فرع',
  'branch_number.delete': 'حذف رقم فرع',
  'settings.languages.update': 'حدّث لغات الردّ',
};

const CONSENT_LABELS: Record<string, { ar: string; tone: 'success' | 'warn' | 'signal' | 'idle' }> = {
  requested:    { ar: 'طُلبت الموافقة',     tone: 'idle'    },
  granted:      { ar: 'مُنحت الموافقة',     tone: 'success' },
  revoked:      { ar: 'سُحبت الموافقة',     tone: 'signal'  },
  reminded:     { ar: 'تذكير الموافقة',     tone: 'warn'    },
  auto_expired: { ar: 'انتهت تلقائياً',     tone: 'idle'    },
};

type Tab = 'all' | 'compliance';

export function AuditTabs({
  audit,
  consent,
  showComplianceTab,
  clientTimezone,
}: {
  audit: AuditRow[];
  consent: ConsentRow[];
  showComplianceTab: boolean;
  clientTimezone: string;
}) {
  const [tab, setTab] = useState<Tab>('all');

  return (
    <div>
      {showComplianceTab && (
        <div
          className="mb-6 flex items-center gap-1 p-1 inline-flex"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
            width: 'fit-content',
          }}
          role="tablist"
        >
          <TabPill active={tab === 'all'} onClick={() => setTab('all')}>
            <ScrollText className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>كل النشاطات</span>
          </TabPill>
          <TabPill active={tab === 'compliance'} onClick={() => setTab('compliance')}>
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>الامتثال (PDPL)</span>
            {consent.length > 0 && (
              <span
                className="text-[10px] tabular px-1.5 py-0.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--paper-sink)',
                  color: 'var(--ink-faint)',
                  borderRadius: 2,
                }}
              >
                {consent.length}
              </span>
            )}
          </TabPill>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'all' ? (
            <AllActivityTable audit={audit} />
          ) : (
            <ComplianceTable consent={consent} clientTimezone={clientTimezone} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex items-center gap-2 px-3 h-8 text-[12px] transition-colors"
      style={{
        background: active ? 'var(--paper-sink)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-soft)',
        border: active ? '1px solid var(--rule)' : '1px solid transparent',
        borderRadius: 2,
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </button>
  );
}

/* ── All activity (legacy) ─────────────────────────────────────── */

function AllActivityTable({ audit }: { audit: AuditRow[] }) {
  if (audit.length === 0) {
    return (
      <div
        className="py-20 text-center panel"
        style={{ borderStyle: 'dashed' }}
      >
        <ScrollText
          className="w-10 h-10 mx-auto mb-4"
          style={{ color: 'var(--ink-ghost)' }}
          strokeWidth={1}
        />
        <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
          لا يوجد نشاط بعد. كل ما يقوم به المشغّل من تعديل أو إلغاء سيظهر هنا.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div
        className="grid grid-cols-[1fr_180px_120px] gap-4 py-3 px-4 text-[10px]"
        style={{
          borderBottom: '1px solid var(--rule)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-faint)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span>الإجراء</span>
        <span>المشغّل</span>
        <span className="text-left">الوقت</span>
      </div>

      {audit.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[1fr_180px_120px] gap-4 items-center py-3.5 px-4"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <div className="min-w-0">
            <div className="text-sm" style={{ color: 'var(--ink)' }}>
              {ACTION_LABELS[row.action] ?? row.action}
            </div>
            <div
              className="text-[10px] mt-0.5 truncate"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              {row.target_type ?? ''}
              {row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ''}
            </div>
          </div>

          <div
            className="text-xs truncate"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
            dir="ltr"
          >
            {row.actor_email ?? '—'}
          </div>

          <div
            className="text-[11px] tabular text-left"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            title={new Date(row.created_at).toLocaleString()}
          >
            {formatDistanceToNow(row.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Compliance (PDPL) ─────────────────────────────────────────── */

function ComplianceTable({
  consent,
  clientTimezone,
}: {
  consent: ConsentRow[];
  clientTimezone: string;
}) {
  // Date range filters. Default = last 30 days. The server query already
  // applied the same default — pickers narrow further via fetch.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thirtyAgo = useMemo(
    () =>
      new Date(Date.now() - 30 * 24 * 60 * 60_000)
        .toISOString()
        .slice(0, 10),
    []
  );
  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        from: new Date(from).toISOString(),
        to: new Date(`${to}T23:59:59.999Z`).toISOString(),
      });
      const res = await fetch(`/api/compliance/export?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(
          j.error === 'export_failed'
            ? 'تعذّر التصدير — لم تُهيَّأ خدمة التصدير بعد'
            : 'تعذّر التصدير'
        );
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const m = /filename="([^"]+)"/.exec(disposition);
      const filename = m?.[1] ?? `consent-log-${today.replace(/-/g, '')}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تصدير السجل');
    } catch {
      toast.error('تعذّر التصدير');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Toolbar — date pickers + export */}
      <div
        className="flex items-end flex-wrap gap-4 mb-5 pb-5"
        style={{ borderBottom: '1px solid var(--rule)' }}
      >
        <DateField label="من" value={from} onChange={setFrom} />
        <DateField label="إلى" value={to} onChange={setTo} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="btn-primary h-10 gap-2 text-sm"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          <span>تصدير CSV</span>
        </button>
      </div>

      {consent.length === 0 ? (
        <div className="py-16 text-center panel" style={{ borderStyle: 'dashed' }}>
          <FileWarning
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا أحداث موافقة في النطاق الزمني المحدد.
          </p>
          <p
            style={{ color: 'var(--ink-faint)' }}
            className="text-[11px] mt-1"
          >
            سيُضاف كل طلب أو منح أو سحب للموافقة هنا تلقائياً.
          </p>
        </div>
      ) : (
        <div>
          <div
            className="grid grid-cols-[160px_140px_minmax(0,1fr)_minmax(0,1.4fr)_140px] gap-4 py-3 px-4 text-[10px]"
            style={{
              borderBottom: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            <span>الحدث</span>
            <span>الجوال</span>
            <span>المحادثة</span>
            <span>الرسالة المحرّكة</span>
            <span className="text-left">الوقت</span>
          </div>

          {consent.map((row) => (
            <ConsentRowItem key={row.id} row={row} clientTimezone={clientTimezone} />
          ))}
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        className="block text-[10px] tracking-widest uppercase mb-1.5"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
      >
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-boxed h-10 text-left"
        style={{ fontFamily: 'var(--font-mono)', width: '11rem' }}
        dir="ltr"
      />
    </div>
  );
}

function ConsentRowItem({
  row,
  clientTimezone,
}: {
  row: ConsentRow;
  clientTimezone: string;
}) {
  const [phoneShown, setPhoneShown] = useState(false);
  const [msgExpanded, setMsgExpanded] = useState(false);
  const meta = CONSENT_LABELS[row.event] ?? {
    ar: row.event,
    tone: 'idle' as const,
  };

  const redacted = redactPhone(row.customer_phone);

  return (
    <div
      className="grid grid-cols-[160px_140px_minmax(0,1fr)_minmax(0,1.4fr)_140px] gap-4 items-start py-3.5 px-4"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      {/* Event chip */}
      <div>
        <span className={`pill pill-${meta.tone}`}>
          <span className="pill-dot" />
          <span>{meta.ar}</span>
        </span>
      </div>

      {/* Phone (redacted, reveal on click) */}
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setPhoneShown((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] tabular"
          style={{
            fontFamily: 'var(--font-mono)',
            color: phoneShown ? 'var(--ink)' : 'var(--ink-soft)',
          }}
          dir="ltr"
          title={phoneShown ? 'اخفاء' : 'كشف'}
        >
          {phoneShown ? (
            <EyeOff className="w-3 h-3" />
          ) : (
            <Eye className="w-3 h-3" />
          )}
          <span className="truncate">
            {row.customer_phone ? (phoneShown ? row.customer_phone : redacted) : '—'}
          </span>
        </button>
      </div>

      {/* Conversation link */}
      <div className="min-w-0">
        {row.conversation_id ? (
          <Link
            href={`/conversations/${row.conversation_id}`}
            className="text-[12px] underline truncate inline-block max-w-full"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--primary-glow)',
              textUnderlineOffset: 3,
            }}
            dir="ltr"
            title={row.conversation_id}
          >
            {row.conversation_id.slice(0, 8)}…
          </Link>
        ) : (
          <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            —
          </span>
        )}
      </div>

      {/* Trigger message — truncated, hover to expand */}
      <div className="min-w-0">
        {row.trigger_message ? (
          <button
            type="button"
            onClick={() => setMsgExpanded((v) => !v)}
            className="text-[12px] leading-relaxed text-right block w-full"
            style={{
              color: 'var(--ink-soft)',
              whiteSpace: msgExpanded ? 'normal' : 'nowrap',
              overflow: msgExpanded ? 'visible' : 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={msgExpanded ? 'طوي' : row.trigger_message}
          >
            {row.trigger_message}
          </button>
        ) : (
          <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            —
          </span>
        )}
      </div>

      {/* Timestamp */}
      <div
        className="text-[11px] tabular text-left"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        title={new Date(row.recorded_at).toLocaleString('en-GB', {
          timeZone: clientTimezone,
        })}
      >
        {formatDistanceToNow(row.recorded_at)}
      </div>
    </div>
  );
}

/**
 * Mask phone numbers for the default view — PDPL minimum-exposure
 * principle. Operators can still reveal individual rows by clicking.
 *
 *   "+971501234567" → "+971•••4567"
 */
function redactPhone(p: string | null): string {
  if (!p) return '—';
  const cleaned = p.replace(/\s+/g, '');
  if (cleaned.length < 6) return '••••';
  return `${cleaned.slice(0, 4)}•••${cleaned.slice(-4)}`;
}

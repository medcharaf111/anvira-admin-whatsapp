'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { parseTierBlock, tierBlockMessage } from '@/lib/tier-upgrade';
import {
  Phone,
  Plus,
  Check,
  Trash2,
  Copy,
  Loader2,
  X,
  Star,
} from 'lucide-react';

const MAX_NUMBERS = 3;

interface BranchNumber {
  id: string;
  wa_number: string;
  label: string | null;
  is_primary: boolean;
}

interface PanelData {
  numbers: BranchNumber[];
  provisioned: boolean;
}

/**
 * Branch WhatsApp numbers — RE only.
 *
 * The brokerage tier ships with up to 3 numbers, one per branch. Each
 * number is independent: a buyer who messages "Marina Office" replies
 * back on the same number; we don't merge threads across numbers.
 *
 * When the backend hasn't yet provisioned the `client_numbers` table
 * (Wave 2 backend may land after this file does), we fall back to a
 * "not yet provisioned" empty state instead of crashing /settings.
 */
export function BranchNumbersPanel() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/branch-numbers', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const json = (await res.json()) as PanelData;
      setData(json);
    } catch {
      toast.error('تعذّر تحميل أرقام الفروع');
      setData({ numbers: [], provisioned: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(wa_number: string, label: string) {
    setBusyId('__new');
    try {
      const res = await fetch('/api/branch-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_number, label }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // 3.2 — typed tier 402 / counted 409 get specific copy, not 'unknown'.
        const tierBlock = parseTierBlock(res.status, j);
        if (tierBlock) {
          toast.error(tierBlockMessage(tierBlock));
        } else if (j.error === 'cap_reached') {
          toast.error(`وصلت حد الأرقام لباقتك${j.detail ? ` — ${j.detail}` : ''}. ترقَّ لإضافة المزيد.`);
        } else {
          toast.error(`تعذّرت الإضافة: ${j.error ?? 'unknown'}`);
        }
        return false;
      }
      toast.success('تم إضافة الرقم');
      setAdding(false);
      await refresh();
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function patch(id: string, body: { label?: string; is_primary?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/branch-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error('تعذّر الحفظ');
        return;
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('حذف هذا الرقم؟')) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/branch-numbers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('تعذّر الحذف');
        return;
      }
      toast.success('تم الحذف');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-12">
        <SectionHeader />
        <div
          className="p-12 flex items-center justify-center"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: 'var(--ink-faint)' }}
          />
        </div>
      </section>
    );
  }

  if (!data) return null;

  // Backend table not provisioned yet — surface a calm explanation
  // rather than half-broken UI. Operator can come back after the
  // next deploy.
  if (!data.provisioned) {
    return (
      <section className="mt-12">
        <SectionHeader />
        <div
          className="p-6"
          style={{
            background: 'var(--paper-sink)',
            border: '1px dashed var(--rule)',
            borderRadius: '3px',
          }}
        >
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: 'var(--ink-soft)' }}
            dir="rtl"
          >
            أرقام الفروع لم تُهيَّأ بعد على هذا الحساب. سيتمكّن مكتبك من إضافة
            ما يصل إلى ٣ أرقام واتساب بعد التحديث القادم — سيظهر القسم
            تلقائياً.
          </p>
        </div>
      </section>
    );
  }

  const numbers = data.numbers;
  const canAdd = numbers.length < MAX_NUMBERS;

  return (
    <section className="mt-12">
      <SectionHeader />

      <div
        className="overflow-hidden"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {numbers.length === 0 ? (
          <div
            className="py-10 text-center"
            style={{ color: 'var(--ink-faint)' }}
          >
            <p className="text-[13px]">لم تُضف أي أرقام بعد.</p>
          </div>
        ) : (
          numbers.map((n, i) => (
            <NumberCard
              key={n.id}
              n={n}
              showDivider={i > 0}
              busy={busyId === n.id}
              onRelabel={(label) => patch(n.id, { label })}
              onMakePrimary={() => patch(n.id, { is_primary: true })}
              onDelete={() => remove(n.id)}
            />
          ))
        )}

        <AnimatePresence initial={false} mode="wait">
          {adding ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
              style={{ borderTop: numbers.length > 0 ? '1px solid var(--rule)' : undefined }}
            >
              <AddForm
                busy={busyId === '__new'}
                onCancel={() => setAdding(false)}
                onSave={create}
              />
            </motion.div>
          ) : canAdd ? (
            <motion.button
              key="cta"
              type="button"
              onClick={() => setAdding(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full px-5 md:px-7 py-5 flex items-center gap-3 text-right transition-colors hover:bg-[var(--paper-hover)]"
              style={{
                borderTop: numbers.length > 0 ? '1px solid var(--rule)' : undefined,
                color: 'var(--ink-soft)',
              }}
            >
              <div
                className="w-8 h-8 flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--paper-sink)',
                  border: '1px dashed var(--rule)',
                  borderRadius: '3px',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm">إضافة رقم واتساب آخر</span>
              <span
                className="ms-auto text-[10px] tracking-widest uppercase"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              >
                {numbers.length} / {MAX_NUMBERS}
              </span>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Hint text */}
      <p
        className="mt-3 text-[12px] leading-relaxed"
        style={{ color: 'var(--ink-faint)' }}
      >
        كل رقم مستقل — العميل اللي يكتب على رقم «فرع المرسى» يتلقى الردّ من
        نفس الرقم. مفيد إذا كنت تخصّص فروع لمناطق مختلفة.
      </p>

      {!canAdd && (
        <p
          className="mt-2 text-[11px]"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.04em',
          }}
        >
          ترقّى إلى Enterprise لإضافة أكثر من ٣ أرقام · Upgrade to Enterprise for more
        </p>
      )}
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="mb-8 flex items-start gap-3">
      <Phone
        className="w-5 h-5 mt-0.5 shrink-0"
        style={{ color: 'var(--primary-glow)' }}
        strokeWidth={1.5}
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
            أرقام واتساب الفروع
          </h2>
          <span
            className="text-[11px] tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
            }}
          >
            Branch WhatsApp · max 3
          </span>
        </div>
        <p
          className="text-sm mt-1.5 max-w-2xl"
          style={{ color: 'var(--ink-soft)' }}
        >
          خصّص رقم واتساب لكل فرع. المحادثات تُوجَّه تلقائياً بحسب الرقم الذي
          راسل عليه العميل.
        </p>
      </div>
    </div>
  );
}

function NumberCard({
  n,
  showDivider,
  busy,
  onRelabel,
  onMakePrimary,
  onDelete,
}: {
  n: BranchNumber;
  showDivider: boolean;
  busy: boolean;
  onRelabel: (label: string) => void;
  onMakePrimary: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(n.label ?? '');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(n.wa_number);
      setCopied(true);
      toast.success('تم النسخ');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('تعذّر النسخ');
    }
  }

  return (
    <div
      className="px-5 md:px-7 py-6 grid grid-cols-1 md:grid-cols-[1.1fr_1fr_auto] gap-5 md:gap-6 items-center"
      style={{ borderTop: showDivider ? '1px solid var(--rule)' : undefined }}
    >
      {/* WA number + copy */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span
            className="text-[10px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            WhatsApp
          </span>
          {n.is_primary ? (
            <span className="pill pill-success" title="Primary number">
              <Star className="w-2.5 h-2.5" />
              <span>أساسي</span>
            </span>
          ) : null}
        </div>
        <div
          className="flex items-stretch gap-px"
          style={{ background: 'var(--rule)', borderRadius: 3 }}
        >
          <div
            className="flex-1 min-w-0 px-3 h-9 flex items-center text-[13px] tabular truncate"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--paper-sink)',
              color: 'var(--ink)',
              letterSpacing: '0.04em',
            }}
            dir="ltr"
            title={n.wa_number}
          >
            {n.wa_number}
          </div>
          <button
            type="button"
            onClick={copy}
            className="h-9 px-3 flex items-center gap-1.5 text-[11px] transition-colors"
            style={{
              background: 'var(--paper-lift)',
              fontFamily: 'var(--font-mono)',
              color: copied ? 'var(--primary-glow)' : 'var(--ink-soft)',
              letterSpacing: '0.06em',
            }}
            aria-label="Copy WhatsApp number"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'COPIED' : 'COPY'}</span>
          </button>
        </div>
      </div>

      {/* Label (editable) */}
      <div className="min-w-0">
        <label
          className="block text-[10px] tracking-widest uppercase mb-1.5"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          الفرع
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            if ((label ?? '') !== (n.label ?? '')) {
              onRelabel(label);
            }
          }}
          placeholder="مثلاً: فرع المرسى / Marina"
          maxLength={48}
          className="input-boxed h-9 text-[13px]"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:justify-end">
        {!n.is_primary && (
          <button
            type="button"
            onClick={onMakePrimary}
            disabled={busy}
            className="btn-ghost h-9 gap-1.5 text-[11px]"
            title="جعل هذا الرقم أساسياً"
          >
            <Star className="w-3 h-3" />
            <span>اجعله أساسياً</span>
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy || n.is_primary}
          className="w-9 h-9 inline-flex items-center justify-center disabled:opacity-30"
          style={{ color: 'var(--ink-faint)' }}
          aria-label="حذف الرقم"
          title={n.is_primary ? 'لا يمكن حذف الرقم الأساسي' : 'حذف'}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function AddForm({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (wa: string, label: string) => Promise<boolean>;
}) {
  const [wa, setWa] = useState('');
  const [label, setLabel] = useState('');

  const canSave = wa.trim().length >= 6 && !busy;

  return (
    <div className="px-5 md:px-7 py-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">رقم واتساب</label>
          <input
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="+9715xxxxxxxx"
            dir="ltr"
            className="input-boxed text-left"
            style={{ fontFamily: 'var(--font-mono)' }}
            autoFocus
          />
        </div>
        <div>
          <label className="field-label">اسم الفرع (اختياري)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="مثلاً: Marina Office"
            maxLength={48}
            className="input-boxed"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost h-9 gap-2 text-xs"
        >
          <X className="w-3.5 h-3.5" />
          <span>إلغاء</span>
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await onSave(wa.trim(), label.trim());
            if (ok) {
              setWa('');
              setLabel('');
            }
          }}
          disabled={!canSave}
          className="btn-primary h-9 gap-2 text-xs"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>إضافة</span>
        </button>
      </div>
    </div>
  );
}

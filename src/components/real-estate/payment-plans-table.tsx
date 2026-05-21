'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, X, Loader2, DollarSign } from 'lucide-react';

export interface Milestone {
  label: string;
  percent: number;
  when?: string;
}

export interface PlanRow {
  id: string;
  name: string;
  down_payment_percent: number | null;
  during_construction_percent: number | null;
  on_handover_percent: number | null;
  post_handover_months: number | null;
  post_handover_percent: number | null;
  milestones: Milestone[] | null;
  notes: string | null;
}

export function PaymentPlansTable({ plans }: { plans: PlanRow[] }) {
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary h-9 px-4 text-sm gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span>إضافة خطة</span>
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="py-20 text-center panel" style={{ borderStyle: 'dashed' }}>
          <DollarSign
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا توجد خطط سداد بعد. أضف خططك المعتادة (60/40, 50/50, 1%/شهر…).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={() => setEditing(plan)} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {(editing || creating) && (
          <PlanModal
            plan={editing}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlanRow; onEdit: () => void }) {
  const buckets = computeBuckets(plan);
  const total = buckets.reduce((a, b) => a + b.percent, 0);

  return (
    <div
      className="panel p-5"
      style={{ background: 'var(--paper-lift)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {plan.name}
          </div>
          {plan.notes && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--ink-faint)' }}>
              {plan.notes}
            </p>
          )}
        </div>
        <button onClick={onEdit} className="btn-ghost h-8 w-8 p-0" aria-label="تعديل">
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Buyer-perspective bar — mirrors how the bot describes the plan. */}
      <div className="mb-2">
        <div
          className="text-[10px] mb-1.5 flex items-center justify-between"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          <span>WHAT THE BUYER SEES</span>
          <span>{total}%</span>
        </div>
        <div
          className="flex h-3 overflow-hidden"
          style={{ borderRadius: '2px', border: '1px solid var(--rule)' }}
        >
          {buckets.map((b, i) => (
            <div
              key={i}
              title={`${b.label} · ${b.percent}%`}
              style={{
                width: `${(b.percent / Math.max(total, 1)) * 100}%`,
                background: bucketColor(i),
              }}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1">
          {buckets.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: bucketColor(i) }}
              />
              <span style={{ color: 'var(--ink-soft)' }}>{b.label}</span>
              <span className="ml-auto tabular" style={{ fontFamily: 'var(--font-mono)' }}>
                {b.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function bucketColor(i: number): string {
  // Three editorial tones — primary, signal, warn — cycled. The bar reads
  // clearly even on a small card without needing dedicated chart colors.
  const palette = ['var(--primary-glow)', 'var(--warn)', 'var(--signal)', 'var(--ink-soft)'];
  return palette[i % palette.length];
}

function computeBuckets(p: PlanRow): { label: string; percent: number }[] {
  // Prefer the explicit milestones array if it's well-formed; otherwise
  // synthesize buckets from the 4-pct shortcut fields.
  if (p.milestones && Array.isArray(p.milestones) && p.milestones.length > 0) {
    return p.milestones
      .filter((m) => m && typeof m.percent === 'number')
      .map((m) => ({ label: m.label + (m.when ? ` · ${m.when}` : ''), percent: m.percent }));
  }
  const out: { label: string; percent: number }[] = [];
  if (p.down_payment_percent) out.push({ label: 'الدفعة المقدّمة', percent: p.down_payment_percent });
  if (p.during_construction_percent)
    out.push({ label: 'خلال البناء', percent: p.during_construction_percent });
  if (p.on_handover_percent) out.push({ label: 'عند التسليم', percent: p.on_handover_percent });
  if (p.post_handover_percent)
    out.push({
      label: `بعد التسليم${p.post_handover_months ? ` · ${p.post_handover_months}ش` : ''}`,
      percent: p.post_handover_percent,
    });
  return out;
}

function PlanModal({ plan, onClose }: { plan: PlanRow | null; onClose: () => void }) {
  const router = useRouter();
  const isEdit = !!plan;
  const [name, setName] = useState(plan?.name ?? '');
  const [dp, setDp] = useState(plan?.down_payment_percent?.toString() ?? '');
  const [dc, setDc] = useState(plan?.during_construction_percent?.toString() ?? '');
  const [oh, setOh] = useState(plan?.on_handover_percent?.toString() ?? '');
  const [phMonths, setPhMonths] = useState(plan?.post_handover_months?.toString() ?? '');
  const [phPct, setPhPct] = useState(plan?.post_handover_percent?.toString() ?? '');
  const [milestones, setMilestones] = useState<Milestone[]>(plan?.milestones ?? []);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [useMilestones, setUseMilestones] = useState(
    !!plan?.milestones && plan.milestones.length > 0
  );

  const liveBuckets = useMemo(() => {
    if (useMilestones) {
      return milestones
        .filter((m) => m && typeof m.percent === 'number' && m.percent > 0)
        .map((m) => ({
          label: m.label + (m.when ? ` · ${m.when}` : ''),
          percent: m.percent,
        }));
    }
    const out: { label: string; percent: number }[] = [];
    if (Number(dp)) out.push({ label: 'الدفعة المقدّمة', percent: Number(dp) });
    if (Number(dc)) out.push({ label: 'خلال البناء', percent: Number(dc) });
    if (Number(oh)) out.push({ label: 'عند التسليم', percent: Number(oh) });
    if (Number(phPct))
      out.push({
        label: `بعد التسليم${phMonths ? ` · ${phMonths}ش` : ''}`,
        percent: Number(phPct),
      });
    return out;
  }, [useMilestones, milestones, dp, dc, oh, phPct, phMonths]);

  const liveTotal = liveBuckets.reduce((a, b) => a + b.percent, 0);

  async function save() {
    if (!name.trim()) {
      toast.error('اسم الخطة مطلوب');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      down_payment_percent: useMilestones ? null : dp ? Number(dp) : null,
      during_construction_percent: useMilestones ? null : dc ? Number(dc) : null,
      on_handover_percent: useMilestones ? null : oh ? Number(oh) : null,
      post_handover_months: useMilestones ? null : phMonths ? Number(phMonths) : null,
      post_handover_percent: useMilestones ? null : phPct ? Number(phPct) : null,
      milestones: useMilestones ? milestones.filter((m) => m.label && m.percent > 0) : null,
      notes: notes.trim() || null,
    };
    const res = await fetch(
      isEdit ? `/api/payment-plans/${plan!.id}` : '/api/payment-plans',
      {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(`فشل: ${j.error ?? 'unknown'}`);
      return;
    }
    toast.success(isEdit ? 'تم التحديث' : 'تم الإنشاء');
    router.refresh();
    onClose();
  }

  async function destroy() {
    if (!plan || !confirm('حذف الخطة نهائياً؟')) return;
    setSaving(true);
    const res = await fetch(`/api/payment-plans/${plan.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      toast.error('لم نتمكن من الحذف');
      return;
    }
    toast.success('تم الحذف');
    router.refresh();
    onClose();
  }

  function setMilestone(i: number, patch: Partial<Milestone>) {
    setMilestones((prev) => prev.map((m, j) => (i === j ? { ...m, ...patch } : m)));
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
        className="w-full max-w-2xl p-7"
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
            <div className="eyebrow mb-2">{isEdit ? 'EDIT' : 'NEW'} · خطة سداد</div>
            <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
              {isEdit ? plan!.name : 'إضافة خطة سداد'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="اسم الخطة *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="60/40 · Standard"
              className="input-boxed w-full"
            />
          </Field>

          <div
            className="p-3"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
            }}
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useMilestones}
                onChange={(e) => setUseMilestones(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>
                استخدم محطّات مخصّصة (Milestones JSON)
              </span>
            </label>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              عند التفعيل: تكتب كل محطّة يدوياً. عند الإلغاء: تستخدم الحقول السريعة الأربعة.
            </p>
          </div>

          {!useMilestones ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="الدفعة المقدّمة %">
                <input
                  type="number"
                  value={dp}
                  onChange={(e) => setDp(e.target.value)}
                  placeholder="10"
                  className="input-boxed w-full"
                />
              </Field>
              <Field label="خلال البناء %">
                <input
                  type="number"
                  value={dc}
                  onChange={(e) => setDc(e.target.value)}
                  placeholder="50"
                  className="input-boxed w-full"
                />
              </Field>
              <Field label="عند التسليم %">
                <input
                  type="number"
                  value={oh}
                  onChange={(e) => setOh(e.target.value)}
                  placeholder="40"
                  className="input-boxed w-full"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="بعد التسليم %">
                  <input
                    type="number"
                    value={phPct}
                    onChange={(e) => setPhPct(e.target.value)}
                    placeholder="0"
                    className="input-boxed w-full"
                  />
                </Field>
                <Field label="عدد الأشهر">
                  <input
                    type="number"
                    value={phMonths}
                    onChange={(e) => setPhMonths(e.target.value)}
                    placeholder="0"
                    className="input-boxed w-full"
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="field-label">المحطّات</span>
                <button
                  type="button"
                  onClick={() => setMilestones([...milestones, { label: '', percent: 0 }])}
                  className="btn-ghost h-8 px-3 text-xs gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>أضف محطّة</span>
                </button>
              </div>
              {milestones.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  لا توجد محطّات. اضغط "أضف محطّة" للبدء.
                </p>
              )}
              {milestones.map((m, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                  <input
                    value={m.label}
                    onChange={(e) => setMilestone(i, { label: e.target.value })}
                    placeholder="عند بدء البناء"
                    className="input-boxed"
                  />
                  <input
                    type="number"
                    value={m.percent || ''}
                    onChange={(e) => setMilestone(i, { percent: Number(e.target.value) })}
                    placeholder="20"
                    className="input-boxed"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <input
                    value={m.when ?? ''}
                    onChange={(e) => setMilestone(i, { when: e.target.value })}
                    placeholder="Q1 2026"
                    className="input-boxed"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                    className="btn-ghost h-10 w-10 p-0"
                    aria-label="حذف"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Field label="ملاحظات للعميل (اختياري)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Cash deal: خصم 5% — Bank financing available"
              className="input-boxed w-full"
            />
          </Field>

          {/* Live preview */}
          <div
            className="p-4"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
            }}
          >
            <div
              className="text-[10px] mb-2 flex items-center justify-between"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              <span>PREVIEW — ما يراه العميل</span>
              <span style={{ color: liveTotal === 100 ? 'var(--primary-glow)' : 'var(--warn)' }}>
                {liveTotal}% / 100%
              </span>
            </div>
            {liveBuckets.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                املأ الحقول لرؤية المعاينة
              </p>
            ) : (
              <>
                <div
                  className="flex h-4 overflow-hidden"
                  style={{ borderRadius: '2px', border: '1px solid var(--rule)' }}
                >
                  {liveBuckets.map((b, i) => (
                    <div
                      key={i}
                      title={`${b.label} · ${b.percent}%`}
                      style={{
                        width: `${(b.percent / Math.max(liveTotal, 1)) * 100}%`,
                        background: bucketColor(i),
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 space-y-1">
                  {liveBuckets.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: bucketColor(i) }}
                      />
                      <span style={{ color: 'var(--ink-soft)' }}>{b.label}</span>
                      <span
                        className="ml-auto tabular"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {b.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div
            className="flex justify-between gap-2 pt-4"
            style={{ borderTop: '1px solid var(--rule)' }}
          >
            <div>
              {isEdit && (
                <button
                  onClick={destroy}
                  disabled={saving}
                  className="btn-ghost h-10 px-4 text-sm gap-2"
                  style={{ color: 'var(--signal)', borderColor: 'var(--signal-soft)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost h-10 px-5 text-sm">
                إلغاء
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary h-10 px-5 text-sm gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEdit ? 'حفظ' : 'إنشاء'}</span>
              </button>
            </div>
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

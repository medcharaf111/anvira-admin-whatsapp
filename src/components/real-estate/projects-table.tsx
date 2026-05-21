'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, X, Loader2, Home, Info } from 'lucide-react';

export interface ProjectRow {
  id: string;
  name: string;
  developer: string | null;
  location: string | null;
  description: string | null;
  total_units: number | null;
  completion_year: number | null;
  payment_plan_summary: string | null;
  highlights: string[] | null;
  media_folder_path: string | null;
  status: 'active' | 'sold_out' | 'pre_launch' | 'archived';
  permit_number: string | null;
}

const STATUS_LABEL: Record<ProjectRow['status'], string> = {
  active: 'نشط',
  pre_launch: 'قبل الإطلاق',
  sold_out: 'مكتمل البيع',
  archived: 'مؤرشف',
};

const STATUS_VARIANT: Record<ProjectRow['status'], 'success' | 'warn' | 'idle' | 'signal'> = {
  active: 'success',
  pre_launch: 'warn',
  sold_out: 'idle',
  archived: 'signal',
};

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const [editing, setEditing] = useState<ProjectRow | null>(null);
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
          <span>إضافة مشروع</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="py-20 text-center panel" style={{ borderStyle: 'dashed' }}>
          <Home
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا توجد مشاريع بعد.
          </p>
        </div>
      ) : (
        <div>
          {projects.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-4 px-4 row-hover"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                  {p.name}
                </div>
                <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ink-faint)' }}>
                  {p.developer ?? '—'}
                  {p.location ? ` · ${p.location}` : ''}
                  {p.completion_year ? ` · تسليم ${p.completion_year}` : ''}
                </div>
              </div>

              <div
                className="text-xs tabular text-center min-w-[5rem]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
              >
                {p.total_units ? `${p.total_units} وحدة` : '—'}
              </div>

              <div className="shrink-0">
                <span className={`pill pill-${STATUS_VARIANT[p.status]}`}>
                  <span className="pill-dot" />
                  <span>{STATUS_LABEL[p.status]}</span>
                </span>
              </div>

              <button
                onClick={() => setEditing(p)}
                className="btn-ghost h-8 w-8 p-0"
                aria-label="تعديل"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(editing || creating) && (
          <ProjectModal
            project={editing}
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

function ProjectModal({
  project,
  onClose,
}: {
  project: ProjectRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [developer, setDeveloper] = useState(project?.developer ?? '');
  const [location, setLocation] = useState(project?.location ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [totalUnits, setTotalUnits] = useState(project?.total_units?.toString() ?? '');
  const [completionYear, setCompletionYear] = useState(project?.completion_year?.toString() ?? '');
  const [paymentPlanSummary, setPaymentPlanSummary] = useState(project?.payment_plan_summary ?? '');
  const [mediaFolder, setMediaFolder] = useState(project?.media_folder_path ?? '');
  const [status, setStatus] = useState<ProjectRow['status']>(project?.status ?? 'active');
  const [permitNumber, setPermitNumber] = useState(project?.permit_number ?? '');
  const [highlights, setHighlights] = useState<string[]>(project?.highlights ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error('اسم المشروع مطلوب');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      developer: developer.trim() || null,
      location: location.trim() || null,
      description: description.trim() || null,
      total_units: totalUnits ? Number(totalUnits) : null,
      completion_year: completionYear ? Number(completionYear) : null,
      payment_plan_summary: paymentPlanSummary.trim() || null,
      media_folder_path: mediaFolder.trim() || null,
      status,
      permit_number: permitNumber.trim() || null,
      highlights: highlights.filter((h) => h.trim()),
    };
    const res = await fetch(isEdit ? `/api/projects/${project!.id}` : '/api/projects', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
    if (!project || !confirm('حذف المشروع نهائياً؟')) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      toast.error('لم نتمكن من الحذف');
      return;
    }
    toast.success('تم الحذف');
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
            <div className="eyebrow mb-2">{isEdit ? 'EDIT' : 'NEW'} · مشروع</div>
            <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
              {isEdit ? project!.name : 'إضافة مشروع'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="اسم المشروع *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emaar Beachfront Phase 5"
              className="input-boxed w-full"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="المطوّر">
              <input
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                placeholder="Emaar / DAMAC / Aldar / ROSHN"
                className="input-boxed w-full"
              />
            </Field>
            <Field label="الموقع">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Dubai Marina"
                className="input-boxed w-full"
              />
            </Field>
          </div>

          <Field label="الوصف">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-boxed w-full"
              placeholder="مشروع سكني فاخر..."
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="إجمالي الوحدات">
              <input
                type="number"
                value={totalUnits}
                onChange={(e) => setTotalUnits(e.target.value)}
                placeholder="420"
                className="input-boxed w-full"
              />
            </Field>
            <Field label="سنة التسليم">
              <input
                type="number"
                value={completionYear}
                onChange={(e) => setCompletionYear(e.target.value)}
                placeholder="2027"
                className="input-boxed w-full"
              />
            </Field>
            <Field label="الحالة">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectRow['status'])}
                className="input-boxed w-full"
              >
                <option value="active">نشط</option>
                <option value="pre_launch">قبل الإطلاق</option>
                <option value="sold_out">مكتمل البيع</option>
                <option value="archived">مؤرشف</option>
              </select>
            </Field>
          </div>

          <Field label="ملخّص خطة السداد">
            <textarea
              value={paymentPlanSummary}
              onChange={(e) => setPaymentPlanSummary(e.target.value)}
              rows={2}
              placeholder="60/40 — 60% خلال البناء، 40% عند التسليم"
              className="input-boxed w-full"
            />
          </Field>

          <Field label="المميزات (سطر لكل ميزة)">
            <textarea
              value={highlights.join('\n')}
              onChange={(e) =>
                setHighlights(e.target.value.split('\n').filter((s) => s.length > 0))
              }
              rows={4}
              placeholder="إطلالة بحرية مباشرة\nمسبح infinity\n5 minutes from Burj Khalifa"
              className="input-boxed w-full"
            />
          </Field>

          <Field label="مسار مجلد الصور (Storage)">
            <input
              value={mediaFolder}
              onChange={(e) => setMediaFolder(e.target.value)}
              placeholder="projects/emaar-beachfront/"
              className="input-boxed w-full"
              style={{ fontFamily: 'var(--font-mono)' }}
              dir="ltr"
            />
          </Field>

          <Field label="رقم الترخيص / Permit number">
            <input
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              placeholder="RERA-12345 / FAL-67890"
              className="input-boxed w-full"
              style={{ fontFamily: 'var(--font-mono)' }}
              dir="ltr"
            />
            <p
              className="text-[10px] mt-1 flex items-center gap-1.5"
              style={{ color: 'var(--ink-faint)' }}
            >
              <Info className="w-3 h-3" />
              <span>
                RERA (UAE) أو REGA FAL (KSA) — رقم الترخيص مطلوب قانونياً للإعلان عن المشروع.
              </span>
            </p>
          </Field>

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

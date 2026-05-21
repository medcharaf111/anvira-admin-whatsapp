'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Loader2, Save, X, Sparkles, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ReplyTemplate } from '@/app/(app)/templates/page';
import type { ClientType } from '@/lib/client';

export function TemplatesEditor({
  initial,
  clientType = 'clinic',
}: {
  initial: ReplyTemplate[];
  clientType?: ClientType;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: '', body: '', language: 'ar' });
  const [busy, setBusy] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  /**
   * RE-only affordance: when the operator has no templates yet, offer to
   * bulk-seed ~12 bilingual starters. Backend route is idempotent and
   * refuses to seed when rows already exist, so even a double-click is
   * safe — we still gate the UI to avoid the noisy 409.
   */
  async function seedRealEstate() {
    setSeeding(true);
    try {
      const res = await fetch('/api/templates/seed-re', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          j.error === 'already_seeded'
            ? 'الردود موجودة بالفعل'
            : `تعذّر التهيئة: ${j.error ?? 'unknown'}`
        );
        return;
      }
      toast.success(`تمّ إضافة ${j.inserted ?? 12} رد جاهز`);
      router.refresh();
    } catch {
      toast.error('تعذّر التهيئة — حاول مرة أخرى');
    } finally {
      setSeeding(false);
    }
  }

  const showSeedCta = clientType === 'real_estate' && initial.length === 0;

  async function create() {
    if (!draft.label.trim() || !draft.body.trim()) return;
    setBusy('create');
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`خطأ: ${j.error ?? 'unknown'}`);
        return;
      }
      setDraft({ label: '', body: '', language: 'ar' });
      setCreating(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('حذف هذا الرد الجاهز؟')) return;
    setBusy(id);
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* RE starter pack — only when no templates exist. We want this to
          be the most prominent affordance on the page on day-one. */}
      {showSeedCta && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 p-6 md:p-7"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <div className="flex items-start gap-4 flex-wrap">
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--primary-glow)',
              }}
            >
              <Building2 className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3 flex-wrap mb-1.5">
                <h3
                  className="text-base font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  باقة الردود العقارية — جاهزة للاستخدام
                </h3>
                <span
                  className="text-[10px] tracking-widest uppercase"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  Real-estate starter · 12
                </span>
              </div>
              <p
                className="text-sm leading-relaxed mb-3 max-w-2xl"
                style={{ color: 'var(--ink-soft)' }}
              >
                ٢ ترحيب (داخل/خارج الدوام)، إرسال البروشور، تذكير المعاينة،
                خطة الأقساط، تحويل التمويل، No-show، Cold-lead nudge،
                Hot-lead alert — كل ردّ ثنائي اللغة وقابل للتعديل.
              </p>
              <button
                type="button"
                onClick={seedRealEstate}
                disabled={seeding}
                className="btn-primary h-10 gap-2 text-sm"
              >
                {seeding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                <span>أضف الباقة العقارية</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Add new */}
      <div className="mb-8">
        <AnimatePresence mode="wait">
          {!creating ? (
            <motion.button
              key="add"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreating(true)}
              className="btn-primary h-10 gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>رد جاهز جديد</span>
            </motion.button>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-4"
              style={{
                background: 'var(--paper-lift)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
              }}
            >
              <div>
                <label className="field-label">الاسم المختصر</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="مثلاً: ترحيب، تأكيد الموعد، شكر"
                  className="input-boxed"
                  maxLength={60}
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">نص الرد</label>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="مثلاً: أهلاً وسهلاً 🌷 شكراً لتواصلكم معنا. كيف يمكننا مساعدتك؟"
                  rows={4}
                  className="input-boxed resize-y"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <select
                  value={draft.language}
                  onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                  className="input-boxed max-w-[140px]"
                  dir="ltr"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCreating(false);
                      setDraft({ label: '', body: '', language: 'ar' });
                    }}
                    className="btn-ghost h-9 text-xs"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={create}
                    disabled={busy === 'create' || !draft.label.trim() || !draft.body.trim()}
                    className="btn-primary h-9 gap-2 text-xs"
                  >
                    {busy === 'create' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>حفظ</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* List */}
      {initial.length === 0 ? (
        <div
          className="py-16 px-8 text-center panel"
          style={{ borderStyle: 'dashed' }}
        >
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            ما عندك ردود جاهزة بعد. أنشئ أول واحد بالأعلى.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              busy={busy}
              setBusy={setBusy}
              onDelete={remove}
              onSaved={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({
  template,
  busy,
  setBusy,
  onDelete,
  onSaved,
}: {
  template: ReplyTemplate;
  busy: string | null;
  setBusy: (s: string | null) => void;
  onDelete: (id: string) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    label: template.label,
    body: template.body,
    language: template.language,
  });

  async function save() {
    setBusy(template.id);
    try {
      await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setEditing(false);
      onSaved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="p-5"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      {editing ? (
        <div className="space-y-3">
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            className="input-boxed"
            maxLength={60}
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={4}
            className="input-boxed resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            <select
              value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              className="input-boxed max-w-[140px]"
              dir="ltr"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft({
                    label: template.label,
                    body: template.body,
                    language: template.language,
                  });
                }}
                className="btn-ghost h-9 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={save}
                disabled={busy === template.id}
                className="btn-primary h-9 gap-2 text-xs"
              >
                {busy === template.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>حفظ</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {template.label}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                    border: '1px solid var(--rule)',
                    borderRadius: '2px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {template.language.toUpperCase()}
                </span>
              </div>
              <p
                className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--ink-soft)' }}
              >
                {template.body}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="btn-ghost h-8 px-3 text-xs"
              >
                تعديل
              </button>
              <button
                onClick={() => onDelete(template.id)}
                disabled={busy === template.id}
                className="w-8 h-8 inline-flex items-center justify-center"
                style={{ color: 'var(--ink-faint)' }}
                aria-label="حذف"
              >
                {busy === template.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

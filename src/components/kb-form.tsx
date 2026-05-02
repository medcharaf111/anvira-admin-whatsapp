'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { SaveButton } from '@/components/save-button';
import { toast } from 'sonner';
import { KB_TEMPLATES, type KbTemplate } from '@/lib/kb-templates';
import { Sparkles } from 'lucide-react';

const FIELDS: {
  key: string;
  label: string;
  help: string;
  long?: boolean;
  num: string;
}[] = [
  { num: '01', key: 'business_name', label: 'اسم العمل', help: 'يُعرض عند ترحيب البوت بالعملاء.' },
  { num: '02', key: 'about', label: 'عن عملك', help: 'وصف قصير بكلماتك.', long: true },
  { num: '03', key: 'services', label: 'الخدمات التي تقدّمها', help: 'اذكر كل ما يمكن للعميل حجزه أو شراؤه.', long: true },
  { num: '04', key: 'prices', label: 'الأسعار', help: 'اكتب الأسعار بوضوح. البوت لن يخترع سعراً غير موجود هنا.', long: true },
  { num: '05', key: 'location', label: 'الموقع وطريقة الوصول', help: 'العنوان، مواقف السيارات، معالم قريبة، رقم الهاتف.', long: true },
  { num: '06', key: 'staff', label: 'الموظفون', help: 'الأسماء والمهام، إذا سأل العميل عن شخص معيّن.', long: true },
  { num: '07', key: 'policies', label: 'السياسات', help: 'الإلغاء، المقدّم، الاسترداد، أي شيء يحتاج العميل معرفته.', long: true },
  { num: '08', key: 'faq', label: 'الأسئلة الشائعة', help: 'أضف أسئلة وأجوبة يحتاج البوت معرفتها.', long: true },
];

export function KbForm({ initial }: { initial: Record<string, any> }) {
  const [values, setValues] = useState(initial);
  const [templateId, setTemplateId] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  async function onSave(): Promise<boolean> {
    const res = await fetch('/api/kb', {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      toast.error('لم نتمكن من الحفظ');
      return false;
    }
    toast.success('تمّ الحفظ. المساعد يستخدم المعلومات الجديدة فوراً.');
    return true;
  }

  function applyTemplate(t: KbTemplate) {
    // Default behavior: only fill EMPTY fields. With overwrite: replace
    // every field with the template's content. Either way, every field
    // remains free-text editable after the apply.
    const next = { ...values };
    for (const [key, val] of Object.entries(t.fields)) {
      const current = (next[key] ?? '').trim();
      if (overwrite || !current) {
        next[key] = val;
      }
    }
    setValues(next);
    toast.success(
      overwrite
        ? `تم تطبيق قالب "${t.label}" واستبدال الحقول الموجودة`
        : `تم تطبيق قالب "${t.label}" على الحقول الفارغة`
    );
  }

  return (
    <div>
      {/* Template picker — sits above the field list */}
      <div
        className="mb-8 p-5 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <div className="min-w-0 flex items-start gap-3">
          <Sparkles
            className="w-4 h-4 mt-1 shrink-0"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.5}
          />
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              قالب جاهز يوفّر لك ٢٥ دقيقة
            </div>
            <p
              className="text-xs mt-1 leading-relaxed"
              style={{ color: 'var(--ink-faint)' }}
            >
              اختر طبيعة عملك ونملأ الحقول بمحتوى نموذجي تعدّله حسب نشاطك.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={templateId}
            onChange={(e) => {
              const id = e.target.value;
              setTemplateId(id);
              if (!id) return;
              const t = KB_TEMPLATES.find((x) => x.id === id);
              if (t) applyTemplate(t);
              // Reset to placeholder so the user can re-apply if they want
              setTimeout(() => setTemplateId(''), 50);
            }}
            className="input-boxed h-10 text-sm"
            style={{ minWidth: '14rem' }}
          >
            <option value="">اختر طبيعة العمل...</option>
            {KB_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon}  {t.label}
              </option>
            ))}
          </select>

          <label
            className="flex items-center gap-2 text-xs cursor-pointer"
            style={{ color: 'var(--ink-soft)' }}
          >
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span>استبدل الحقول الموجودة</span>
          </label>
        </div>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
        }}
      >
        {FIELDS.map((f) => (
          <motion.div
            key={f.key}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
            }}
            className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 md:gap-8 py-6"
            style={{ borderTop: '1px solid var(--rule)' }}
          >
            {/* Label side */}
            <div className="pt-1">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span
                  className="text-[10px] tabular"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--primary-glow)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {f.num}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {f.label}
                </span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--ink-faint)' }}
              >
                {f.help}
              </p>
            </div>

            {/* Input side */}
            <div>
              {f.long ? (
                <textarea
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  rows={4}
                  className="input-boxed resize-y"
                  placeholder="—"
                />
              ) : (
                <input
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="input-boxed"
                  placeholder="—"
                />
              )}
            </div>
          </motion.div>
        ))}

        <div
          className="pt-6 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--rule)' }}
        >
          <p
            className="text-[11px]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em' }}
          >
            التغييرات تُطبَّق فوراً على المساعد
          </p>
          <SaveButton
            onSave={onSave}
            idleLabel="حفظ التغييرات"
            savingLabel="جارٍ الحفظ..."
            savedLabel="تمّ الحفظ"
          />
        </div>
      </motion.div>
    </div>
  );
}

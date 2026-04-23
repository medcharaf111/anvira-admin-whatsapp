'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { SaveButton } from '@/components/save-button';
import { toast } from 'sonner';

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

  return (
    <div>
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

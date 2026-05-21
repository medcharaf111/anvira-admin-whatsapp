'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { SaveButton } from '@/components/save-button';
import { toast } from 'sonner';
import { templatesFor, type KbTemplate } from '@/lib/kb-templates';
import { Sparkles } from 'lucide-react';
import type { ClientType } from '@/lib/client';

interface FieldDef {
  key: string;
  label: string;
  help: string;
  long?: boolean;
  num: string;
}

// Generic clinic/salon — the original 8-field schema. Do not extend this
// without coordinating with the backend prompt builder, which reads these
// exact keys.
const CLINIC_FIELDS: FieldDef[] = [
  { num: '01', key: 'business_name', label: 'اسم العمل', help: 'يُعرض عند ترحيب البوت بالعملاء.' },
  { num: '02', key: 'about', label: 'عن عملك', help: 'وصف قصير بكلماتك.', long: true },
  { num: '03', key: 'services', label: 'الخدمات التي تقدّمها', help: 'اذكر كل ما يمكن للعميل حجزه أو شراؤه.', long: true },
  { num: '04', key: 'prices', label: 'الأسعار', help: 'اكتب الأسعار بوضوح. البوت لن يخترع سعراً غير موجود هنا.', long: true },
  { num: '05', key: 'location', label: 'الموقع وطريقة الوصول', help: 'العنوان، مواقف السيارات، معالم قريبة، رقم الهاتف.', long: true },
  { num: '06', key: 'staff', label: 'الموظفون', help: 'الأسماء والمهام، إذا سأل العميل عن شخص معيّن.', long: true },
  { num: '07', key: 'policies', label: 'السياسات', help: 'الإلغاء، المقدّم، الاسترداد، أي شيء يحتاج العميل معرفته.', long: true },
  { num: '08', key: 'faq', label: 'الأسئلة الشائعة', help: 'أضف أسئلة وأجوبة يحتاج البوت معرفتها.', long: true },
];

// Real-estate brokerage — 17 fields, matched 1:1 to the backend's
// knowledge_base columns added in 20260519000000_realestate_pivot.sql.
const REAL_ESTATE_FIELDS: FieldDef[] = [
  {
    num: '01',
    key: 'business_name',
    label: 'اسم المكتب العقاري',
    help: 'Office name — يُعرض عند ترحيب البوت.',
  },
  {
    num: '02',
    key: 'about',
    label: 'نبذة عن المكتب',
    help: 'About — وصف قصير: التخصص، الأسواق، الشرائح المخدومة.',
    long: true,
  },
  {
    num: '03',
    key: 'property_types_handled',
    label: 'أنواع العقارات',
    help: 'Property types handled — شقق، فلل، أراضي، تجاري، Off-plan…',
    long: true,
  },
  {
    num: '04',
    key: 'developer_affiliations',
    label: 'المطوّرون المعتمدون',
    help: 'Developer affiliations — Emaar / DAMAC / Aldar / Sobha / ROSHN / Dar Al Arkan…',
    long: true,
  },
  {
    num: '05',
    key: 'prices',
    label: 'نطاق الأسعار الإرشادي',
    help: 'Indicative price ranges per area + bedroom count.',
    long: true,
  },
  {
    num: '06',
    key: 'commission_structure',
    label: 'هيكل العمولة',
    help: 'Commission structure — 2% Dubai · 2.5% KSA · Off-plan paid by developer · VAT…',
    long: true,
  },
  {
    num: '07',
    key: 'payment_plan_explanation',
    label: 'شرح خطط السداد',
    help: 'Payment plans — 60/40, 50/50, 80/20, 1%/month, post-handover…',
    long: true,
  },
  {
    num: '08',
    key: 'roi_ranges',
    label: 'العوائد الاستثمارية المتوقعة',
    help: 'ROI ranges — illustrative rental yield + capital appreciation. Always non-guaranteed.',
    long: true,
  },
  {
    num: '09',
    key: 'financing_partners',
    label: 'البنوك الممولة',
    help: 'Financing partners — Emirates NBD, FAB, Mashreq, Riyad Bank, Al Rajhi…',
    long: true,
  },
  {
    num: '10',
    key: 'handover_timeline',
    label: 'جدول التسليم',
    help: 'Handover timeline — Q2 2026 → Q4 2028 typical.',
    long: true,
  },
  {
    num: '11',
    key: 'target_investor_profile',
    label: 'الشريحة المستهدفة',
    help: 'Target investor profile — GCC nationals, NRIs, EU expats…',
    long: true,
  },
  {
    num: '12',
    key: 'broker_license',
    label: 'رخصة الوساطة العقارية',
    help: 'Broker license — RERA Permit + expiry + responsible broker name (UAE) OR REGA FAL license (KSA).',
    long: true,
  },
  {
    num: '13',
    key: 'hours',
    label: 'ساعات العمل',
    help: 'Business hours — السبت-الخميس، رمضان، العطل…',
    long: true,
  },
  {
    num: '14',
    key: 'location',
    label: 'الموقع وطريقة الوصول',
    help: 'Location — العنوان، الحي، رقم المكتب، WhatsApp.',
    long: true,
  },
  {
    num: '15',
    key: 'staff',
    label: 'فريق المكتب',
    help: 'Staff — الأسماء + BRN/FAL الفردي لكل وسيط.',
    long: true,
  },
  {
    num: '16',
    key: 'policies',
    label: 'السياسات والالتزامات',
    help: 'Policies — cooling-off, NOC for resale, escrow rules, PDPL/GDPR consent.',
    long: true,
  },
  {
    num: '17',
    key: 'faq',
    label: 'الأسئلة الشائعة',
    help: 'FAQ — رسوم Land Department، Capital Gains Tax، Premium Residency…',
    long: true,
  },
];

function fieldsFor(clientType: ClientType): FieldDef[] {
  if (clientType === 'real_estate') return REAL_ESTATE_FIELDS;
  // clinic + salon share the same 8-field schema today
  return CLINIC_FIELDS;
}

export function KbForm({
  initial,
  clientType = 'clinic',
}: {
  initial: Record<string, any>;
  clientType?: ClientType;
}) {
  const [values, setValues] = useState(initial);
  const [templateId, setTemplateId] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  const fields = fieldsFor(clientType);
  const templates = templatesFor(clientType);

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
      {/* Template picker — sits above the field list. Hide entirely when
          no template matches the active client_type (e.g. unknown vertical). */}
      {templates.length > 0 && (
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
                const t = templates.find((x) => x.id === id);
                if (t) applyTemplate(t);
                // Reset to placeholder so the user can re-apply if they want
                setTimeout(() => setTemplateId(''), 50);
              }}
              className="input-boxed h-10 text-sm"
              style={{ minWidth: '14rem' }}
            >
              <option value="">اختر طبيعة العمل...</option>
              {templates.map((t) => (
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
      )}

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
        }}
      >
        {fields.map((f) => (
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

            {/* Input side — long fields get a textarea, short ones a single-line input.
                Auto-save on blur keeps the editor honest without a per-keystroke save. */}
            <div>
              {f.long ? (
                <textarea
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  onBlur={() => {
                    // Fire-and-forget autosave; the explicit Save button still works.
                    fetch('/api/kb', {
                      method: 'PATCH',
                      body: JSON.stringify(values),
                    }).catch(() => {});
                  }}
                  rows={4}
                  className="input-boxed resize-y"
                  placeholder="—"
                />
              ) : (
                <input
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  onBlur={() => {
                    fetch('/api/kb', {
                      method: 'PATCH',
                      body: JSON.stringify(values),
                    }).catch(() => {});
                  }}
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

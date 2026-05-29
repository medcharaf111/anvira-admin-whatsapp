'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveButton } from '@/components/save-button';
import { Globe2 } from 'lucide-react';
import type { TenantCountry } from '@/lib/client';

/**
 * Track E — operating-country panel.
 *
 * UAE → RERA / DLD / goAML. KSA support (REGA / SAFIU / FAL) is NOT yet
 * implemented (item 15): the KSA selector is hidden and /api/compliance
 * refuses country='KSA' or any FAL/REGA write. The KSA field block below is
 * retained only to render legacy KSA tenants' previously-saved values.
 */
export function TenantCountryPanel({
  initial,
}: {
  initial: {
    country: TenantCountry | null;
    fal_license_number: string | null;
    rega_company_id: string | null;
  };
}) {
  const router = useRouter();
  const [country, setCountry] = useState<TenantCountry | null>(initial.country);
  const [fal, setFal] = useState(initial.fal_license_number ?? '');
  const [rega, setRega] = useState(initial.rega_company_id ?? '');

  async function save(): Promise<boolean> {
    const payload: Record<string, unknown> = { country };
    if (country === 'KSA') {
      payload.fal_license_number = fal.trim() || null;
      payload.rega_company_id = rega.trim() || null;
    } else {
      // Clear KSA fields when switching to UAE so stale licenses don't
      // float around in the DB.
      payload.fal_license_number = null;
      payload.rega_company_id = null;
    }

    const res = await fetch('/api/compliance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error('لم نتمكن من الحفظ');
      return false;
    }
    toast.success('تم حفظ بيانات الدولة');
    router.refresh();
    return true;
  }

  return (
    <Card className="p-6 md:p-8 mt-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="flex items-start gap-3">
          <Globe2
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.5}
          />
          <div>
            <h3 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
              دولة التشغيل
            </h3>
            <p
              className="text-[11px] tracking-widest uppercase mt-1"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              Operating country · regulatory regime
            </p>
            <p
              className="text-[12px] leading-relaxed mt-2 max-w-2xl"
              style={{ color: 'var(--ink-soft)' }}
              dir="rtl"
            >
              تحدّد هذه البيانات إطار الامتثال الظاهر للوسيط: الإمارات (RERA /
              DLD / goAML). دعم السعودية (REGA) قيد الإعداد وغير متاح حالياً.
            </p>
          </div>
        </div>

        <div>
          <Label className="block mb-2">الدولة</Label>
          <div className="flex gap-2">
            {(['UAE'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className="flex-1 h-10 px-4 text-[13px] transition-all"
                style={{
                  background:
                    country === c ? 'var(--ink)' : 'var(--paper-sink)',
                  color: country === c ? 'var(--paper)' : 'var(--ink-soft)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                }}
              >
                {c === 'UAE' ? 'الإمارات · UAE' : 'السعودية · KSA'}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {country === 'KSA' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="block mb-2">رقم رخصة FAL · REGA FAL License</Label>
                  <input
                    type="text"
                    value={fal}
                    onChange={(e) => setFal(e.target.value)}
                    placeholder="FAL-XXXXXXXX"
                    className="w-full px-3 h-10 text-[13px] tabular outline-none"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                      color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.03em',
                    }}
                    dir="ltr"
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }} dir="rtl">
                    رقم رخصة الوساطة الصادر عن الهيئة العامة للعقار (REGA).
                    إلزامي للوسطاء العقاريين في السعودية.
                  </p>
                </div>

                <div>
                  <Label className="block mb-2">معرّف الشركة في REGA · REGA Company ID</Label>
                  <input
                    type="text"
                    value={rega}
                    onChange={(e) => setRega(e.target.value)}
                    placeholder="REGA-XXXXXX"
                    className="w-full px-3 h-10 text-[13px] tabular outline-none"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                      color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.03em',
                    }}
                    dir="ltr"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SaveButton onSave={save} idleLabel="حفظ" savingLabel="جاري الحفظ..." />
      </motion.div>
    </Card>
  );
}

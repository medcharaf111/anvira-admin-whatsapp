'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SaveButton } from '@/components/save-button';
import { ShieldCheck, Info } from 'lucide-react';

export function ComplianceSection({
  initial,
}: {
  initial: { consent_required: boolean; data_region: string | null };
}) {
  const router = useRouter();
  const [consentRequired, setConsentRequired] = useState(initial.consent_required);
  const dataRegion = initial.data_region; // read-only display

  async function save(): Promise<boolean> {
    const res = await fetch('/api/compliance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent_required: consentRequired }),
    });
    if (!res.ok) {
      toast.error('لم نتمكن من الحفظ');
      return false;
    }
    toast.success('تم حفظ إعدادات الامتثال');
    router.refresh();
    return true;
  }

  return (
    <Card className="p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.5}
          />
          <div>
            <h2 className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
              الامتثال والخصوصية
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
              Saudi PDPL · UAE PDPL · GDPR — إعدادات جمع الموافقة وسحبها للوسطاء العقاريين.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="consent" className="text-base">
              تفعيل جمع الموافقة (Consent capture required)
            </Label>
            <Switch
              id="consent"
              checked={consentRequired}
              onCheckedChange={setConsentRequired}
            />
          </div>
          <p
            className="text-xs leading-relaxed flex items-start gap-2"
            style={{ color: 'var(--ink-faint)' }}
          >
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              عند التفعيل: البوت يطلب من كل عميل جديد الموافقة الصريحة على
              استلام رسائل WhatsApp التسويقية، ويحترم كلمات "STOP / إيقاف /
              UNSUBSCRIBE" للسحب الفوري للموافقة. مطلوب قانونياً للوسطاء
              المرخّصين في السعودية (PDPL Article 25) وموصى به في الإمارات.
            </span>
          </p>
        </section>

        {dataRegion && (
          <section className="space-y-2">
            <Label className="text-base">تفضيل منطقة البيانات</Label>
            <div
              className="p-3 text-sm tabular"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-lift)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink-soft)',
              }}
            >
              {dataRegion}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              هذا تفضيل مُسجَّل لأغراض المشتريات وليس ضماناً تعاقدياً بموقع
              تخزين البيانات. للاستفسار، تواصل مع فريق Anvira.
            </p>
          </section>
        )}

        <div
          className="pt-4 flex justify-end"
          style={{ borderTop: '1px solid var(--rule)' }}
        >
          <SaveButton
            onSave={save}
            idleLabel="حفظ إعدادات الامتثال"
            savingLabel="جارٍ الحفظ…"
            savedLabel="تم الحفظ"
            className="h-12 px-8 text-base"
          />
        </div>
      </motion.div>
    </Card>
  );
}

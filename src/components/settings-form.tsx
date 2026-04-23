'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SaveButton } from '@/components/save-button';
import { toast } from 'sonner';
import { staggerContainer, staggerItem } from '@/lib/motion';

const DAYS: { key: string; label: string }[] = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' },
];

function BusinessHoursEditor({
  value,
  onChange,
}: {
  value: Record<string, [string, string] | null>;
  onChange: (v: Record<string, [string, string] | null>) => void;
}) {
  function setDay(key: string, open: boolean) {
    onChange({ ...value, [key]: open ? ['09:00', '18:00'] : null });
  }
  function setTime(key: string, idx: 0 | 1, time: string) {
    const cur = value[key] ?? ['09:00', '18:00'];
    const next: [string, string] = [...cur] as [string, string];
    next[idx] = time;
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const range = value[key];
        const isOpen = range !== null && range !== undefined;
        return (
          <div
            key={key}
            className="flex items-center gap-3 py-2 border-b border-border last:border-0"
          >
            <span className="w-20 text-base font-medium shrink-0">{label}</span>
            <Switch
              checked={isOpen}
              onCheckedChange={(v) => setDay(key, v)}
              aria-label={`${label} مفتوح`}
            />
            {isOpen ? (
              <div className="flex items-center gap-2" dir="ltr">
                <Input
                  type="time"
                  value={range![0]}
                  onChange={(e) => setTime(key, 0, e.target.value)}
                  className="h-10 w-28 text-sm"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={range![1]}
                  onChange={(e) => setTime(key, 1, e.target.value)}
                  className="h-10 w-28 text-sm"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">مغلق</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: any }) {
  const [s, setS] = useState(initial);

  async function save(): Promise<boolean> {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(s),
    });
    if (!res.ok) {
      toast.error('ما قدرنا نحفظ');
      return false;
    }
    toast.success('تم حفظ الإعدادات.');
    return true;
  }

  return (
    <Card className="p-6 md:p-8">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
      <motion.section variants={staggerItem} className="space-y-3">
        <h2 className="text-xl font-medium">خارج أوقات العمل</h2>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="ooo" className="text-base">
            إيقاف الردود — البوت راح يقول إنكم مغلقين
          </Label>
          <Switch
            id="ooo"
            checked={!!s.out_of_office}
            onCheckedChange={(v) => setS({ ...s, out_of_office: v })}
          />
        </div>
      </motion.section>

      <motion.section variants={staggerItem} className="space-y-3">
        <h2 className="text-xl font-medium">ساعات العمل</h2>
        <p className="text-sm text-muted-foreground">
          حدد أوقات العمل لكل يوم. البوت يرد "نحن مغلقون" خارج هذه الأوقات.
        </p>
        <BusinessHoursEditor
          value={s.business_hours ?? {}}
          onChange={(bh) => setS({ ...s, business_hours: bh })}
        />
      </motion.section>

      <motion.section variants={staggerItem} className="space-y-3">
        <h2 className="text-xl font-medium">بريد المالك</h2>
        <p className="text-sm text-muted-foreground">
          المكان اللي نرسل له إشعار لما عميل يحتاجك.
        </p>
        <Input
          type="email"
          dir="ltr"
          value={s.owner_email ?? ''}
          onChange={(e) => setS({ ...s, owner_email: e.target.value })}
          className="h-12 text-base text-left"
        />
      </motion.section>

      <motion.section variants={staggerItem} className="space-y-3">
        <h2 className="text-xl font-medium">واتساب المالك</h2>
        <p className="text-sm text-muted-foreground">
          رقم واتساب الشخصي للتنبيهات العاجلة (يُستخدم عند تفعيل مزود واتساب
          حقيقي).
        </p>
        <Input
          type="tel"
          dir="ltr"
          placeholder="+9715xxxxxxx"
          value={s.owner_whatsapp ?? ''}
          onChange={(e) => setS({ ...s, owner_whatsapp: e.target.value })}
          className="h-12 text-base text-left"
        />
      </motion.section>

      <motion.section variants={staggerItem} className="space-y-3">
        <h2 className="text-xl font-medium">تقويم Google</h2>
        <p className="text-sm text-muted-foreground">
          {s.google_refresh_token
            ? 'متصل ✓ المواعيد تظهر في تقويمك تلقائياً.'
            : 'غير متصل. اضغط الزر أدناه لتمكين المساعد من حجز المواعيد.'}
        </p>
        <Button
          asChild
          variant={s.google_refresh_token ? 'outline' : 'default'}
          className="h-12"
        >
          <a href={`${process.env.NEXT_PUBLIC_BACKEND_URL}/oauth/google/start`}>
            {s.google_refresh_token ? 'إعادة ربط التقويم' : 'ربط التقويم'}
          </a>
        </Button>
      </motion.section>

        <motion.div
          variants={staggerItem}
          className="pt-4 border-t border-border flex justify-end"
        >
          <SaveButton
            onSave={save}
            idleLabel="حفظ التغييرات"
            savingLabel="جارٍ الحفظ…"
            savedLabel="تم الحفظ"
            className="h-12 px-8 text-base"
          />
        </motion.div>
      </motion.div>
    </Card>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarDays, Info, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { CalendarMode } from '@/lib/client';
import { formatViewingDate } from '@/lib/dates';

interface Option {
  value: CalendarMode;
  label: string;
  hint: string;
}

const OPTIONS: Option[] = [
  {
    value: 'gregorian',
    label: 'ميلادي فقط',
    hint: 'العرض الافتراضي. التواريخ بالميلادي كما يستخدمها أغلب العملاء.',
  },
  {
    value: 'hijri',
    label: 'هجري فقط',
    hint: 'مناسب للمكاتب في المملكة العربية السعودية وفقاً لتقويم أم القرى.',
  },
  {
    value: 'dual',
    label: 'مزدوج (ميلادي + هجري)',
    hint: 'يعرض التاريخين معاً. مفيد خلال شهر رمضان والعطل الدينية.',
  },
];

export function CalendarModeSection({
  initial,
}: {
  initial: CalendarMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<CalendarMode>(initial);
  const [saving, setSaving] = useState(false);
  const [deferred, setDeferred] = useState(false);

  async function save(next: CalendarMode) {
    setSaving(true);
    setMode(next);
    try {
      const res = await fetch('/api/settings/calendar-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { deferred?: boolean };
      if (!res.ok) {
        toast.error('تعذّر الحفظ');
        return;
      }
      if (j.deferred) {
        setDeferred(true);
        toast.message('تم الحفظ — يتم التفعيل بعد ترحيل قاعدة البيانات');
      } else {
        setDeferred(false);
        toast.success('تم حفظ نمط التقويم');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const sample = formatViewingDate(new Date(), {
    mode,
    lang: 'ar',
    withWeekday: true,
  });

  return (
    <Card className="mt-12 p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="flex items-start gap-3">
          <CalendarDays
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.5}
          />
          <div>
            <h2 className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
              نمط عرض التقويم
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
              يؤثر على تقويم المعاينات وقائمة المواعيد وسجل المحادثات. يمكن تغييره في أي وقت.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => save(o.value)}
                disabled={saving}
                className="w-full text-right flex items-start gap-3 p-3 transition-colors"
                style={{
                  background: active ? 'var(--paper-lift)' : 'transparent',
                  border: `1px solid ${active ? 'var(--primary-glow)' : 'var(--rule)'}`,
                  borderRadius: '3px',
                }}
              >
                <span
                  aria-hidden
                  className="mt-1 inline-flex w-4 h-4 items-center justify-center shrink-0"
                  style={{
                    borderRadius: '999px',
                    border: `2px solid ${active ? 'var(--primary-glow)' : 'var(--rule-strong)'}`,
                    background: 'transparent',
                  }}
                >
                  {active && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: 'var(--primary-glow)' }}
                    />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className="block text-sm font-medium"
                    style={{ color: 'var(--ink)' }}
                  >
                    {o.label}
                  </span>
                  <span
                    className="block text-[11px] mt-0.5"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {o.hint}
                  </span>
                </span>
                {saving && active && (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin mt-1"
                    style={{ color: 'var(--ink-faint)' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div
          className="p-3 text-xs"
          style={{
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
            color: 'var(--ink-soft)',
          }}
        >
          <span
            className="text-[10px] tracking-widest uppercase me-2"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            معاينة
          </span>
          <span>{sample}</span>
        </div>

        {deferred && (
          <p
            className="text-[11px] flex items-start gap-2"
            style={{ color: 'var(--warn)' }}
          >
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              تم حفظ التفضيل، لكن قاعدة البيانات لم تُرحَّل بعد لإضافة العمود.
              يطبَّق التغيير تلقائياً بعد التحديث القادم للخادم.
            </span>
          </p>
        )}
      </motion.div>
    </Card>
  );
}

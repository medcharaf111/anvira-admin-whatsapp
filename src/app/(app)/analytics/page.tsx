import { requireCurrentClient } from '@/lib/client';
import { loadAnalytics } from '@/lib/analytics';
import { PageHeader } from '@/components/page-header';
import { KpiGrid, type Kpi } from '@/components/analytics/kpi-grid';
import { MessagesTrendChart, BookingsBarChart } from '@/components/analytics/charts';
import { HandoffBreakdown } from '@/components/analytics/handoff-breakdown';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const client = await requireCurrentClient();
  const a = await loadAnalytics(client.id);

  const kpis: Kpi[] = [
    { label: 'رسائل العملاء', value: a.messagesIn.toLocaleString('ar-AE'), icon: 'inbox' },
    { label: 'ردود البوت', value: a.messagesOut.toLocaleString('ar-AE'), icon: 'send', accent: true },
    { label: 'عملاء نشطون', value: a.uniqueCustomers.toLocaleString('ar-AE'), icon: 'users' },
    { label: 'مواعيد', value: a.bookings.toLocaleString('ar-AE'), icon: 'calendar', accent: true },
    { label: 'تنبيهات يدوية', value: a.handoffs.toLocaleString('ar-AE'), icon: 'bell' },
    {
      label: 'معدل التحويل',
      value: `${(a.bookingConversion * 100).toFixed(0)}٪`,
      icon: 'percent',
      hint: 'محادثة → موعد',
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="10 / التحليلات"
        title="أداء البوت"
        subtitle="إحصائيات آخر 7 أيام (المؤشرات) وآخر 30 يوماً (الرسوم البيانية)."
      />

      <KpiGrid items={kpis} />

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <MessagesTrendChart data={a.messagesByDay} />
        <BookingsBarChart data={a.bookingsByDay} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <HandoffBreakdown data={a.handoffsByReason} />
        </div>
        <div
          className="p-5"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ink)' }}>
            خلاصة سريعة
          </h3>
          <ul className="space-y-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--primary-glow)' }}>•</span>
              <span>
                البوت ردّ على{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  {(100 - a.handoffRate * 100).toFixed(0)}٪
                </strong>{' '}
                من رسائل العملاء بدون تدخّلك.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--primary-glow)' }}>•</span>
              <span>
                {a.bookings === 0
                  ? 'لا مواعيد محجوزة هذا الأسبوع.'
                  : `${a.bookings} موعد جديد هذا الأسبوع.`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--primary-glow)' }}>•</span>
              <span>
                {a.handoffs === 0
                  ? 'لم يحتج البوت لمساعدتك في أي محادثة.'
                  : `احتاج البوت لمساعدتك ${a.handoffs} مرة.`}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Usage / cost (last 30 days) */}
      <div
        className="p-5"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            استهلاك البوت — آخر 30 يوماً
          </h3>
          <div
            className="text-[10px] uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            USAGE · 30D
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: 'var(--rule)' }}>
          <UsageStat
            label="طلبات الذكاء"
            value={a.usage.llmRequests.toLocaleString('ar-AE')}
          />
          <UsageStat
            label="رموز ذكاء (إدخال)"
            value={a.usage.inputTokens.toLocaleString('ar-AE')}
          />
          <UsageStat
            label="رموز ذكاء (إخراج)"
            value={a.usage.outputTokens.toLocaleString('ar-AE')}
          />
          <UsageStat
            label="رسائل واتساب"
            value={(a.usage.waInbound + a.usage.waOutbound).toLocaleString('ar-AE')}
            hint={`${a.usage.waInbound} عملاء · ${a.usage.waOutbound} ردود`}
            accent
          />
        </div>
      </div>
    </div>
  );
}

function UsageStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="p-4" style={{ background: 'var(--paper-lift)' }}>
      <div
        className="text-[10px] uppercase tracking-widest mb-2"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
      >
        {label}
      </div>
      <div
        className="tabular leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 400,
          color: accent ? 'var(--primary-glow)' : 'var(--ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="mt-1 text-[10px]"
          style={{ color: 'var(--ink-faint)' }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

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

      <div className="grid lg:grid-cols-3 gap-4">
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
    </div>
  );
}

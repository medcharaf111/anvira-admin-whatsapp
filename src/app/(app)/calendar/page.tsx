import { CalendarView } from '@/components/calendar-view';
import { PageHeader } from '@/components/page-header';
import { requireCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const client = await requireCurrentClient();
  const isRE = client.client_type === 'real_estate';
  return (
    <div>
      <PageHeader
        eyebrow="03 / التقويم"
        title={isRE ? 'جدول المعاينات' : 'جدول المواعيد'}
        subtitle={
          isRE
            ? 'عرض أسبوعي للمعاينات. صالة عرض · موقع · افتراضي — كل نوع يأخذ لوناً مميّزاً.'
            : 'عرض أسبوعي للمواعيد. اضغط على فترة فارغة لإضافة موعد يدوياً.'
        }
      />
      <CalendarView
        businessTimezone={client.business_timezone}
        clientType={client.client_type}
        calendarMode={client.calendar_mode}
      />
    </div>
  );
}

import { CalendarView } from '@/components/calendar-view';
import { PageHeader } from '@/components/page-header';
import { requireCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const client = await requireCurrentClient();
  return (
    <div>
      <PageHeader
        eyebrow="03 / التقويم"
        title="جدول المواعيد"
        subtitle="عرض أسبوعي للمواعيد. اضغط على فترة فارغة لإضافة موعد يدوياً."
      />
      <CalendarView businessTimezone={client.business_timezone} />
    </div>
  );
}

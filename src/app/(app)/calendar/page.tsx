import { CalendarView } from '@/components/calendar-view';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  return (
    <div>
      <PageHeader
        eyebrow="03 / التقويم"
        title="جدول المواعيد"
        subtitle="عرض أسبوعي للمواعيد. اضغط على فترة فارغة لإضافة موعد يدوياً."
      />
      <CalendarView />
    </div>
  );
}

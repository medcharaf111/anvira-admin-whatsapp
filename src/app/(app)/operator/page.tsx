import { requireOperator } from '@/lib/operator';
import { fetchOperatorDashboard } from '@/lib/operator/operator-queries';
import { PageHeader } from '@/components/page-header';
import { OperatorClientTable } from '@/components/operator/client-table';
import { NewClientButton } from '@/components/operator/new-client-button';

export const dynamic = 'force-dynamic';

export default async function OperatorPage() {
  await requireOperator();

  const { clients, counts } = await fetchOperatorDashboard();

  return (
    <div>
      <PageHeader
        eyebrow="00 / FOUNDERS"
        title="إدارة العملاء"
        subtitle={`${counts.total} عميل · ${counts.active} نشط · ${counts.pastDue} متأخر · ${counts.trial} تجريبي · ${counts.cancelled} ملغى`}
        action={<NewClientButton />}
      />
      <OperatorClientTable clients={clients} />
    </div>
  );
}

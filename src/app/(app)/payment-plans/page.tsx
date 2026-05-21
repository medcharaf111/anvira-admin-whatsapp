import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { PaymentPlansTable, type PlanRow } from '@/components/real-estate/payment-plans-table';

export const dynamic = 'force-dynamic';

export default async function PaymentPlansPage() {
  const client = await requireCurrentClient();
  if (client.client_type !== 'real_estate') notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('payment_plans')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as PlanRow[];

  return (
    <div>
      <RealtimeRefresh
        subs={[{ table: 'payment_plans', filter: `client_id=eq.${client.id}` }]}
      />
      <PageHeader
        eyebrow="12 / خطط السداد"
        title="خطط السداد والتقسيط"
        subtitle={`${rows.length} خطة مُعدّة للعرض على العملاء`}
      />
      <PaymentPlansTable plans={rows} />
    </div>
  );
}

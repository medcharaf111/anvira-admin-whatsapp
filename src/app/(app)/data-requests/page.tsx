import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { DataRequestsView } from '@/components/real-estate/data-requests-view';

export const dynamic = 'force-dynamic';

/**
 * /data-requests — PDPL Art. 8 (UAE) + Art. 10 (KSA) buyer-initiated
 * deletion requests. Pending requests sit at the top with a confirm /
 * cancel pair; resolved requests stay for audit.
 *
 * Open to all client types (not just real_estate) — PDPL applies to
 * every tenant that handles customer PII.
 */
export default async function DataRequestsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const { data } = await supabase
    .from('data_deletion_requests')
    .select(
      'id, conversation_id, customer_phone, requested_at, trigger_message, status, confirmed_at, cancelled_at, notes'
    )
    .eq('client_id', client.id)
    .order('requested_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader
        eyebrow="09 / الامتثال"
        title="طلبات حذف البيانات (PDPL)"
        subtitle="طلبات حذف يبادر بها العميل عبر واتساب. الطلب المعلَّق ينتظر تأكيدك يدوياً أو يُنفَّذ تلقائياً بعد ٣٠ يوماً (PDPL Art. 8 الإمارات / Art. 10 السعودية)."
      />
      <DataRequestsView initial={data ?? []} />
    </div>
  );
}

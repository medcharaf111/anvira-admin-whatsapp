import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RecoveryView } from '@/components/real-estate/recovery-view';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RecoveryPage() {
  const client = await requireCurrentClient();

  // Recovery is real-estate-only — clinic/salon tenants don't have the
  // ban-resilience plumbing or the Evolution lifecycle this page assumes.
  if (client.client_type !== 'real_estate') {
    redirect('/');
  }

  const supabase = await createClient();

  // Pre-fetch numbers + archives server-side so first paint is complete.
  // The page's interactive bits (download, provision-new-instance modal)
  // re-fetch via the client API routes on demand.
  const [numbersRes, archivesRes] = await Promise.all([
    supabase
      .from('client_numbers')
      .select(
        'id, wa_number, label, is_primary, instance_status, replaced_by, replaced_at, replacement_reason, created_at'
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('conversation_archives')
      .select(
        'id, storage_path, archived_at, conversation_count, message_count, size_bytes'
      )
      .eq('client_id', client.id)
      .order('archived_at', { ascending: false })
      .limit(60),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="06 / الاسترجاع"
        title="الاسترجاع بعد فقدان الرقم"
        subtitle="ماذا يبقى محفوظاً، وكيف تستأنف العمل على رقم جديد إذا تعطّل رقمك الحالي."
      />
      <RecoveryView
        numbers={numbersRes.data ?? []}
        archives={archivesRes.data ?? []}
      />
    </div>
  );
}

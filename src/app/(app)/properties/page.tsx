import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { PropertiesTable, type PropertyRow, type ProjectLite, type PaymentPlanLite } from '@/components/real-estate/properties-table';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const client = await requireCurrentClient();
  // Hide entirely from non-RE tenants — 404 keeps the route invisible.
  if (client.client_type !== 'real_estate') notFound();

  const supabase = await createClient();

  const [{ data: properties }, { data: projects }, { data: plans }] = await Promise.all([
    supabase
      .from('properties')
      .select(
        'id, reference, type, bedrooms, bathrooms, area_sqft, price, currency, location, view, handover_date, status, is_offplan, highlights, media_urls, project_id, payment_plan_id, projects(name), payment_plans(name)'
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, name')
      .eq('client_id', client.id)
      .order('name'),
    supabase
      .from('payment_plans')
      .select('id, name')
      .eq('client_id', client.id)
      .order('name'),
  ]);

  const rows = (properties ?? []) as unknown as PropertyRow[];

  return (
    <div>
      <RealtimeRefresh
        subs={[{ table: 'properties', filter: `client_id=eq.${client.id}` }]}
      />
      <PageHeader
        eyebrow="10 / العقارات"
        title="العقارات المعروضة"
        subtitle={`${rows.length} عقار · ${rows.filter((p) => p.status === 'available').length} متاح · ${rows.filter((p) => p.is_offplan).length} Off-plan`}
      />
      <PropertiesTable
        properties={rows}
        projects={(projects ?? []) as ProjectLite[]}
        plans={(plans ?? []) as PaymentPlanLite[]}
      />
    </div>
  );
}

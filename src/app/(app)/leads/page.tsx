import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { LeadsView, type LeadRow } from '@/components/real-estate/leads-view';

export const dynamic = 'force-dynamic';

interface ConvWithQual {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  language: string | null;
  lead_score: number | null;
  lead_stage: string | null;
  assigned_agent_id: string | null;
  lead_source: string | null;
  consent_status: string | null;
  leads_qualification: {
    budget_min: number | null;
    budget_max: number | null;
    budget_currency: string | null;
    bedrooms_wanted: number | null;
    property_types_wanted: string[] | null;
    preferred_locations: string[] | null;
    citizenship: string | null;
    residency_status: string | null;
    mortgage_status: string | null;
    timeline: string | null;
    intent: string | null;
    language_preference: string | null;
    notes: string | null;
  } | null;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const client = await requireCurrentClient();
  if (client.client_type !== 'real_estate') notFound();

  const supabase = await createClient();

  // Pull only conversations that have any RE-qualification signal: a
  // lead_stage, a lead_score above zero, OR an actual leads_qualification
  // row. Other random WhatsApp inbounds shouldn't clutter the pipeline.
  const { data } = await supabase
    .from('conversations')
    .select(
      'id, customer_phone, customer_name, last_message_at, language, lead_score, lead_stage, assigned_agent_id, lead_source, consent_status, leads_qualification(budget_min, budget_max, budget_currency, bedrooms_wanted, property_types_wanted, preferred_locations, citizenship, residency_status, mortgage_status, timeline, intent, language_preference, notes)'
    )
    .eq('client_id', client.id)
    .order('lead_score', { ascending: false, nullsFirst: false })
    .order('last_message_at', { ascending: false })
    .limit(200);

  const rows: LeadRow[] = (data ?? []).map((c: any) => {
    const q = Array.isArray(c.leads_qualification)
      ? c.leads_qualification[0]
      : c.leads_qualification;
    return {
      id: c.id,
      customer_phone: c.customer_phone,
      customer_name: c.customer_name,
      last_message_at: c.last_message_at,
      language: c.language,
      lead_score: c.lead_score,
      lead_stage: (c.lead_stage ?? 'cold') as LeadRow['lead_stage'],
      assigned_agent_id: c.assigned_agent_id,
      lead_source: c.lead_source,
      consent_status: c.consent_status,
      budget_min: q?.budget_min ?? null,
      budget_max: q?.budget_max ?? null,
      budget_currency: q?.budget_currency ?? null,
      bedrooms_wanted: q?.bedrooms_wanted ?? null,
      property_types_wanted: q?.property_types_wanted ?? null,
      preferred_locations: q?.preferred_locations ?? null,
      timeline: q?.timeline ?? null,
      intent: q?.intent ?? null,
      notes: q?.notes ?? null,
    };
  });

  return (
    <div>
      <RealtimeRefresh
        subs={[
          { table: 'conversations', filter: `client_id=eq.${client.id}` },
          { table: 'leads_qualification', filter: `client_id=eq.${client.id}` },
        ]}
      />
      <PageHeader
        eyebrow="06 / العملاء المحتملين"
        title="خطّ العملاء — Lead Pipeline"
        subtitle={`${rows.length} عميل محتمل · ${rows.filter((r) => r.lead_stage === 'hot').length} ساخن · ${rows.filter((r) => r.lead_stage === 'viewing_booked').length} معاينة محجوزة`}
      />
      <LeadsView
        leads={rows}
        initialSource={source ?? 'all'}
        kycEnabled={client.kyc_enabled}
        calendarMode={client.calendar_mode}
      />
    </div>
  );
}

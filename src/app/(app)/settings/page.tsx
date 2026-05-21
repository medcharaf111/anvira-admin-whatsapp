import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { SettingsForm } from '@/components/settings-form';
import { ComplianceSection } from '@/components/real-estate/compliance-section';
import { LeadSourcesPanel } from '@/components/real-estate/lead-sources-panel';
import { BranchNumbersPanel } from '@/components/real-estate/branch-numbers-panel';
import { ReplyLanguagesSection } from '@/components/real-estate/reply-languages-section';
import { CalendarModeSection } from '@/components/real-estate/calendar-mode-section';
import { WhatsAppTransportPanel } from '@/components/real-estate/whatsapp-transport-panel';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('client_id', client.id)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        eyebrow="05 / الإعدادات"
        title="إعدادات المساعد"
        subtitle="ساعات العمل، ربط التقويم، قواعد التحويل، والتنبيهات."
      />
      <SettingsForm
        initial={settings ?? {}}
        clientId={client.id}
        clientType={client.client_type}
      />

      {/* Compliance — only relevant for real-estate clients. Saudi PDPL
          Art. 25 and UAE PDPL both require an explicit opt-in for
          marketing comms; we expose the toggle so the operator can
          activate consent capture per-region. */}
      {client.client_type === 'real_estate' && (
        <>
          <div className="mt-12">
            <ComplianceSection
              initial={{
                consent_required: client.consent_required,
                data_region: client.data_region,
              }}
            />
          </div>
          {/* Transport choice sits above branch numbers — picking the
              WhatsApp transport (Cloud API vs Evolution) is the most
              foundational onboarding decision. Branch numbers and lead
              sources hang off whichever transport carries the traffic. */}
          <WhatsAppTransportPanel
            transport={client.transport}
            evolutionInstance={client.evolution_instance}
          />
          {/* Branch numbers comes before LeadSourcesPanel — adding more
              WhatsApp numbers is a more foundational decision than
              configuring which portals feed into them. */}
          <BranchNumbersPanel />
          <LeadSourcesPanel />
          {/* Reply-language preferences live at the bottom — they affect
              which inbound languages the bot auto-replies to vs hands off. */}
          <ReplyLanguagesSection />
          {/* Calendar mode — Gregorian / Hijri / dual. Affects how
              dates render across /calendar, /viewings, and /leads. */}
          <CalendarModeSection initial={client.calendar_mode} />
        </>
      )}
    </div>
  );
}

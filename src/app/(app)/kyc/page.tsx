import { notFound } from 'next/navigation';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { KycPage } from '@/components/real-estate/kyc-page';

export const dynamic = 'force-dynamic';

/**
 * /kyc — DNFBP-style KYC workflow for real-estate brokerages.
 *
 * Visibility:
 *   - client_type === 'real_estate' (else 404 — clinic/salon shouldn't
 *     see this).
 *   - If kyc_enabled === false, the page renders an opt-in screen
 *     instead of cases, so the operator activates the workflow
 *     deliberately before the bot starts asking for documents.
 *
 * The actual case list, drawer, and graceful-degrade for missing
 * backend tables all live in the client component.
 */
export default async function KycPageRoute() {
  const client = await requireCurrentClient();
  if (client.client_type !== 'real_estate') notFound();

  return (
    <div>
      <PageHeader
        eyebrow="08 / الامتثال"
        title="سير عمل KYC للوسطاء العقاريين"
        subtitle="جمع وثائق التحقّق من العميل، فحص قوائم العقوبات، وتوليد تقارير DNFBP الجاهزة للإيداع."
      />
      <KycPage
        kycEnabled={client.kyc_enabled}
        consentRequired={client.consent_required}
      />
    </div>
  );
}

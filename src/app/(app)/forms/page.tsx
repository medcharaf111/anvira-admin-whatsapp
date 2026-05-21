import { notFound } from 'next/navigation';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { ReraFormsPage } from '@/components/real-estate/rera-forms-page';

export const dynamic = 'force-dynamic';

/**
 * /forms — RERA Forms A/B/F/I/U generator for UAE brokerages.
 *
 * Visibility:
 *   - client_type === 'real_estate' (else 404 — clinic/salon never see
 *     this route).
 *
 * The page renders five form-type cards; clicking one opens a drawer
 * with fields dynamically rendered from the backend's JSON schema.
 * Auto-prefill from `?lead=<conversation_id>` or
 * `?property=<property_id>` for one-click flow from /leads.
 */
export default async function FormsPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; property?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const client = await requireCurrentClient();
  if (client.client_type !== 'real_estate') notFound();

  return (
    <div>
      <PageHeader
        eyebrow="15 / RERA"
        title="نماذج RERA — A / B / F / I / U"
        subtitle="توليد نماذج RERA المعتمَدة من بيانات العميل والعقار. الوسيط يطبع، يوقّع، ويرسل بالطريقة التقليدية بعد التحميل."
      />
      <ReraFormsPage
        leadId={sp.lead ?? null}
        propertyId={sp.property ?? null}
        initialType={sp.type ?? null}
      />
    </div>
  );
}

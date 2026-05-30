import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { AuditTabs, type AuditRow, type ConsentRow } from './audit-tabs';
import { tierAllows, FEATURE_MIN_TIER } from '@/lib/tier-gates';

export const dynamic = 'force-dynamic';

/**
 * Audit log page.
 *
 * For real-estate clients we expose a tabbed surface:
 *   - All activity (operator actions — audit_log table)
 *   - Compliance (PDPL) — consent_log events, plus CSV export
 *
 * For clinic/salon clients the page renders the legacy single-list view
 * via AuditTabs with showComplianceTab=false.
 */
export default async function AuditPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const isRE = client.client_type === 'real_estate';
  // SUBSCRIPTION_PLAN.md §5.3, §16 — audit_log_read is Brokerage+, SOFT.
  // Phase 1 still renders the page but surfaces an inline upgrade panel
  // when below tier. Phase 3 swaps this for the shared TierUpgradePanel
  // component.
  const tierAllowsAudit = tierAllows(client, 'audit_log_read');

  // General audit log — used by both verticals
  const { data: auditRaw } = await supabase
    .from('audit_log')
    .select('id, actor_email, action, target_type, target_id, details, created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const audit = (auditRaw ?? []) as AuditRow[];

  // Compliance log — RE only. Default to last 30 days. Read defensively
  // — if the consent_log table isn't yet provisioned, fall back to []
  // so the page still renders.
  let consent: ConsentRow[] = [];
  if (isRE) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    try {
      const { data: consentRaw } = await supabase
        .from('consent_log')
        .select(
          'id, event, customer_phone, conversation_id, trigger_message, recorded_at'
        )
        .eq('client_id', client.id)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(400);
      consent = (consentRaw ?? []) as ConsentRow[];
    } catch {
      consent = [];
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="08 / سجل النشاط"
        title="سجل عمليات المشغّل"
        subtitle={
          isRE
            ? 'نشاط المشغّلين + سجل الموافقات وفق PDPL.'
            : `آخر ${audit.length} إجراء على هذا الحساب`
        }
      />

      {!tierAllowsAudit && (
        <div
          dir="rtl"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>سجل المراجعة الكامل ميزة من الباقة المتوسطة فأعلى.</strong>{' '}
          ترقّى للوصول إلى التصدير وسجل الموافقات الكامل. (Required tier:{' '}
          {FEATURE_MIN_TIER.audit_log_read})
        </div>
      )}

      <AuditTabs
        audit={audit}
        consent={consent}
        showComplianceTab={isRE}
        clientTimezone={client.business_timezone}
      />
    </div>
  );
}

import { requireOperator } from '@/lib/operator';
import { createServiceClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { OperatorClientTable, type OperatorClient } from '@/components/operator/client-table';
import { NewClientButton } from '@/components/operator/new-client-button';

export const dynamic = 'force-dynamic';

export default async function OperatorPage() {
  await requireOperator();
  const svc = createServiceClient();

  const { data: clients } = await svc
    .from('dashboard_clients')
    .select('id, slug, name, wa_number, is_sandbox, business_timezone, plan, subscription_status, paid_until, notes, created_at, owner_id')
    .order('created_at', { ascending: false });

  // Fetch owner emails in one batch
  const ownerIds = Array.from(new Set((clients ?? []).map((c) => c.owner_id))).filter(Boolean) as string[];
  const emailByOwner = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: users } = await svc.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) {
      if (u.id && u.email) emailByOwner.set(u.id, u.email);
    }
  }

  const enriched: OperatorClient[] = (clients ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    wa_number: c.wa_number,
    is_sandbox: c.is_sandbox,
    business_timezone: c.business_timezone,
    plan: c.plan ?? 'starter',
    subscription_status: c.subscription_status ?? 'trial',
    paid_until: c.paid_until,
    notes: c.notes,
    created_at: c.created_at,
    owner_email: emailByOwner.get(c.owner_id) ?? null,
  }));

  // Counts for the header subtitle
  const active = enriched.filter((c) => c.subscription_status === 'active').length;
  const pastDue = enriched.filter((c) => c.subscription_status === 'past_due').length;
  const trial = enriched.filter((c) => c.subscription_status === 'trial').length;
  const cancelled = enriched.filter((c) => c.subscription_status === 'cancelled').length;

  return (
    <div>
      <PageHeader
        eyebrow="00 / FOUNDERS"
        title="إدارة العملاء"
        subtitle={`${enriched.length} عميل · ${active} نشط · ${pastDue} متأخر · ${trial} تجريبي · ${cancelled} ملغى`}
        action={<NewClientButton />}
      />
      <OperatorClientTable clients={enriched} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Operator panel — service-role query layer.
//
// The founder-only /operator page (gated by requireOperator()) needs to read
// every tenant across the platform. RLS would otherwise hide rows the
// signed-in user does not own, so this module is the SINGLE authorized
// service-role caller for the operator panel.
//
// scripts/check-no-service-role-leak.ts allow-lists src/lib/operator/* so
// this file may legitimately reach for createServiceClient(). Any other
// operator-panel file MUST import from here rather than touching the
// service-role factory directly.
// ----------------------------------------------------------------------------

import { createServiceClient } from '@/lib/supabase/server';
import type { OperatorClient } from '@/components/operator/client-table';

export interface OperatorClientCounts {
  total: number;
  active: number;
  pastDue: number;
  trial: number;
  cancelled: number;
}

export interface OperatorDashboardData {
  clients: OperatorClient[];
  counts: OperatorClientCounts;
}

/**
 * Fetch every dashboard_clients row plus owner email enrichment.
 * Service-role: bypasses RLS so the founder sees every tenant.
 */
export async function fetchOperatorDashboard(): Promise<OperatorDashboardData> {
  const svc = createServiceClient();

  const { data: clients } = await svc
    .from('dashboard_clients')
    .select(
      'id, slug, name, wa_number, is_sandbox, business_timezone, plan, subscription_status, paid_until, notes, created_at, owner_id'
    )
    .order('created_at', { ascending: false });

  const ownerIds = Array.from(
    new Set((clients ?? []).map((c) => c.owner_id))
  ).filter(Boolean) as string[];

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
    owner_email: c.owner_id ? emailByOwner.get(c.owner_id) ?? null : null,
  }));

  const counts: OperatorClientCounts = {
    total: enriched.length,
    active: enriched.filter((c) => c.subscription_status === 'active').length,
    pastDue: enriched.filter((c) => c.subscription_status === 'past_due').length,
    trial: enriched.filter((c) => c.subscription_status === 'trial').length,
    cancelled: enriched.filter((c) => c.subscription_status === 'cancelled').length,
  };

  return { clients: enriched, counts };
}

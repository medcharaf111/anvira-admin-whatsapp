import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';
import { PORTAL_KEYS, type PortalKey } from '@/lib/portals';

export const dynamic = 'force-dynamic';

interface PortalConfig {
  key: PortalKey;
  routing_key: string | null;
  leads_30d: number;
}

export interface PortalsResponse {
  portals: PortalConfig[];
  webhook_base: string;
}

/**
 * GET /api/portals — returns the current portal-routing-key config + a
 * 30-day lead count per portal. Read-only; uses the operator session.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.client_type !== 'real_estate') {
    return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });
  }

  // Read the JSON column. If the column doesn't exist yet (backend
  // migration not applied), treat the value as empty so the UI still
  // renders every portal as "Not connected".
  const { data: row } = await supabase
    .from('dashboard_clients')
    .select('portal_routing_keys')
    .eq('id', client.id)
    .maybeSingle();
  const rawKeys =
    (row as { portal_routing_keys?: Record<string, string | null> } | null)
      ?.portal_routing_keys ?? {};

  // 30-day count per portal — one round-trip per portal would be slow,
  // so we pull all source values for the last 30 days and tally locally.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const { data: convs } = await supabase
    .from('conversations')
    .select('lead_source')
    .eq('client_id', client.id)
    .gte('created_at', since)
    .limit(20_000);

  const counts: Record<string, number> = {};
  for (const c of convs ?? []) {
    const src = (c as { lead_source: string | null }).lead_source ?? '';
    if (src.startsWith('portal_')) {
      counts[src] = (counts[src] ?? 0) + 1;
    }
  }

  const portals: PortalConfig[] = PORTAL_KEYS.map((k) => ({
    key: k,
    routing_key: typeof rawKeys[k] === 'string' ? rawKeys[k] : null,
    leads_30d: counts[`portal_${k}`] ?? 0,
  }));

  return NextResponse.json({
    portals,
    webhook_base: process.env.NEXT_PUBLIC_BACKEND_URL ?? '',
  } satisfies PortalsResponse);
}

/**
 * PATCH /api/portals — upsert a single routing key. Body shape:
 *   { key: PortalKey, routing_key: string | null }
 * Passing null disconnects the portal.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.client_type !== 'real_estate') {
    return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { key?: string; routing_key?: string | null }
    | null;
  if (!body || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!(PORTAL_KEYS as readonly string[]).includes(body.key)) {
    return NextResponse.json({ error: 'unknown_portal' }, { status: 400 });
  }
  if (
    body.routing_key !== null &&
    typeof body.routing_key !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid_routing_key' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Read-modify-write so we don't accidentally clobber other keys when
  // operators connect portals one at a time. Concurrent writes are rare
  // here (admin UI is single-operator), so a naive RMW is fine.
  const { data: existing } = await svc
    .from('dashboard_clients')
    .select('portal_routing_keys')
    .eq('id', client.id)
    .maybeSingle();
  const current =
    ((existing as { portal_routing_keys?: Record<string, string | null> } | null)
      ?.portal_routing_keys as Record<string, string | null> | undefined) ?? {};
  const next: Record<string, string | null> = { ...current };
  const trimmed =
    typeof body.routing_key === 'string' ? body.routing_key.trim() : null;
  if (trimmed === null || trimmed === '') {
    delete next[body.key];
  } else {
    next[body.key] = trimmed;
  }

  const { error } = await svc
    .from('dashboard_clients')
    .update({ portal_routing_keys: next })
    .eq('id', client.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Drop the backend's cached client config so the next portal webhook
  // sees the new routing key without a restart.
  fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/settings/invalidate?client=${client.id}`,
    {
      method: 'POST',
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SHARED_SECRET ?? '' },
    }
  ).catch(() => {});

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action:
      trimmed === null || trimmed === ''
        ? 'portal.disconnect'
        : 'portal.connect',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { portal: body.key },
  });

  return NextResponse.json({ ok: true });
}

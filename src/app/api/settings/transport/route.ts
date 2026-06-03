import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type AllowedTransport = 'cloud_api' | 'evolution';
const ALLOWED: ReadonlySet<string> = new Set(['cloud_api', 'evolution']);

/**
 * POST /api/settings/transport — flip the tenant's WhatsApp transport.
 *
 * Phase-B pilot guardrails:
 *   1. Real-estate clients only.
 *   2. 'mock' is NOT settable from the UI — that flag is reserved for
 *      sandbox/dev seeds.
 *   3. SOFT operator-trust on the active-conversation gate (relaxed
 *      2026-06-03 after the gate trapped post-unlink operators trying
 *      to re-pair). We still COUNT active conversations and persist
 *      the count in the audit row so we can forensically reconstruct
 *      what got orphaned; we don't refuse the switch. Matches the
 *      operator-trust posture of the unlink modal (which warns about
 *      active conversations but lets the operator proceed).
 *
 * Body: `{ transport: 'evolution' | 'cloud_api' }`.
 */
export async function POST(req: NextRequest) {
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
    | { transport?: string }
    | null;
  const target = (body?.transport ?? '').trim();
  if (!ALLOWED.has(target)) {
    return NextResponse.json({ error: 'invalid_transport' }, { status: 400 });
  }
  const transport = target as AllowedTransport;

  if (transport === client.transport) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Count active conversations for the audit trail (NOT for blocking —
  // see route docstring). "Active" = bot still actively serving
  // (bot_paused=false) AND inbound/outbound traffic in the last 30 days.
  // The count gets stamped into the transport-change audit row so a
  // future incident review can correlate "broker switched transport ⇒
  // these N threads went silent on the old channel".
  const svc = createServiceClient();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { count: activeCount } = await svc
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .eq('bot_paused', false)
    .gte('last_message_at', thirtyDaysAgo);

  const { error } = await svc
    .from('dashboard_clients')
    .update({ transport })
    .eq('id', client.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cache invalidation — backend keeps the per-client config in memory.
  // Best-effort; we don't surface the failure to the operator.
  fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/settings/invalidate?client=${client.id}`,
    {
      method: 'POST',
      headers: {
        'X-Internal-Secret': process.env.INTERNAL_SHARED_SECRET ?? '',
      },
    }
  ).catch(() => {});

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'transport.update',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: {
      from: client.transport,
      to: transport,
      // Captured for forensic correlation: how many active threads were
      // on the OLD transport at the moment of switch. Not a block — see
      // route docstring. null when the count query itself failed.
      active_conversations_at_switch: activeCount ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

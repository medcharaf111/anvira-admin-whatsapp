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
 *   2. We refuse to switch while there are active conversations
 *      (bot_paused=false AND last activity within 30 days) — moving
 *      transport mid-conversation would orphan threads. Operators are
 *      instructed to drain or migrate via support.
 *   3. 'mock' is NOT settable from the UI — that flag is reserved for
 *      sandbox/dev seeds.
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

  // Active-conversation gate. We define "active" as conversations the
  // bot is still actively serving (bot_paused=false) AND that saw
  // inbound/outbound traffic in the last 30 days. Anything older is
  // assumed dormant and safe to leave behind.
  const svc = createServiceClient();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { count, error: countErr } = await svc
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .eq('bot_paused', false)
    .gte('last_message_at', thirtyDaysAgo);

  if (countErr) {
    return NextResponse.json(
      { error: 'conversation_check_failed' },
      { status: 500 }
    );
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'active_conversations', count: count ?? 0 },
      { status: 409 }
    );
  }

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
    details: { from: client.transport, to: transport },
  });

  return NextResponse.json({ ok: true });
}

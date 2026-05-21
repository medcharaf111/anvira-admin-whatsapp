import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lead-sources/email/disable — flips inbound_email_enabled to
 * false but intentionally KEEPS the token. That way re-enabling later
 * preserves the same address, so the operator's portal-side forwarding
 * rules don't have to be re-pasted everywhere.
 */
export async function POST() {
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

  const svc = createServiceClient();
  const { error } = await svc
    .from('dashboard_clients')
    .update({ inbound_email_enabled: false })
    .eq('id', client.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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
    action: 'lead_source.email.disable',
    targetType: 'dashboard_clients',
    targetId: client.id,
  });

  return NextResponse.json({ ok: true });
}

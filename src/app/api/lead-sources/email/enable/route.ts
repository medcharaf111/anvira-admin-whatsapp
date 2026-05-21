import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? 'inbound.anvira.com';

/**
 * POST /api/lead-sources/email/enable — provisions an inbound email
 * token for the current real-estate client. Re-enabling after a disable
 * preserves the existing token so the operator's portal-side forwarding
 * rules keep working.
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

  // Read existing token (if any) so re-enabling reuses the address.
  let existingToken: string | null = null;
  try {
    const { data: row } = await svc
      .from('dashboard_clients')
      .select('inbound_email_token')
      .eq('id', client.id)
      .maybeSingle();
    existingToken =
      (row as { inbound_email_token?: string | null } | null)
        ?.inbound_email_token ?? null;
  } catch {
    existingToken = null;
  }

  const token = existingToken ?? crypto.randomBytes(12).toString('hex');

  const { error } = await svc
    .from('dashboard_clients')
    .update({
      inbound_email_token: token,
      inbound_email_enabled: true,
    })
    .eq('id', client.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Tell the backend to drop any cached client config so the new inbound
  // address starts routing immediately.
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
    action: 'lead_source.email.enable',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { reused_token: existingToken !== null },
  });

  return NextResponse.json({
    inbound_email_token: token,
    full_address: `leads-${token}@${INBOUND_DOMAIN}`,
  });
}

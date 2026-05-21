import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/kyc-enabled — opt-in/opt-out toggle for the KYC
 * workflow. RE-only.
 *
 * Writes `dashboard_clients.kyc_enabled` (Wave-3 column). If the
 * column hasn't migrated yet we return { ok: true, deferred: true }
 * so the UI can surface honest feedback to the operator.
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

  const body = (await req.json().catch(() => null)) as { enabled?: boolean } | null;
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const svc = createServiceClient();
  let deferred = false;
  try {
    const { error } = await svc
      .from('dashboard_clients')
      .update({ kyc_enabled: body.enabled })
      .eq('id', client.id);
    if (error) deferred = true;
  } catch {
    deferred = true;
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.kyc_enabled.update',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { enabled: body.enabled, deferred },
  });

  return NextResponse.json({ ok: true, deferred, enabled: body.enabled });
}

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/compliance — writes the compliance toggles on
 * dashboard_clients (consent_required, data_region). Real-estate clients
 * only — clinics/salons have no such surface.
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
    | { consent_required?: boolean; data_region?: string | null }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.consent_required === 'boolean') {
    updates.consent_required = body.consent_required;
  }
  if (body.data_region === null || typeof body.data_region === 'string') {
    updates.data_region = body.data_region;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('dashboard_clients')
    .update(updates)
    .eq('id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Backend caches client config — let it know to drop the cache so the
  // next inbound message reflects the new policy immediately.
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
    action: 'compliance.update',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: updates,
  });

  return NextResponse.json({ ok: true });
}

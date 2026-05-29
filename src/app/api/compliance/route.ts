import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/compliance — writes the compliance toggles on
 * dashboard_clients (consent_required, data_region). data_region is a
 * stated PREFERENCE for procurement, NOT an enforced residency control —
 * Anvira does not control where Supabase/Meta store data; self-hosted
 * Evolution is the only in-region lever. Real-estate clients only.
 * KSA operating-country + REGA fields are refused (item 15, ksa_not_yet_supported).
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
    | {
        consent_required?: boolean;
        data_region?: string | null;
        country?: 'UAE' | 'KSA' | null;
        fal_license_number?: string | null;
        rega_company_id?: string | null;
        emirate?: string | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  // Item 15 — refuse KSA compliance writes. The KSA regulatory framework
  // (REGA/SAFIU) is not yet implemented; accepting country='KSA' or REGA
  // license fields would let the operator persist state the bot/pipeline
  // cannot honor. Gate at the route so a curl bypassing the hidden UI still
  // fails. Reject the FAL/REGA fields even if country is omitted/UAE so a
  // client can't slip KSA license data in sideways.
  if (
    body.country === 'KSA' ||
    body.fal_license_number != null ||
    body.rega_company_id != null
  ) {
    return NextResponse.json(
      { error: 'ksa_not_yet_supported' },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.consent_required === 'boolean') {
    updates.consent_required = body.consent_required;
  }
  if (body.data_region === null || typeof body.data_region === 'string') {
    updates.data_region = body.data_region;
  }
  // Track E — operating country. Only UAE (or clearing to null) is writable
  // today; 'KSA' is refused above (item 15). FAL/REGA license fields are NOT
  // persisted while KSA is unsupported.
  if (body.country === null || body.country === 'UAE') {
    updates.country = body.country;
  }
  // Item 22 — UAE emirate. Mirror the migration CHECK constraint values.
  // Orthogonal to KSA refusal: KSA tenants simply never set this column.
  const VALID_EMIRATES = new Set([
    'dubai', 'abu_dhabi', 'sharjah', 'ajman',
    'umm_al_quwain', 'ras_al_khaimah', 'fujairah',
  ]);
  if (body.emirate === null) {
    updates.emirate = null;
  } else if (typeof body.emirate === 'string') {
    if (!VALID_EMIRATES.has(body.emirate)) {
      return NextResponse.json({ error: 'invalid_emirate' }, { status: 400 });
    }
    updates.emirate = body.emirate;
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

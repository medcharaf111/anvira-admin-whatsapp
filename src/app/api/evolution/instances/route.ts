import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/evolution/instances — provisions a fresh Evolution instance
 * for this tenant's primary WhatsApp branch number.
 *
 * Proxies the backend's `/internal/evolution/instances` endpoint. The
 * backend creates the Baileys session, returns the instance slug, and a
 * short-lived `qr_fetch_url` that the modal polls for the actual PNG.
 *
 * Body: `{ number_id: string }` — the branch_number row to bind to.
 *
 * Phase-B pilot: locked to real-estate tenants until we open the
 * onboarding to other verticals.
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
    | { number_id?: string }
    | null;
  if (!body?.number_id) {
    return NextResponse.json({ error: 'missing_number_id' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/evolution/instances', {
    method: 'POST',
    body: JSON.stringify({ number_id: body.number_id }),
  });

  if (!result.provisioned) {
    return NextResponse.json(
      { provisioned: false, error: 'backend_not_configured' },
      { status: 503 }
    );
  }

  if (result.ok) {
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'evolution.instance.create',
      targetType: 'evolution_instance',
      targetId:
        (result.json as { instance?: string } | null)?.instance ?? null,
      details: { number_id: body.number_id },
    });
  }

  return NextResponse.json(result.json as Record<string, unknown>, {
    status: result.status,
  });
}

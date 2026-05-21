import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kyc/cases/:id/screen — re-run sanctions / PEP screening.
 * Forwards to backend `/internal/kyc/cases/:id/screen` which performs
 * the OFAC / UN / EU sanctions list lookup and logs an entry into
 * `sanctions_screening_log`.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  if (!client.kyc_enabled) {
    return NextResponse.json({ error: 'kyc_disabled' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}/screen`, {
    method: 'POST',
  });
  if (!result.provisioned) {
    return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kyc.case.screen',
    targetType: 'kyc_cases',
    targetId: id,
  });
  return NextResponse.json(result.json);
}

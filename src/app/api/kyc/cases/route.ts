import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kyc/cases — list cases for the current brokerage.
 *
 * Accepts query params: ?status=&from=&to=&high_value=1
 *
 * Forwards to backend `/internal/kyc/cases` if available, else
 * returns `{ cases: [], provisioned: false }` so the page can render
 * a "not yet provisioned" empty state.
 */
export async function GET(req: NextRequest) {
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
    return NextResponse.json({ cases: [], provisioned: true, kyc_enabled: false });
  }

  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const ctx = getInternalContext(client.id);
  const result = await callInternal(
    ctx,
    `/internal/kyc/cases${qs ? `?${qs}` : ''}`,
    { method: 'GET' }
  );
  if (!result.provisioned) {
    return NextResponse.json({
      cases: [],
      provisioned: false,
      kyc_enabled: client.kyc_enabled,
    });
  }
  if (!result.ok) {
    return NextResponse.json(
      { cases: [], provisioned: true, error: `backend_${result.status}` },
      { status: 200 }
    );
  }
  const payload = (result.json as { cases?: unknown[] } | null) ?? {};
  return NextResponse.json({
    cases: payload.cases ?? [],
    provisioned: true,
    kyc_enabled: true,
  });
}

/**
 * POST /api/kyc/cases — start a new case, optionally linked to a
 * conversation. Used by the "Start KYC case" quick-action in the
 * /leads drawer.
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
  if (!client.kyc_enabled) {
    return NextResponse.json({ error: 'kyc_disabled' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    conversation_id?: string;
    customer_name?: string;
    customer_phone?: string;
  };

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/kyc/cases', {
    method: 'POST',
    body: JSON.stringify(body),
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
  const j = result.json as { id?: string } | null;
  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kyc.case.create',
    targetType: 'kyc_cases',
    targetId: j?.id ?? null,
    details: { conversation_id: body.conversation_id ?? null },
  });
  return NextResponse.json(result.json);
}

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kyc/cases/:id — case detail (joins documents + screening log).
 * PATCH /api/kyc/cases/:id — update status, notes.
 */
export async function GET(
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
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}`, { method: 'GET' });
  if (!result.provisioned) {
    return NextResponse.json({ provisioned: false }, { status: 200 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }
  return NextResponse.json(result.json);
}

const ALLOWED_PATCH = ['status', 'notes'] as const;

export async function PATCH(
  req: NextRequest,
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH) if (body[k] !== undefined) updates[k] = body[k];
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
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
    action: 'kyc.case.update',
    targetType: 'kyc_cases',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });
  return NextResponse.json(result.json);
}

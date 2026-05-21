import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sanctions/test — runs a one-off sanctions screening against
 * a free-form name to let the operator verify the configured provider
 * is reachable + responding before they trust real KYC cases to it.
 *
 * Proxies the backend's `/internal/sanctions/test` endpoint. If that
 * endpoint hasn't shipped yet, the soft `{provisioned:false}` path
 * surfaces a "not available" empty state in the panel — no error toast.
 *
 * Body: `{ fullName: string, nationality?: string }`.
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

  const body = (await req.json().catch(() => null)) as {
    fullName?: string;
    nationality?: string;
  } | null;

  const fullName = (body?.fullName ?? '').trim();
  if (!fullName) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/sanctions/test', {
    method: 'POST',
    body: JSON.stringify({
      full_name: fullName,
      nationality: body?.nationality ?? null,
    }),
  });

  if (!result.provisioned) {
    return NextResponse.json({ provisioned: false }, { status: 200 });
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'sanctions.test',
    targetType: 'sanctions',
    targetId: null,
    details: { name: fullName },
  });

  // Pass-through the backend payload — UI knows how to render
  // `{result, matched_lists, notes, provider}`.
  return NextResponse.json(
    { provisioned: true, ...(result.json as Record<string, unknown> | null) },
    { status: result.ok ? 200 : result.status }
  );
}

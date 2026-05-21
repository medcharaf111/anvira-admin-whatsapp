import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/evolution/instances/[instance]/state — polled by the QR
 * modal (every 2s during scan) and the instance panel (every 30s when
 * mounted) to surface connection state to the operator.
 *
 * Backend payload shape:
 *   {
 *     state: 'qr_pending' | 'connected' | 'disconnected' | 'banned',
 *     last_seen_at: ISO | null,
 *     warmup_started_at: ISO | null,
 *     warmup_day: number | null,
 *     outbound_last_7d: number,
 *   }
 *
 * When the backend isn't reachable we degrade to `{provisioned:false}`
 * so the UI shows its "not configured" state without flickering errors.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ instance: string }> }
) {
  const { instance } = await params;
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

  const ctx = getInternalContext(client.id);
  const safeInstance = encodeURIComponent(instance);
  const result = await callInternal(
    ctx,
    `/internal/evolution/instances/${safeInstance}/state`
  );

  if (!result.provisioned) {
    return NextResponse.json({ provisioned: false }, { status: 200 });
  }

  return NextResponse.json(
    { provisioned: true, ...(result.json as Record<string, unknown> | null) },
    { status: result.ok ? 200 : result.status }
  );
}

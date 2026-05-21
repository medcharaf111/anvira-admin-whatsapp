import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/evolution/instances/[instance]/logout — operator-initiated
 * disconnect. Drops the Baileys session so the operator can re-scan
 * with a fresh QR (different phone, recovery flow, etc.). The instance
 * row stays — only its session is wiped.
 */
export async function POST(
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
    `/internal/evolution/instances/${safeInstance}/logout`,
    { method: 'POST' }
  );

  if (!result.provisioned) {
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 503 }
    );
  }

  if (result.ok) {
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'evolution.instance.logout',
      targetType: 'evolution_instance',
      targetId: instance,
    });
  }

  return NextResponse.json(result.json as Record<string, unknown>, {
    status: result.status,
  });
}

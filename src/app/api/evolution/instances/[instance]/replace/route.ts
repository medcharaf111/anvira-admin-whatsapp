import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/evolution/instances/[instance]/replace — ban-recovery
 * flow. When WhatsApp bans the bound number, this rotates the instance
 * onto a fresh number_id the operator has added in /settings.
 *
 * Body: `{ new_number_id: string }`.
 */
export async function POST(
  req: NextRequest,
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

  const body = (await req.json().catch(() => null)) as
    | { new_number_id?: string }
    | null;
  if (!body?.new_number_id) {
    return NextResponse.json({ error: 'missing_new_number_id' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const safeInstance = encodeURIComponent(instance);
  const result = await callInternal(
    ctx,
    `/internal/evolution/instances/${safeInstance}/replace`,
    {
      method: 'POST',
      body: JSON.stringify({ new_number_id: body.new_number_id }),
    }
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
      action: 'evolution.instance.replace',
      targetType: 'evolution_instance',
      targetId: instance,
      details: { new_number_id: body.new_number_id },
    });
  }

  return NextResponse.json(result.json as Record<string, unknown>, {
    status: result.status,
  });
}

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MODES = ['gregorian', 'hijri', 'dual'] as const;
type Mode = (typeof MODES)[number];

/**
 * POST /api/settings/calendar-mode — set how dates render across the
 * admin (calendar grid, /viewings list, /leads drawer).
 *
 * Backed by `dashboard_clients.calendar_mode` (Wave-3). If the
 * column isn't migrated yet we return deferred:true.
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

  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  const mode = body?.mode as Mode | undefined;
  if (!mode || !MODES.includes(mode)) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }

  const svc = createServiceClient();
  let deferred = false;
  try {
    const { error } = await svc
      .from('dashboard_clients')
      .update({ calendar_mode: mode })
      .eq('id', client.id);
    if (error) deferred = true;
  } catch {
    deferred = true;
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.calendar_mode.update',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { mode, deferred },
  });

  return NextResponse.json({ ok: true, deferred, mode });
}

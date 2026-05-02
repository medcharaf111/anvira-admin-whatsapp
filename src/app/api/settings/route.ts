import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = await req.json();
  const svc = createServiceClient();

  const { id: _id, updated_at: _ut, client_id: _cid, ...safe } = body;

  const { error } = await svc
    .from('settings')
    .upsert({ ...safe, client_id: client.id }, { onConflict: 'client_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep dashboard_clients.business_timezone in sync. Two columns hold the
  // TZ historically (one for tenant resolution, one for the bot prompt) —
  // they must never drift or the calendar grid renders against a different
  // TZ than the bot is using.
  if (typeof safe.business_timezone === 'string') {
    await svc
      .from('dashboard_clients')
      .update({ business_timezone: safe.business_timezone })
      .eq('id', client.id);
  }

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
    action: 'settings.update',
    targetType: 'settings',
    details: { fields: Object.keys(safe) },
  });

  return NextResponse.json({ ok: true });
}

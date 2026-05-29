import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/evolution/ban-risk-disclosure', { method: 'GET' });
  if (!result.provisioned) return NextResponse.json({ error: 'backend_not_configured' }, { status: 503 });
  return NextResponse.json(result.json as Record<string, unknown>, { status: result.status });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.client_type !== 'real_estate') return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { number_id?: string; disclosure_version?: string } | null;
  if (!body?.disclosure_version) return NextResponse.json({ error: 'missing_version' }, { status: 400 });

  const actorIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/evolution/ban-risk-ack', {
    method: 'POST',
    headers: { 'X-Actor-Email': user.email ?? '', 'X-Actor-IP': actorIp },
    body: JSON.stringify({ number_id: body.number_id ?? null, disclosure_version: body.disclosure_version }),
  });
  if (!result.provisioned) return NextResponse.json({ error: 'backend_not_configured' }, { status: 503 });
  if (result.ok) {
    logAction({
      clientId: client.id, actorUserId: user.id, actorEmail: user.email ?? null,
      action: 'evolution.ban_risk.acknowledged', targetType: 'evolution_instance',
      targetId: body.number_id ?? null, details: { disclosure_version: body.disclosure_version },
    });
  }
  return NextResponse.json(result.json as Record<string, unknown>, { status: result.status });
}

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/operator';
import { createServiceClient } from '@/lib/supabase/server';
import { GULF_TIMEZONES } from '@/lib/timezones';

interface UpdateBody {
  wa_number?: string | null;
  timezone?: string;
  plan?: 'starter' | 'pro' | 'business';
  subscription_status?: 'trial' | 'active' | 'past_due' | 'cancelled';
  paid_until?: string | null;
  notes?: string | null;
}

const ALLOWED_TIMEZONES = new Set(GULF_TIMEZONES.map((tz) => tz.iana));

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireOperator();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  // Build a strict patch — only allow these fields, ignore anything else
  const patch: Record<string, unknown> = {};
  if (body.wa_number !== undefined) {
    if (body.wa_number !== null && !/^whatsapp:\+\d{6,}$/.test(body.wa_number)) {
      return NextResponse.json({ error: 'invalid_wa_number' }, { status: 400 });
    }
    patch.wa_number = body.wa_number;
  }
  if (body.plan !== undefined) {
    if (!['starter', 'pro', 'business'].includes(body.plan)) {
      return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
    }
    patch.plan = body.plan;
  }
  if (body.subscription_status !== undefined) {
    if (!['trial', 'active', 'past_due', 'cancelled'].includes(body.subscription_status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    patch.subscription_status = body.subscription_status;
  }
  if (body.paid_until !== undefined) patch.paid_until = body.paid_until;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.timezone !== undefined) {
    if (!ALLOWED_TIMEZONES.has(body.timezone)) {
      return NextResponse.json({ error: 'invalid_timezone' }, { status: 400 });
    }
    patch.business_timezone = body.timezone;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from('dashboard_clients').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  // Sync settings.business_timezone so the bot prompt reads the same value.
  if (typeof patch.business_timezone === 'string') {
    await svc
      .from('settings')
      .update({ business_timezone: patch.business_timezone })
      .eq('client_id', id);
  }

  return NextResponse.json({ ok: true });
}

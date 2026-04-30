import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/operator';
import { createServiceClient } from '@/lib/supabase/server';

interface UpdateBody {
  wa_number?: string | null;
  plan?: 'starter' | 'pro' | 'business';
  subscription_status?: 'trial' | 'active' | 'past_due' | 'cancelled';
  paid_until?: string | null;
  notes?: string | null;
}

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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from('dashboard_clients').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

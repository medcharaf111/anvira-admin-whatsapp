import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/customers/block
 * Body: { customer_phone: string, reason?: string }
 * Adds the phone to the blocklist for the current client.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { customer_phone?: string; reason?: string }
    | null;
  if (!body?.customer_phone) {
    return NextResponse.json({ error: 'missing_phone' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('customer_blocks')
    .upsert(
      {
        client_id: client.id,
        customer_phone: body.customer_phone,
        reason: body.reason ?? null,
        blocked_by: user.id,
      },
      { onConflict: 'client_id,customer_phone' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/customers/block?phone=...
 * Removes the phone from the blocklist.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const url = new URL(req.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'missing_phone' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('customer_blocks')
    .delete()
    .eq('client_id', client.id)
    .eq('customer_phone', phone);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

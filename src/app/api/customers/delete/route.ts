import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/customers/delete?phone=...
 *
 * GDPR-style hard-delete: removes ALL data for a customer phone within
 * the current operator's client scope. Forwards to backend, which also
 * cleans up Google Calendar events.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) return NextResponse.json({ error: 'missing_phone' }, { status: 400 });

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 500 });
  }

  const res = await fetch(
    `${backend}/internal/customers/${encodeURIComponent(phone)}`,
    {
      method: 'DELETE',
      headers: {
        'X-Internal-Secret': secret,
        'X-Client-Id': client.id,
      },
    }
  );
  const json = await res.json();

  if (res.ok) {
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'customer.delete',
      targetType: 'customer',
      targetId: phone,
      details: json,
    });
  }

  return NextResponse.json(json, { status: res.status });
}

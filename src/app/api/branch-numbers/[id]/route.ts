import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/branch-numbers/[id] — relabel a number or flip the
 * is_primary flag. Setting is_primary=true must atomically clear it
 * from every sibling — the backend handles that transactionally.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    | { label?: string | null; is_primary?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 500 });
  }

  const res = await fetch(`${backend}/internal/client-numbers/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
      'X-Client-Id': client.id,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(json, { status: res.status });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'branch_number.update',
    targetType: 'client_numbers',
    targetId: id,
    details: body as Record<string, unknown>,
  });

  return NextResponse.json(json);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 500 });
  }

  const res = await fetch(`${backend}/internal/client-numbers/${id}`, {
    method: 'DELETE',
    headers: {
      'X-Internal-Secret': secret,
      'X-Client-Id': client.id,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(json, { status: res.status });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'branch_number.delete',
    targetType: 'client_numbers',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

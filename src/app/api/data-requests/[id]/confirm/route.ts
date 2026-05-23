import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Cascade delete touches multiple tables — give it room to land.
export const maxDuration = 30;

/**
 * POST /api/data-requests/[id]/confirm — operator confirms a PDPL
 * deletion. Proxies to the backend's /internal/data-requests/:id/confirm
 * which performs the hard-delete cascade on conversations + downstream
 * tables and writes the audit_log row.
 *
 * Body: { notes?: string } — optional operator note recorded on the
 *   data_deletion_requests row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    notes?: string;
  };

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/data-requests/${id}/confirm`, {
    method: 'POST',
    headers: {
      'X-Actor-Email': user.email ?? '',
    },
    body: JSON.stringify({ notes: body.notes }),
  });
  if (!result.provisioned) {
    return NextResponse.json({ error: 'backend_not_provisioned' }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'data_request.confirm',
    targetType: 'data_deletion_request',
    targetId: id,
  });

  return NextResponse.json(result.json);
}

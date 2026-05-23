import { NextResponse, type NextRequest } from 'next/server';
import { callInternal, getInternalContext } from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invitations/[token] — public lookup used by the accept page.
 * Returns the business name + role so we can render "X invited you to Y
 * as Z" before the recipient signs in. No client_id leaked.
 *
 * No tenant context — the caller may not be a member of any tenant yet.
 * We pass a dummy client_id; the backend doesn't tenant-scope the
 * lookup (only checks the token validity).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }
  // Backend route requires X-Client-Id (the requireSharedSecret +
  // getClientId middleware), but the lookup endpoint doesn't use it.
  // Pass a zero UUID so the header presence guard passes.
  const ctx = getInternalContext('00000000-0000-0000-0000-000000000000');
  const result = await callInternal(
    ctx,
    `/internal/team/invitations/lookup/${encodeURIComponent(token)}`,
    { method: 'GET' }
  );
  if (!result.provisioned) {
    return NextResponse.json({ error: 'backend_not_provisioned' }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }
  return NextResponse.json(result.json);
}

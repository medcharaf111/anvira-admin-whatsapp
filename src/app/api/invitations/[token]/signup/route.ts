import { NextResponse, type NextRequest } from 'next/server';
import { callInternal, getInternalContext } from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invitations/[token]/signup — invitee with no Anvira
 * account chooses a password. Backend creates the user via service-role
 * admin API (email_confirm=true, since clicking the invite proves
 * email ownership) and accepts the invitation in the same call.
 *
 * Returns { email, client_id, role } so the client can immediately
 * call supabase.auth.signInWithPassword(email + the password they
 * just chose) and start their session — no extra redirect to /login.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    password?: string;
  };
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return NextResponse.json(
      { error: 'weak_password', detail: 'Password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  // No tenant context (invitee may not be a member of any tenant yet).
  // Backend doesn't tenant-scope the signup endpoint — uses the token
  // to resolve the tenant.
  const ctx = getInternalContext('00000000-0000-0000-0000-000000000000');
  const result = await callInternal(ctx, '/internal/team/invitations/signup', {
    method: 'POST',
    body: JSON.stringify({ token, password: body.password }),
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
  return NextResponse.json(result.json);
}

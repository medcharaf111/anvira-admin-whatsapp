import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callInternal, getInternalContext } from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invitations/[token]/accept — recipient redeems the token.
 * Requires the user to be signed in; the backend checks that
 * invitation.email matches the user's auth email (case-insensitive).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await params;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  // Same client_id placeholder trick as the lookup route — the accept
  // endpoint reads X-Client-Id only for the requireSharedSecret guard
  // and uses the token to resolve the actual tenant.
  const ctx = getInternalContext('00000000-0000-0000-0000-000000000000');
  const result = await callInternal(ctx, '/internal/team/invitations/accept', {
    method: 'POST',
    headers: {
      'X-Actor-User-Id': user.id,
      'X-Actor-Email': user.email ?? '',
    },
    body: JSON.stringify({ token }),
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

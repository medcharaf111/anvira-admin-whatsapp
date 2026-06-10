import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import {
  tierAllows,
  blockMode,
  tierNotAllowedBody,
  TierNotAllowedError,
  FEATURE_MIN_TIER,
  type TierFeature,
  gateAdminRoute,
} from '@/lib/tier-gates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/team/invitations — owner/admin only. Creates a pending
 * invitation and dispatches the email via backend.
 *
 * Role check is here (not on backend) because the operator's session
 * lives in this layer. Backend trusts the actor headers.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.current_user_role !== 'owner' && client.current_user_role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    email?: string;
    role?: string;
  };
  if (!body.email) {
    return NextResponse.json({ error: 'missing_email' }, { status: 400 });
  }
  // Admin's UI restricts the role picker to non-owner. Reject `owner`
  // here too so a curl-savvy operator can't promote via the API.
  if (body.role === 'owner') {
    return NextResponse.json({ error: 'cannot_invite_owner' }, { status: 403 });
  }

  // SUBSCRIPTION_PLAN.md §5.3 — team_invitations Brokerage+ AND role-arg tier
  // checks. Each gate is independent so a Team tenant trying to invite an
  // admin gets one clear 402 from the more-restrictive check. In Phase 1
  // (TIER_ENFORCEMENT_MODE='soft') the hard-mode pre-check is skipped and
  // the backend (which mirrors the gates) is the source of truth.
  const featureChecks: TierFeature[] = ['team_invitations'];
  if (body.role === 'admin') featureChecks.push('role_admin');
  else if (body.role === 'viewer') featureChecks.push('role_viewer');
  else if (body.role === 'agent') featureChecks.push('role_agent');
  for (const feature of featureChecks) {
    // 3.2 — gateAdminRoute logs telemetry (soft_skip AND hard_block) so
    // the admin surface is visible in tier_gate_events during the soak.
    const tierBlock = gateAdminRoute(client, feature);
    if (tierBlock) return NextResponse.json(tierBlock, { status: 402 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/team/invitations', {
    method: 'POST',
    headers: {
      'X-Actor-User-Id': user.id,
      'X-Actor-Email': user.email ?? '',
    },
    body: JSON.stringify({ email: body.email, role: body.role ?? 'agent' }),
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

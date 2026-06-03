import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Evolution logout + delete can take several seconds while Baileys closes
// the upstream session and the backend writes the audit/state rows.
// Vercel Hobby defaults to 10s; bump to 60s to match the provision path.
export const maxDuration = 60;

/**
 * POST /api/settings/evolution/unlink — tenant-owner-gated proxy that
 * detaches a WhatsApp number from this tenant's Evolution session.
 *
 * Auth:
 *   - Must be authenticated.
 *   - Must own/admin the tenant (current_user_role ∈ {owner, admin}).
 *   - Tenant must be on the real-estate vertical (Phase-B pilot scope).
 *
 * Body: `{ wa_number: string }` — the E.164 number to unlink. Defaults
 * to the tenant's primary `wa_number` on the resolved client when the
 * caller omits it; this is what the settings panel does by default.
 *
 * The heavy lifting (Evolution logout + delete, DB state mutation,
 * tenant-level transport revert when the last number is unlinked)
 * lives in `anvira-backend` under `POST /internal/evolution/unlink`.
 * This route exists to:
 *   1. Authenticate + authorise the operator.
 *   2. Resolve the tenant scope (X-Client-Id).
 *   3. Capture intent audit rows BEFORE and AFTER so we can trace
 *      partially-failed unlinks (intent recorded, mutation didn't happen).
 *
 * Idempotent — re-running on an already-unlinked number returns 200
 * with `already_unlinked: true` from the backend.
 */
export async function POST(req: NextRequest) {
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
  // Only owners and admins can detach a tenant's WhatsApp number. Agents
  // and viewers must escalate — unlinking is destructive (stops the bot
  // from replying) and tenant-wide.
  if (
    client.current_user_role !== 'owner' &&
    client.current_user_role !== 'admin'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { wa_number?: string }
    | null;

  // Resolve target wa_number: explicit body wins; else fall back to the
  // tenant's primary number on dashboard_clients. We do NOT fall back to
  // evolution_instance — instance names are slugs, not E.164.
  const wa_number = (body?.wa_number ?? client.wa_number ?? '').trim();
  if (!wa_number) {
    return NextResponse.json(
      { error: 'no_number_to_unlink' },
      { status: 400 }
    );
  }

  // Forensic metadata for the audit trail. IP + UA help correlate against
  // browser session logs when a tenant disputes an unlink event later.
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwardedFor.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  // AUDIT FIRST — intent recorded even if the backend call later fails.
  // Pairs with `.confirmed` (on success) or `.failed` (on backend error)
  // so an ops audit can spot half-completed unlinks.
  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.unlink.requested',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      wa_number,
      actor_email: user.email ?? null,
      actor_role: client.current_user_role,
      ip,
      user_agent: userAgent,
    },
  });

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/evolution/unlink', {
    method: 'POST',
    body: JSON.stringify({ wa_number }),
  });

  // Backend not deployed yet (or env vars missing) — degrade gracefully
  // so the modal can show a "service unavailable" hint without a crash.
  if (!result.provisioned) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.evolution.unlink.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: { wa_number, reason: 'backend_not_configured' },
    });
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 503 }
    );
  }

  const payload = (result.json ?? {}) as Record<string, unknown>;

  if (!result.ok) {
    await logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'settings.evolution.unlink.failed',
      targetType: 'client_numbers',
      targetId: null,
      details: {
        wa_number,
        status: result.status,
        backend_error: payload.error ?? null,
        backend_detail: payload.detail ?? null,
      },
    });
    // 5xx from the backend → upstream gateway failure (502) so the client
    // distinguishes "I'm broken" from "you sent bad input."
    // 4xx from the backend → relay verbatim so the UI can render the
    // exact validation/auth error.
    const proxyStatus = result.status >= 500 ? 502 : result.status;
    return NextResponse.json(
      {
        error: (payload.error as string | undefined) ?? 'unlink_failed',
        message: (payload.detail as string | undefined) ?? null,
      },
      { status: proxyStatus }
    );
  }

  await logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.evolution.unlink.confirmed',
    targetType: 'client_numbers',
    targetId: null,
    details: {
      wa_number,
      unlinked: payload.unlinked ?? null,
      already_unlinked: payload.already_unlinked ?? false,
      transport_reverted: payload.transport_reverted ?? false,
    },
  });

  // Pass the backend payload through as-is so the modal can read
  // `unlinked`, `transport_reverted`, and `already_unlinked` directly.
  return NextResponse.json(payload, { status: result.status });
}

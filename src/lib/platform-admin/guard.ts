// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §8.1 — the 6-gate guard sequence.
//
// Used by:
//   * Phase 1: requireSuperAdmin() called from any server-side helper that
//     needs to confirm the current user is a platform operator. The
//     bootstrap procedure (§10) and the break-glass procedure (§11) route
//     through DB primitives directly, NOT through this guard.
//   * Phase 2+: withSuperAdmin(handler) wraps every /api/platform-admin/*
//     route. The CI lint scripts/check-platform-admin-guard.ts FAILS the
//     build if any default export under src/app/api/platform-admin/ is not
//     wrapped in withSuperAdmin(...).
//
// Gates:
//   0. Path origin check  (route mount mistake guard)            → 404
//   1. Auth cookie present + verified                            → 401
//   2. User in super_admins (via anon client + RLS-readable self) → 403
//   3. Re-verify via service-role client (NO RLS)                 → 403 (alerts)
//   4. Action-specific check (handler-provided; default no-op)    → 4xx
//   5. Audit FIRST, mutation SECOND, same RPC transaction (handler-side)
//
// Gate 3 is load-bearing. If Gate 2 says yes but Gate 3 says no, RLS on
// super_admins has drifted — the discrepancy is automatically pager-fired
// in Phase 3. For Phase 1 we log it and return 403; the alerting wiring
// lands with §9 anomaly detectors.
// ----------------------------------------------------------------------------

import { redirect, notFound } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPlatformAdminServiceClient } from '@/lib/platform-admin/service-client';

export interface SuperAdminContext {
  userId: string;
  email: string;
  /** True iff Gate 2 (anon RLS) AND Gate 3 (service-role) agreed. */
  verified: boolean;
}

/**
 * Server-side helper. Returns the SuperAdminContext or REDIRECTS to
 * /conversations when the current user is not an active super-admin.
 *
 * Use from Phase 1 server helpers (e.g. future bootstrap diagnostics).
 * Use from Phase 2+ /platform-admin/layout.tsx to gate the whole route
 * tree. Do NOT use from middleware (cookies are different) — middleware
 * does its own check via the anon RPC.
 *
 * Throws REDIRECT (Next.js navigation) on failure; callers should not
 * try/catch unless they explicitly want to render a fallback.
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const ctx = await requireSuperAdminOptional();
  if (!ctx) {
    // Redirect, not 404 — per §6 we do NOT leak route existence in middleware
    // either, but at the layout layer the route was already resolved so the
    // user knows the surface exists. Bounce them to /conversations rather
    // than rendering a hostile error page.
    redirect('/conversations');
  }
  return ctx;
}

/**
 * Non-throwing variant. Returns null if the user is not authed OR not
 * a super-admin. Used by (app)/layout.tsx to set the `isSuperAdmin`
 * flag on the sidebar without blocking the page render.
 */
export async function requireSuperAdminOptional(): Promise<SuperAdminContext | null> {
  // Gate 1 — auth cookie present + verified
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Gate 2 — anon-client RPC. The is_super_admin() helper is SECURITY
  // DEFINER and returns a boolean (not row data), so it's safe to call
  // from the user's session.
  const gate2 = await supabase.rpc('is_super_admin', { p_user_id: user.id });
  if (gate2.error) {
    // Most likely cause: migration 20260618 not yet applied to this
    // database. Don't fail-open — log and return null so the sidebar
    // PLATFORM group stays hidden and route handlers 403.
    console.warn(
      '[platform-admin] gate 2 rpc failed (is migration 20260618 applied?):',
      gate2.error.message
    );
    return null;
  }
  if (gate2.data !== true) {
    return null;
  }

  // Gate 3 — service-role re-verify. Uses NO RLS, so even if the
  // super_admins RLS policy was misconfigured to allow a self-INSERT,
  // the service-role read is the truth.
  const svc = createPlatformAdminServiceClient();
  const gate3 = await svc
    .from('super_admins')
    .select('user_id, email, status, revoked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .eq('status', 'active')
    .maybeSingle();

  if (gate3.error) {
    console.error(
      '[platform-admin] gate 3 service-role query failed:',
      gate3.error.message
    );
    return null;
  }
  if (!gate3.data) {
    // Gate 2 passed, Gate 3 failed — RLS drift on super_admins. This
    // is a CRITICAL anomaly per §8.1. Phase 3 wires Slack alert here.
    console.error(
      '[platform-admin] RLS DRIFT: gate 2 passed but gate 3 failed for user',
      user.id,
      '— super_admins RLS may be misconfigured.'
    );
    return null;
  }

  return {
    userId: user.id,
    email: gate3.data.email as string,
    verified: true,
  };
}

/**
 * Route-handler wrapper. Mirrors the {handler}-by-default Next.js
 * route shape so a /api/platform-admin/<thing>/route.ts file reads:
 *
 *   export const runtime = 'nodejs';
 *   export const POST = withSuperAdmin(async (req, ctx, sa) => {
 *     // sa.userId, sa.email guaranteed present
 *     ...
 *   });
 *
 * On failure returns a NextResponse with the right HTTP status. Does
 * NOT redirect (route handlers shouldn't), does NOT 404 (we want the
 * authed-but-not-super case to see 403, not "route does not exist").
 *
 * Action-specific gates (Gate 4 — self-grant refuse, rate limit, etc.)
 * remain the handler's responsibility. This wrapper only enforces
 * Gates 1–3 + injects the SuperAdminContext.
 */
export type SuperAdminRouteHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx,
  sa: SuperAdminContext
) => Promise<Response> | Response;

export function withSuperAdmin<Ctx = unknown>(
  handler: SuperAdminRouteHandler<Ctx>
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req: NextRequest, ctx: Ctx) => {
    // Gate 0 — path origin check. If a handler that uses this wrapper
    // ever gets mounted OUTSIDE /api/platform-admin/, that's a route
    // organisation bug. 404 keeps the surface area clean.
    if (!req.nextUrl.pathname.startsWith('/api/platform-admin/')) {
      return NextResponse.json(
        { error: 'not_found', code: 'route_mount_mismatch' },
        { status: 404 }
      );
    }

    const sa = await requireSuperAdminOptional();
    if (!sa) {
      // Distinguish authed-but-not-super (403) from unauthed (401) so
      // the admin UI can branch on the response. requireSuperAdminOptional
      // already collapsed both cases to null; re-check auth to split them.
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: 'unauthenticated', code: 'no_session' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'forbidden', code: 'not_super_admin' },
        { status: 403 }
      );
    }

    return handler(req, ctx, sa);
  };
}

/**
 * Convenience for server-component pages that want notFound() semantics
 * instead of redirect() — e.g. nested /platform-admin/tenants/[id] when
 * the user is super-admin but the tenant id is bogus.
 *
 * Phase 1 ships this signature so Phase 2 layouts can import it without
 * needing a second helper added later. Today it just delegates to
 * notFound() after the super-admin check; future granular RBAC
 * (`scope='support_readonly'`) will branch in here.
 */
export async function requireSuperAdminOrNotFound(): Promise<SuperAdminContext> {
  const ctx = await requireSuperAdminOptional();
  if (!ctx) notFound();
  return ctx;
}

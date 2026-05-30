// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §8.5 — the ONE place that imports
// SUPABASE_SERVICE_ROLE_KEY. CI lint scripts/check-no-service-role-leak.ts
// pins this; any other file referencing the key, the string 'service_role',
// or calling createServiceClient( in a client bundle fails the build.
//
// Why a dedicated file instead of reusing src/lib/supabase/server.ts:
//   * server.ts is imported by RSC components and route handlers across
//     the app; widening its surface is fine but the CI lint needs ONE
//     authoritative path that names the service-role key so the grep is
//     specific (not "everywhere that imports supabase/server").
//   * Keeps the platform-admin code self-contained — when someone reads
//     /api/platform-admin/* they see the service client come from a path
//     literally named platform-admin/service-client.ts, which mirrors
//     the "this is privileged" mental model.
//   * Phase 2's withSuperAdmin guard calls this *after* the 6-gate
//     auth check passes, so the service-role client is never
//     instantiated for an unauthenticated request.
// ----------------------------------------------------------------------------

import { createClient as createSupabase } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. RLS-bypassing — never expose to RSC
 * components or client bundles. Only callable from route handlers or
 * Phase 1 server-side helpers gated by `requireSuperAdmin()`.
 *
 * Env contract (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL        — fine to bundle; URL is public.
 *   SUPABASE_SERVICE_ROLE_KEY       — NEVER prefixed with NEXT_PUBLIC_;
 *                                     CI lint enforces this.
 */
export function createPlatformAdminServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      '[platform-admin] NEXT_PUBLIC_SUPABASE_URL is not set — refusing to instantiate service client'
    );
  }
  if (!key) {
    throw new Error(
      '[platform-admin] SUPABASE_SERVICE_ROLE_KEY is not set — refusing to instantiate service client. ' +
        'This env var is server-only; see PLATFORM_ADMIN_PLAN.md §8.5.'
    );
  }
  return createSupabase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

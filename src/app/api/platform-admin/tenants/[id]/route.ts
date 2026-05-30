// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.2 — tenant detail JSON.
//
//   GET /api/platform-admin/tenants/[id]
//
// Gates: withSuperAdmin enforces Gates 1–3 (auth + super-admin + service-
// role re-verify). This route performs NO mutation, so Gate 5 (audit
// FIRST) is intentionally skipped, mirroring the list endpoint.
//
// Source of truth for the projection lives in
//   src/lib/platform-admin/fetch-tenant-detail.ts
// which is ALSO called directly from the RSC page at
//   src/app/(app)/platform-admin/tenants/[id]/page.tsx
// to avoid the RSC→same-process-API double-hop. The two surfaces stay
// byte-identical because both delegate to the same loader.
//
// 404 when the tenant id is well-formed but not in dashboard_clients.
// 500 only on real DB errors; the loader throws on Postgres errors and
// returns null on "not found", so we never confuse the two states.
// ----------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/platform-admin/guard';
import { fetchTenantDetail } from '@/lib/platform-admin/fetch-tenant-detail';
import type { TenantDetailResponse } from '@/lib/platform-admin/tenant-detail-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Loose RFC-4122 UUID check — guards against ".../tenants/foo" returning a
// 500 from Postgres' "invalid input syntax for type uuid" error before we
// even hit the DB. Case-insensitive to match the canonical text form.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The handler receives the Next.js route context as its 2nd arg; the
// withSuperAdmin guard's <Ctx> generic stays inferred from this callback
// (the CI guard regex `withSuperAdmin\s*\(` rejects an explicit type
// argument, so we cast inside the body instead of widening the call).
export const GET = withSuperAdmin(async (_req, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'invalid_id', message: 'tenant id must be a UUID' },
      { status: 400 },
    );
  }

  try {
    const data = await fetchTenantDetail(id);
    if (!data) {
      return NextResponse.json(
        { error: 'tenant_not_found', message: 'No tenant with that id' },
        { status: 404 },
      );
    }
    return NextResponse.json<TenantDetailResponse>(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'db_error', message },
      { status: 500 },
    );
  }
});

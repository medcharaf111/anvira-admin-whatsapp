// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §6 — segment layout guard.
//
// Three-layer defence at the page surface:
//   1. middleware.ts short-circuits at the edge (Implementer D).
//   2. (app)/platform-admin/layout.tsx (THIS FILE) calls
//      requireSuperAdminOptional() and redirects to /conversations on fail.
//      We use the *Optional variant + redirect rather than the throwing
//      requireSuperAdmin() so a missing migration / RLS drift doesn't
//      surface as an unhandled exception — it just bounces the user.
//   3. Each /api/platform-admin/* route wraps in withSuperAdmin().
//
// We redirect (not notFound()) per §6 — 404 makes super-admin lockout
// harder to debug, and the segment already exists.
// ----------------------------------------------------------------------------

import { redirect } from 'next/navigation';
import { requireSuperAdminOptional } from '@/lib/platform-admin/guard';
import { PlatformBanner } from '@/components/platform-admin/platform-banner';

export const dynamic = 'force-dynamic';

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sa = await requireSuperAdminOptional();
  if (!sa) {
    redirect('/conversations');
  }
  return (
    <>
      <PlatformBanner />
      {children}
    </>
  );
}

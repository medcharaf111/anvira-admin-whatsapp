// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §5.9 — minimal index landing.
//
// Real StatCard dashboard ships in Phase 3. For this slice we just need
// a navigable entry point so the sidebar item resolves to something
// other than a 404.
// ----------------------------------------------------------------------------

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default function PlatformAdminIndex() {
  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="DASHBOARD"
        title="لوحة الإشراف العام"
        subtitle="نقطة الدخول إلى أدوات إدارة المنصّة. لوحة المؤشّرات الكاملة في المرحلة القادمة."
      />
      <div className="panel p-6 mt-6">
        <h2
          className="display-ar"
          style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}
        >
          الأقسام المتاحة
        </h2>
        <ul className="space-y-2">
          <li>
            <Link
              href="/platform-admin/tenants"
              style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
            >
              المستأجِرون — قائمة الحسابات عبر كل النظام
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

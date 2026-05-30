// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §5.10 — segment-scoped not-found.
//
// Next.js convention: not-found.tsx inside a segment is rendered for any
// unmatched route under that segment. The parent layout (with its guard)
// runs first, so by the time this renders the user is already known to
// be a super-admin. No guard needed here.
// ----------------------------------------------------------------------------

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';

export default function PlatformAdminNotFound() {
  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="NOT FOUND"
        title="الصفحة غير موجودة"
        subtitle="هذا القسم من لوحة الإشراف العام غير موجود أو لم يُنشَأ بعد."
      />
      <div className="panel p-6 mt-6">
        <Link
          href="/platform-admin"
          style={{ color: 'var(--primary-glow)', textDecoration: 'underline' }}
        >
          ← العودة إلى لوحة الإشراف العام
        </Link>
      </div>
    </div>
  );
}

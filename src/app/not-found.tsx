import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      dir="rtl"
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ background: 'var(--paper)' }}
    >
      <div className="max-w-md text-center">
        <div className="eyebrow mb-4">404 · NOT FOUND</div>
        <h1
          className="display-ar text-4xl mb-4"
          style={{ color: 'var(--ink)' }}
        >
          الصفحة غير موجودة
        </h1>
        <p
          className="body-serif text-base mb-8"
          style={{ color: 'var(--ink-soft)' }}
        >
          لم نجد الصفحة اللي تبحث عنها. ربما تم نقلها أو حذفها.
        </p>
        <Link
          href="/conversations"
          className="btn-primary inline-flex items-center gap-2 px-5 h-11 text-sm"
        >
          <span>الرجوع للمحادثات</span>
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}

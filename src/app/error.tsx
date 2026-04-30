'use client';
import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console for now; wire up Sentry/Logtail later (P1).
    console.error('[admin/error-boundary]', error);
  }, [error]);

  return (
    <div
      dir="rtl"
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ background: 'var(--paper)' }}
    >
      <div className="max-w-md text-center">
        <div
          className="eyebrow mb-4"
          style={{ color: 'var(--signal)' }}
        >
          ERROR · حدث خلل
        </div>
        <h1
          className="display-ar text-4xl mb-4"
          style={{ color: 'var(--ink)' }}
        >
          صار خلل غير متوقع
        </h1>
        <p
          className="body-serif text-base mb-2"
          style={{ color: 'var(--ink-soft)' }}
        >
          راسلنا إذا استمرت المشكلة، وسنحلها بأقرب وقت.
        </p>
        {error.digest && (
          <p
            className="text-[11px] tabular mb-8"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.04em',
            }}
            dir="ltr"
          >
            ref: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2 px-5 h-11 text-sm"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
            <span>إعادة المحاولة</span>
          </button>
          <a
            href="/conversations"
            className="btn-ghost inline-flex items-center gap-2 px-5 h-11 text-sm"
          >
            <Home className="w-4 h-4" strokeWidth={1.75} />
            <span>الرئيسية</span>
          </a>
        </div>
      </div>
    </div>
  );
}

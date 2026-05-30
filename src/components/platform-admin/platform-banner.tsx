// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §2 — persistent "you are in cross-tenant mode" strip.
//
// Rendered by /platform-admin/layout.tsx ABOVE the page body. Server
// component, no client-side state. Inline-styled so it survives a missing
// Tailwind class (the eyebrow it carries is load-bearing UX).
// ----------------------------------------------------------------------------

export function PlatformBanner() {
  return (
    <div
      role="status"
      aria-label="Platform admin mode"
      className="w-full text-center"
      style={{
        background: 'var(--gold-faint)',
        borderBottom: '1px solid var(--gold-soft)',
        color: 'var(--gold)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6875rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '0.375rem 1rem',
      }}
    >
      PLATFORM ADMIN · أنت في وضع الإشراف العام · كل إجراء مُسجَّل
    </div>
  );
}

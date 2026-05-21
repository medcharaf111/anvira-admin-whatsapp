'use client';
import { motion } from 'framer-motion';

/**
 * Strip Wave-1-era "01 / المحادثات" eyebrows down to just "المحادثات".
 *
 * The Phase-4.5 landing dropped numeric prefixes on all eyebrows
 * (mono-uppercase, no numbers). The admin had ~12 PageHeader call-sites
 * with the legacy prefix; rather than touch every page, we sanitize
 * here. Anything before " / " is treated as a section index and dropped.
 */
function cleanEyebrow(eyebrow: string): string {
  // matches "01 / TITLE" or "1 / TITLE" — strips the index.
  const m = eyebrow.match(/^\s*\d+\s*\/\s*(.+)$/);
  return m ? m[1].trim() : eyebrow.trim();
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const cleanedEyebrow = eyebrow ? cleanEyebrow(eyebrow) : undefined;
  return (
    <motion.header
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-10"
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          {cleanedEyebrow && (
            <div className="flex items-center gap-3 mb-3">
              <span className="eyebrow">{cleanedEyebrow}</span>
              <span
                className="h-px flex-1 max-w-[120px]"
                style={{ background: 'var(--rule)' }}
              />
            </div>
          )}
          <h1
            className="display-ar text-[1.75rem] sm:text-[2rem] tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-sm mt-2 max-w-2xl"
              style={{ color: 'var(--ink-soft)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="hair-rule mt-8" />
    </motion.header>
  );
}

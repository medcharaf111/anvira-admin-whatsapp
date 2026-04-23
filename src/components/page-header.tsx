'use client';
import { motion } from 'framer-motion';

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
  return (
    <motion.header
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-10"
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="flex items-center gap-3 mb-3">
              <span className="eyebrow">{eyebrow}</span>
              <span className="h-px flex-1 max-w-[120px]" style={{ background: 'var(--rule)' }} />
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

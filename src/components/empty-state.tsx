import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Editorial empty-state. Used by list pages when there's nothing yet.
 * Every empty state TEACHES the next step + offers a primary CTA.
 *
 * Visual: dashed-border panel, faint icon, brief copy, optional
 * primary action + secondary action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  primaryAction?: { label: string; href: string } | { label: string; onClick: () => void };
  secondaryAction?: { label: string; href: string } | { label: string; onClick: () => void };
  compact?: boolean;
}) {
  return (
    <div
      className={`${compact ? 'py-10 px-6' : 'py-16 px-8'} text-center panel`}
      style={{ borderStyle: 'dashed', borderColor: 'var(--rule)' }}
    >
      <Icon
        className={`${compact ? 'w-9 h-9 mb-3' : 'w-11 h-11 mb-5'} mx-auto`}
        style={{ color: 'var(--ink-ghost)' }}
        strokeWidth={1}
      />
      <p
        className={`${compact ? 'text-base' : 'display-ar text-xl'} mb-2`}
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </p>
      {description && (
        <p
          className="text-sm max-w-md mx-auto leading-relaxed"
          style={{ color: 'var(--ink-soft)' }}
        >
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          {primaryAction && <ActionButton kind="primary" action={primaryAction} />}
          {secondaryAction && <ActionButton kind="ghost" action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  kind,
  action,
}: {
  kind: 'primary' | 'ghost';
  action: { label: string; href: string } | { label: string; onClick: () => void };
}) {
  const cls = kind === 'primary' ? 'btn-primary' : 'btn-ghost';
  if ('href' in action) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

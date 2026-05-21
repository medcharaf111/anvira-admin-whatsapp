import { cn } from '@/lib/utils';

/**
 * Editorial skeleton — uses the .skeleton CSS class declared in
 * globals.css. Shape it like the real content it stands in for: e.g.
 * <Skeleton className="h-4 w-32" /> for a single-line text row.
 *
 * Match: do NOT shimmer for prefers-reduced-motion (the global media
 * query already disables animation in globals.css).
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton', className)}
      aria-hidden
      role="presentation"
      {...props}
    />
  );
}

/**
 * Skeleton row matching the /conversations list row layout. Used in
 * loading.tsx for conversations + leads. Keep the dimensions in sync
 * with the corresponding ConversationRow component if it changes.
 */
export function ConversationRowSkeleton() {
  return (
    <div
      className="grid grid-cols-[1fr_auto_auto] gap-4 items-center py-4 px-4"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <Skeleton className="h-5 w-14" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Skeleton for a card-style row used in /alerts and /leads list mode. */
export function CardRowSkeleton() {
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-5 items-start py-5 px-4"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="space-y-2 w-32">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <div className="space-y-2 min-w-0">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-3 w-full max-w-md mt-1" />
      </div>
      <Skeleton className="h-9 w-20" />
    </div>
  );
}

/** Lightweight strip of skeleton stat tiles used at the top of list pages. */
export function StatsStripSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid gap-px mb-8"
      style={{
        background: 'var(--rule)',
        gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 space-y-3"
          style={{ background: 'var(--paper-lift)' }}
        >
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

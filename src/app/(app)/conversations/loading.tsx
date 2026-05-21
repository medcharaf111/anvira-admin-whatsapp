import {
  StatsStripSkeleton,
  ConversationRowSkeleton,
  Skeleton,
} from '@/components/ui/skeleton';

/**
 * Conversations loading state — mirrors the real list shape so the
 * page doesn't flash blank between navigations. No shimmer in
 * prefers-reduced-motion (handled in globals.css).
 */
export default function ConversationsLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-2.5 w-24" />
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-3 w-80 mt-3" />
        <div className="hair-rule mt-8" />
      </div>

      <StatsStripSkeleton count={3} />

      {/* Search */}
      <div className="mb-6 max-w-md">
        <Skeleton className="h-10 w-full" />
      </div>

      {/* List */}
      <div>
        <div
          className="grid grid-cols-[1fr_auto_auto] gap-4 py-3 px-4"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <ConversationRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

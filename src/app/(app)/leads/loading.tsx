import {
  CardRowSkeleton,
  StatsStripSkeleton,
  Skeleton,
} from '@/components/ui/skeleton';

/**
 * Leads loading state — list/kanban toggle yet to mount; we render the
 * list-mode skeleton because it's the default view on first load.
 */
export default function LeadsLoading() {
  return (
    <div>
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-2.5 w-32" />
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3 w-96 mt-3" />
        <div className="hair-rule mt-8" />
      </div>

      <StatsStripSkeleton count={4} />

      {/* Filter chips strip */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20" />
        ))}
      </div>

      {/* Rows */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <CardRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

import { CardRowSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function AlertsLoading() {
  return (
    <div>
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-2.5 w-24" />
          <span
            className="h-px flex-1 max-w-[120px]"
            style={{ background: 'var(--rule)' }}
          />
        </div>
        <Skeleton className="h-7 w-60" />
        <Skeleton className="h-3 w-80 mt-3" />
        <div className="hair-rule mt-8" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-2.5 w-20" />
      </div>

      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <CardRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

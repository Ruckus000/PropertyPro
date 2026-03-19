import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ChartSkeletonProps {
  aspectRatio?: string;
  className?: string;
}

function ChartSkeleton({ aspectRatio = '16/9', className }: ChartSkeletonProps) {
  return (
    <div className={cn('w-full', className)} style={{ aspectRatio }}>
      <Skeleton className="h-full w-full" />
    </div>
  );
}

export { ChartSkeleton, type ChartSkeletonProps };

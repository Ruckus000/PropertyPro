import { BarChart3, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

interface ChartEmptyStateProps {
  type: 'empty' | 'error';
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const defaults = {
  empty: {
    icon: BarChart3,
    title: 'No data for the selected period',
    description: 'Try adjusting your date range or community filters',
  },
  error: {
    icon: AlertCircle,
    title: 'Failed to load report data',
    description: undefined,
  },
} as const;

function ChartEmptyState({ type, message, onRetry, className }: ChartEmptyStateProps) {
  const config = defaults[type];
  return (
    <EmptyState
      size="sm"
      icon={config.icon}
      title={message ?? config.title}
      description={config.description}
      className={cn('h-full min-h-[200px] justify-center', className)}
      action={
        type === 'error' && onRetry ? (
          <Button size="sm" onClick={onRetry}>Retry</Button>
        ) : undefined
      }
    />
  );
}

export { ChartEmptyState, type ChartEmptyStateProps };

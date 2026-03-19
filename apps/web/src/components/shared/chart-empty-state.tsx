import { BarChart3, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    subtitle: 'Try adjusting your date range or community filters',
  },
  error: {
    icon: AlertCircle,
    title: 'Failed to load report data',
    subtitle: null,
  },
};

function ChartEmptyState({ type, message, onRetry, className }: ChartEmptyStateProps) {
  const config = defaults[type];
  const Icon = config.icon;

  return (
    <div className={cn('flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <Icon className="h-10 w-10 text-content-disabled" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-content-secondary">{message ?? config.title}</p>
        {config.subtitle && (
          <p className="text-xs text-content-tertiary">{config.subtitle}</p>
        )}
      </div>
      {type === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-content-inverse transition-colors duration-quick hover:bg-interactive-hover"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export { ChartEmptyState, type ChartEmptyStateProps };

'use client';

import Link from 'next/link';
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;
  trend?: 'up' | 'down' | 'neutral';
  invertTrend?: boolean;
  icon?: LucideIcon;
  href?: string;
  isLoading?: boolean;
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <Skeleton className="mt-3 h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-32" />
      </CardContent>
    </Card>
  );
}

const trendConfig = {
  up: { icon: TrendingUp, positiveColor: 'text-status-success', negativeColor: 'text-status-danger' },
  down: { icon: TrendingDown, positiveColor: 'text-status-danger', negativeColor: 'text-status-success' },
  neutral: { icon: Minus, positiveColor: 'text-content-tertiary', negativeColor: 'text-content-tertiary' },
};

function KpiCard({
  title,
  value,
  delta,
  trend = 'neutral',
  invertTrend = false,
  icon: Icon,
  href,
  isLoading,
}: KpiCardProps) {
  if (isLoading) return <KpiCardSkeleton />;

  const { icon: TrendIcon, positiveColor, negativeColor } = trendConfig[trend];
  const trendColor =
    trend === 'neutral'
      ? 'text-content-tertiary'
      : invertTrend
        ? negativeColor
        : positiveColor;

  const content = (
    <Card className={cn(href && 'transition-shadow duration-quick hover:shadow-md')}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-content-secondary">{title}</p>
          {Icon && (
            <div className="rounded-md bg-surface-muted p-2">
              <Icon className="h-4 w-4 text-content-secondary" />
            </div>
          )}
        </div>
        <p className="mt-3 text-2xl font-bold">{value}</p>
        {delta !== undefined && (
          <div className={cn('mt-2 flex items-center gap-1 text-sm', trendColor)}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(delta)}%</span>
            <span className="text-content-tertiary">vs last 30 days</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export { KpiCard, type KpiCardProps };

'use client';

import * as React from "react";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../utils/cn";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;
  /** Overrides the "vs last 30 days" caption next to the delta. */
  deltaLabel?: string;
  trend?: "up" | "down" | "neutral";
  invertTrend?: boolean;
  icon?: LucideIcon;
  href?: string;
  /**
   * Component to render the `href` link through (e.g. `next/link`).
   * packages/ui has no `next` dependency, so the host app binds its own
   * router link here; defaults to a plain `<a>`.
   */
  linkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Renders a `<button>` instead of a link when there is no `href`. */
  onClick?: () => void;
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
  up: { icon: TrendingUp, positiveColor: "text-status-success", negativeColor: "text-status-danger" },
  down: { icon: TrendingDown, positiveColor: "text-status-danger", negativeColor: "text-status-success" },
  neutral: { icon: Minus, positiveColor: "text-content-tertiary", negativeColor: "text-content-tertiary" },
};

function KpiCard({
  title,
  value,
  delta,
  deltaLabel = "vs last 30 days",
  trend = "neutral",
  invertTrend = false,
  icon: Icon,
  href,
  linkComponent,
  onClick,
  isLoading,
}: KpiCardProps) {
  if (isLoading) return <KpiCardSkeleton />;

  const { icon: TrendIcon, positiveColor, negativeColor } = trendConfig[trend];
  const trendColor =
    trend === "neutral"
      ? "text-content-tertiary"
      : invertTrend
        ? negativeColor
        : positiveColor;

  const content = (
    <Card>
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
          <div className={cn("mt-2 flex items-center gap-1 text-sm", trendColor)}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(delta)}%</span>
            <span className="text-content-tertiary">{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Only the `href` and `onClick` branches below consume this, so the wrapper is
  // interactive by construction and needs no `(href || onClick)` guard.
  // `block w-full text-left` is deliberate: the wrapper is an `<a>` in one branch
  // and a `<button>` in the other, and a bare `<button>` would otherwise
  // shrink-wrap and centre the card's text. Do not drop these.
  const wrapperClass =
    "block w-full text-left transition-shadow duration-quick hover:shadow-md rounded-md";
  if (href) {
    const LinkComp = linkComponent ?? "a";
    return (
      <LinkComp href={href} className={wrapperClass}>
        {content}
      </LinkComp>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={wrapperClass} aria-label={title}>
        {content}
      </button>
    );
  }

  return content;
}

export { KpiCard, type KpiCardProps };

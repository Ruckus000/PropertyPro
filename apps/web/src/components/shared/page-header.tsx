/**
 * PageHeader — Standardized page header below AppTopBar.
 *
 * AppTopBar owns the h1 page title. This component renders:
 * - Optional subtitle/description
 * - Optional action buttons
 * - Optional breadcrumb area
 *
 * Does NOT render an h1 to avoid double-heading issues.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Subtitle or description text */
  description?: React.ReactNode;
  /** Action buttons (right-aligned on desktop) */
  actions?: React.ReactNode;
  /** Optional breadcrumb or context element */
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  description,
  actions,
  breadcrumb,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-2 pb-6", className)}
      {...props}
    >
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="text-sm text-content-tertiary">
          {breadcrumb}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {description && (
            <p className="text-sm text-content-secondary">{description}</p>
          )}
          {children}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

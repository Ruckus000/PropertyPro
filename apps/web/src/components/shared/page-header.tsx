/**
 * PageHeader — Standardized page header with title, description, and actions.
 *
 * Renders the page-level h1 heading. Used at the top of content areas
 * below AppTopBar to establish page identity and provide actions.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title — rendered as h1 */
  title: string;
  /** Subtitle or description text */
  description?: React.ReactNode;
  /** Action buttons (right-aligned on desktop) */
  actions?: React.ReactNode;
  /** Optional breadcrumb or context element */
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  title,
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
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            {title}
          </h1>
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

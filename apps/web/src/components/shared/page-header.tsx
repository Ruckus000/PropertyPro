/**
 * PageHeader — Standardized page header with title, description, and actions.
 *
 * Renders the page-level h1 heading. Used at the top of content areas
 * below AppTopBar to establish page identity and provide actions.
 *
 * Always renders <PageHeaderHelpButton/> in the actions row (after any
 * page-specific actions). Pages that genuinely don't want help (rare —
 * e.g., a /help/* page itself) can opt out via `hideHelpButton`.
 */

import * as React from "react";
import { PageHeaderHelpButton } from "./page-header-help-button";
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
  /** Suppress the auto-rendered Help button — defaults to false. */
  hideHelpButton?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  hideHelpButton = false,
  className,
  children,
  ...props
}: PageHeaderProps) {
  const showHelp = !hideHelpButton;
  const showActionsRow = Boolean(actions) || showHelp;

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

        {showActionsRow && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {showHelp && <PageHeaderHelpButton />}
          </div>
        )}
      </div>
    </div>
  );
}

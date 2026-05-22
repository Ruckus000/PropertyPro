/**
 * PageHeader — Standardized page header with title, description, and actions.
 *
 * Renders the page-level h1 heading. Used at the top of content areas
 * below AppTopBar to establish page identity and provide actions.
 *
 * The per-page Help button is auto-rendered in the actions row (after any
 * page-specific actions) so it sits inline with the page's primary action
 * buttons rather than colliding with them. The AppShell-level fallback
 * Help button hides itself via CSS `group-has-[data-page-header]:hidden`
 * when this component is present — so routes that DON'T use PageHeader
 * still get a Help button from the shell.
 *
 * Pages can suppress the inline Help button via `hideHelpButton` (e.g.
 * legitimate edge case: a future page that wants no help affordance at
 * all). Doing so does NOT make the shell-level button reappear — the
 * data-page-header signal is the source of truth.
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
  /** Suppress the auto-rendered Help button. Rare; default false. */
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
      data-page-header="true"
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

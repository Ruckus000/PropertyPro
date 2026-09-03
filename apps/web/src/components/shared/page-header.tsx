'use client';

/**
 * PageHeader — the page's toolbar, with a visually-hidden title.
 *
 * Decision transferred from the PropertyPro design prototype (2026-09-02): no
 * painted page titles or descriptions — the rail already says which page you
 * are on, and the breadcrumb leaf names it. What paints is a toolbar: left-slot
 * `children`, then `actions` and Help pushed to the right edge. When none of
 * those exist, nothing paints — no empty band above the content.
 *
 * The <h1> is still rendered, `sr-only`: it names the page for assistive tech,
 * it is what shell-breadcrumbs.tsx reads for the leaf label
 * (`[data-page-header] h1`), and it satisfies `guard:breadcrumbs`.
 * `description` is accepted so call sites keep compiling, and is not rendered.
 *
 * The per-page Help button rides in the toolbar after any page-specific
 * actions. The AppShell-level fallback Help button hides itself via CSS
 * `group-has-[data-page-header]:hidden` when this component is present — so
 * routes that DON'T use PageHeader still get a Help button from the shell.
 * Pages can suppress the inline button via `hideHelpButton`; doing so does NOT
 * make the shell-level button reappear — the data-page-header signal is the
 * source of truth.
 */

import * as React from "react";
import { PageHeaderHelpButton, useHelpButtonAvailable } from "./page-header-help-button";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title — rendered as the page <h1>, visually hidden. */
  title: string;
  /**
   * @deprecated Not rendered. Page descriptions are not painted (see the
   * page-title decision in .claude/rules/design.md). Accepted so existing
   * call sites compile; remove at the call site when you touch it.
   */
  description?: React.ReactNode;
  /** Action buttons — right edge of the toolbar. */
  actions?: React.ReactNode;
  /** Suppress the auto-rendered Help button. Rare; default false. */
  hideHelpButton?: boolean;
}

export function PageHeader({
  title,
  description: _description,
  actions,
  hideHelpButton = false,
  className,
  children,
  ...props
}: PageHeaderProps) {
  const helpAvailable = useHelpButtonAvailable();
  const showHelp = !hideHelpButton && helpAvailable;
  const showRight = Boolean(actions) || showHelp;
  const showToolbar = Boolean(children) || showRight;

  return (
    <div
      data-page-header="true"
      className={cn("flex flex-col", showToolbar && "pb-6", className)}
      {...props}
    >
      <h1 className="sr-only">{title}</h1>

      {showToolbar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {children && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
          )}
          {showRight && (
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {actions}
              {showHelp && <PageHeaderHelpButton />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

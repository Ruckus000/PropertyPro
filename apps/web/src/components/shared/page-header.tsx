'use client';

/**
 * PageHeader — the page's header, in one of two modes.
 *
 * Inside a `PageLayout` (the redesigned pages) it paints: a place mark for
 * `icon`, the `<h1>` title in the display face, `status` after it, the
 * `description` underneath, over a bottom rule. `actions` and Help sit at the
 * right of the title row (wrapping under the title below `sm`); left-slot
 * `children` get their own row below the description.
 *
 * Everywhere else (pages not yet moved) it keeps the 2026-09-02 prototype
 * decision: the `<h1>` is `sr-only`, `description` is not rendered, and what
 * paints is only the toolbar. With no toolbar content, nothing paints.
 *
 * Either way the <h1> is what shell-breadcrumbs.tsx reads for the leaf label
 * (`[data-page-header] h1`) and what `guard:breadcrumbs` looks for.
 *
 * `icon` is a ready element (`<Package />`), not a component, because server
 * pages render PageHeader and a function cannot cross from a server component
 * to a client one, while an element can. It is NOT looked up in NAV_ITEMS:
 * importing nav-config here put ~22 icons and the @propertypro/shared barrel
 * into every page's client chunk. Without an icon, no place mark is drawn.
 *
 * The per-page Help button rides in the toolbar after any page-specific
 * actions, and pages can suppress it via `hideHelpButton`.
 */

import * as React from "react";
import { PageHeaderHelpButton, useHelpButtonAvailable } from "./page-header-help-button";
import { cn } from "@/lib/utils";
import { useInPageLayout } from "@propertypro/ui/components/shared/page-layout-context";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title — the page <h1>; visually hidden outside a PageLayout. */
  title: string;
  /** Painted under the title inside a PageLayout; not rendered elsewhere. */
  description?: React.ReactNode;
  /** Action buttons — right edge of the toolbar. */
  actions?: React.ReactNode;
  // ponytail: the caller passes the icon, so a page title and the sidebar could show different icons for one section. Trigger: Plan B's icon design (docs/superpowers/plans/2026-11-21-design-direction-a-foundation-and-pilot.md, "Out of this plan").
  /** Place-mark icon element, e.g. `<Package />` (PageLayout only). */
  icon?: React.ReactNode;
  /** Rendered after the title (PageLayout only). Carries its own word. */
  status?: React.ReactNode;
  /** Suppress the auto-rendered Help button. Rare; default false. */
  hideHelpButton?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  status,
  actions,
  hideHelpButton = false,
  className,
  children,
  ...props
}: PageHeaderProps) {
  const inLayout = useInPageLayout();
  const helpAvailable = useHelpButtonAvailable();
  const showHelp = !hideHelpButton && helpAvailable;
  const showRight = Boolean(actions) || showHelp;
  const showToolbar = Boolean(children) || showRight;

  return (
    <div
      data-page-header="true"
      className={cn(
        "flex flex-col",
        inLayout ? "gap-3 border-b border-edge-strong pb-4" : showToolbar && "pb-6",
        className,
      )}
      {...props}
    >
      {inLayout ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-inverse text-content-inverse [&>svg]:size-5 [&>svg]:stroke-[1.6]"
              >
                {icon}
              </span>
            )}
            <h1 className="min-w-0 font-display text-3xl font-medium tracking-tight text-content">
              {title}
            </h1>
            {status}
          </div>
          {showRight && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              {actions}
              {showHelp && <PageHeaderHelpButton />}
            </div>
          )}
        </div>
      ) : (
        <h1 className="sr-only">{title}</h1>
      )}
      {inLayout && description && (
        <p className="text-sm text-content-secondary">{description}</p>
      )}

      {inLayout && children && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      )}
      {!inLayout && showToolbar && (
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

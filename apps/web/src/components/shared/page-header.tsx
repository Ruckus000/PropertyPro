'use client';

/**
 * PageHeader — the page's header, in one of two modes.
 *
 * Inside a `PageLayout` (the redesigned pages) it paints: a place mark for
 * `navId`, the `<h1>` title in the display face, `status` after it, the
 * `description` underneath, then the toolbar of `children`, `actions` and Help
 * (the right-edge group), over a bottom rule.
 *
 * Everywhere else (pages not yet moved) it keeps the 2026-09-02 prototype
 * decision: the `<h1>` is `sr-only`, `description` is not rendered, and what
 * paints is only the toolbar. With no toolbar content, nothing paints.
 *
 * Either way the <h1> is what shell-breadcrumbs.tsx reads for the leaf label
 * (`[data-page-header] h1`) and what `guard:breadcrumbs` looks for.
 *
 * `navId` is a string, not an icon, because server pages render PageHeader and
 * a function cannot cross from a server component to a client one. The icon is
 * looked up in NAV_ITEMS, so the title and the sidebar show the same icon; an
 * unknown id draws no place mark.
 *
 * The per-page Help button rides in the toolbar after any page-specific
 * actions, and pages can suppress it via `hideHelpButton`.
 */

import * as React from "react";
import { PageHeaderHelpButton, useHelpButtonAvailable } from "./page-header-help-button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { useInPageLayout } from "@propertypro/ui/components/shared/page-layout-context";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title — the page <h1>; visually hidden outside a PageLayout. */
  title: string;
  /** Painted under the title inside a PageLayout; not rendered elsewhere. */
  description?: React.ReactNode;
  /** Action buttons — right edge of the toolbar. */
  actions?: React.ReactNode;
  /** NAV_ITEMS id whose icon is the place mark (PageLayout only). */
  navId?: string;
  /** Rendered after the title (PageLayout only). Carries its own word. */
  status?: React.ReactNode;
  /** Suppress the auto-rendered Help button. Rare; default false. */
  hideHelpButton?: boolean;
}

export function PageHeader({
  title,
  description,
  navId,
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
  const Icon = inLayout && navId ? NAV_ITEMS.find((i) => i.id === navId)?.icon : undefined;

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
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-inverse text-content-inverse">
              <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
            </span>
          )}
          <h1 className="min-w-0 font-display text-3xl font-medium tracking-tight text-content">
            {title}
          </h1>
          {status}
        </div>
      ) : (
        <h1 className="sr-only">{title}</h1>
      )}
      {inLayout && description && (
        <p className="text-sm text-content-secondary">{description}</p>
      )}

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

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * PageContainer — the single source of the authenticated page gutter + max-width.
 *
 * Rendered ONCE by the app shell (`components/layout/app-shell.tsx`) around every
 * authenticated page's content. This is the only place the page-level horizontal
 * gutter (`px-*`) and vertical rhythm (`py-*`) live, so tuning padding for the whole
 * app is a one-line change here. Pages must NOT re-add their own `px-*`/`py-*` at the
 * page root — that double-pads on top of this gutter (enforced by `guard:page-padding`).
 *
 * The gutter is 16px under `sm` (640px) and 24px from there up, with 20px of top/bottom
 * padding. Content is fluid and capped at `max-w-[1600px]`, centred on wider monitors.
 * Components that must lay out by the width of their own box rather than the window's
 * (the sidebar and top nav change how much of the viewport a page gets) use the `cq`
 * container-query vocabulary — see `cq` in `tailwind.config.ts`.
 */

const WIDTHS = {
  /** Full app width — standard for dashboards, lists, hubs. */
  default: 'max-w-[1600px]',
} as const;

export type PageContainerWidth = keyof typeof WIDTHS;

/** The horizontal gutter — single-sourced so the banner strip in the shell can reuse it. */
export const PAGE_GUTTER_X = 'px-4 sm:px-6';

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: PageContainerWidth;
}

export function PageContainer({
  width = 'default',
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full py-5', PAGE_GUTTER_X, WIDTHS[width], className)}
      {...props}
    >
      {children}
    </div>
  );
}

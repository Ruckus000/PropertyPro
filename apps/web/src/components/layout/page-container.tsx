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
 * The gutter scales gently with viewport (24 → 32 → 40px) so content keeps comfortable
 * breathing room from the sidebar and the viewport edge on laptops without wasting space
 * on wide monitors, where content is centred and capped at `max-w-[1400px]`.
 */

const WIDTHS = {
  /** Full app width — standard for dashboards, lists, hubs. */
  default: 'max-w-[1400px]',
  /** Roomier full-bleed feeds that still want a cap. */
  wide: 'max-w-[1600px]',
} as const;

export type PageContainerWidth = keyof typeof WIDTHS;

/** The horizontal gutter — single-sourced so the banner strip in the shell can reuse it. */
export const PAGE_GUTTER_X = 'px-6 sm:px-8 lg:px-10';

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
      className={cn('mx-auto w-full py-8', PAGE_GUTTER_X, WIDTHS[width], className)}
      {...props}
    >
      {children}
    </div>
  );
}

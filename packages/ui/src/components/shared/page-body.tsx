import * as React from "react";

import { cn } from "../../utils/cn";

/**
 * PageBody — the canonical content wrapper for authenticated pages.
 *
 * Standardises the two things pages used to improvise (and got inconsistent):
 *   1. vertical rhythm between sections (`space-y-*`), and
 *   2. an optional narrower reading column (centred `max-w-*`).
 *
 * It applies **no horizontal padding** — the page gutter is owned solely by
 * `PageContainer` in the app shell. A page that needs a narrower column picks a
 * `width` instead of hand-writing `mx-auto max-w-* px-*` (which double-pads).
 *
 *   <PageBody>                       // full width, space-y-6 (the default)
 *   <PageBody width="prose">         // centred 2xl reading column
 *   <PageBody spacing="none">        // manage spacing yourself
 */

const SPACING = {
  /** Standard section rhythm — matches the dominant dashboard convention. */
  default: 'space-y-6',
  /** Looser rhythm for settings-style pages with large sections. */
  loose: 'space-y-8',
  /** Opt out — the page manages its own internal spacing. */
  none: '',
} as const;

/**
 * Effective widths, NOT Tailwind's nominal ones. Both consuming apps set a
 * `:root { font-size: 18px }` (`apps/web/src/app/globals.css`,
 * `apps/admin/src/styles/globals.css`), so every `max-w-*` here — which is
 * declared in rem — renders 12.5% wider than the default-16px figures these
 * comments used to quote. The authenticated content box is only
 * `viewport − 260px sidebar − 80px gutter`, so `content` and `reading` do not
 * bind at all below ~1350px/~1490px and silently behave as `full` there.
 */
const WIDTHS = {
  /** Full app width (inherits the container cap). */
  full: '',
  /** 32rem = 576px — status/confirmation pages. */
  narrow: 'mx-auto w-full max-w-lg',
  /** 42rem = 756px — notifications and other single-column feeds. */
  prose: 'mx-auto w-full max-w-2xl',
  /** 48rem = 864px — forms and detail pages. */
  form: 'mx-auto w-full max-w-3xl',
  /** 56rem = 1008px — focused hubs. */
  content: 'mx-auto w-full max-w-4xl',
  /** 64rem = 1152px — long documents / transparency reports. */
  reading: 'mx-auto w-full max-w-5xl',
} as const;

export type PageBodySpacing = keyof typeof SPACING;
export type PageBodyWidth = keyof typeof WIDTHS;

interface PageBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: PageBodySpacing;
  width?: PageBodyWidth;
}

export function PageBody({
  spacing = 'default',
  width = 'full',
  className,
  children,
  ...props
}: PageBodyProps) {
  return (
    <div className={cn(SPACING[spacing], WIDTHS[width], className)} {...props}>
      {children}
    </div>
  );
}

/**
 * EmptyState — Placeholder for empty content areas.
 *
 * Two families of size:
 * - `hero` / `section` / `compact`: the "guided blueprint" pattern
 *   (docs/design-system/patterns/empty-states.md §3). Every one carries a
 *   scene (`illustration`, from ../../illustrations). Use these in apps/web.
 * - `sm` / `md` / `lg`: the earlier icon-in-a-circle look.
 *   ponytail: sm/md/lg kept for apps/admin's call sites, which the empty-state
 *   spec does not cover. Trigger: admin adopts scenes, or no web caller passes
 *   sm/md/lg.
 *
 * Props-only: the preset lookup (EMPTY_STATE_CONFIGS) lives in the web app's
 * wrapper (apps/web/src/components/shared/empty-state.tsx), which resolves a
 * preset/icon-key to concrete props and delegates to this component.
 */

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

// ── Size config (sm / md / lg) ──

const sizeConfig = {
  sm: {
    container: "py-6 px-4",
    iconContainer: "h-14 w-14",
    iconSize: 24,
    title: "text-base font-semibold",
    description: "text-sm max-w-[280px]",
  },
  md: {
    container: "py-10 px-6",
    iconContainer: "h-[72px] w-[72px]",
    iconSize: 28,
    title: "text-lg font-semibold",
    description: "text-sm max-w-[320px]",
  },
  lg: {
    container: "py-12 px-8",
    iconContainer: "h-[88px] w-[88px]",
    iconSize: 36,
    title: "text-xl font-semibold",
    description: "text-base max-w-[360px]",
  },
} as const;

// ── Props ──

interface EmptyStateBaseProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Primary message: the outcome, not the absence (spec §7). */
  title: string;
  /** Why it matters and what will appear here. */
  description?: string;
  /** Optional action (usually one button). Omit for an all-clear state. */
  action?: React.ReactNode;
}

export interface EmptyStateIconProps extends EmptyStateBaseProps {
  size?: "sm" | "md" | "lg";
  /** Icon component */
  icon?: LucideIcon;
  illustration?: never;
  eyebrow?: never;
  aside?: never;
}

export interface EmptyStateSceneProps extends EmptyStateBaseProps {
  /**
   * hero: a whole page's content (h2, art in a sky panel, optional context
   * column). section: a tab or panel (h3). compact: a widget, dropdown or
   * table body (one line, no heading).
   */
  size: "hero" | "section" | "compact";
  /** The scene, rendered at the same size (e.g. `<DocumentsScene size="hero" />`). Decorative. */
  illustration?: React.ReactNode;
  /** What the page is, e.g. "Documents". Hero only. */
  eyebrow?: string;
  /** Context column beside the scene (what you'll see, how you'll hear, help). Hero only. */
  aside?: React.ReactNode;
  icon?: never;
}

export type EmptyStateProps = EmptyStateIconProps | EmptyStateSceneProps;

// ── Component ──

function isSceneProps(props: EmptyStateProps): props is EmptyStateSceneProps {
  return props.size === "hero" || props.size === "section" || props.size === "compact";
}

export function EmptyState(props: EmptyStateProps) {
  return isSceneProps(props) ? <SceneEmptyState {...props} /> : <IconEmptyState {...props} />;
}

function IconEmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className,
  ...rest
}: EmptyStateIconProps) {
  const s = sizeConfig[size];

  return (
    <div
      className={cn("flex flex-col items-center text-center", s.container, className)}
      {...rest}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-full bg-surface-muted",
            s.iconContainer
          )}
        >
          <Icon
            size={s.iconSize}
            className="text-content-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <h3 className={cn("text-content", s.title)}>{title}</h3>
        {description && (
          <p className={cn("text-content-tertiary", s.description)}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SceneEmptyState({
  size,
  illustration,
  eyebrow,
  aside,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateSceneProps) {
  const titleId = React.useId();

  if (size === "compact") {
    return (
      <div className={cn("flex items-center gap-3 p-4", className)} {...rest}>
        {illustration}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-content">{title}</p>
          {description && <p className="text-sm text-content-secondary">{description}</p>}
          {action && <div>{action}</div>}
        </div>
      </div>
    );
  }

  if (size === "section") {
    return (
      <div
        className={cn("flex flex-col items-center px-6 py-8 text-center", className)}
        {...rest}
      >
        {illustration && <div className="mb-4">{illustration}</div>}
        <h3 className="text-lg font-semibold text-content">{title}</h3>
        {description && (
          <p className="mt-2 max-w-[60ch] text-sm text-content-secondary">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }

  // hero (spec §4.4): one card; the scene card (art panel over text) beside an
  // optional context column, split 8/4 once the CARD is 720px wide (cq-md),
  // so a sidebar-narrowed page keeps one column. The setup hero, art beside
  // text, is SetupGuide's (apps/web), not this.
  return (
    <section
      {...rest}
      aria-labelledby={titleId}
      className={cn("cq overflow-hidden rounded-md border border-edge bg-surface-card", className)}
    >
      <div className={cn(aside && "cq-md:grid cq-md:grid-cols-12")}>
        <div className={cn("flex min-w-0 flex-col", aside && "cq-md:col-span-8")}>
          {illustration && (
            // Below md the art drops under the text at section size, so the
            // action stays in the first viewport (spec §3).
            <div className="order-last flex items-end justify-center border-t border-edge bg-[var(--teal-50)] px-6 pt-6 max-md:[&>svg]:w-40 md:order-first md:border-b md:border-t-0">
              {illustration}
            </div>
          )}
          <div className="px-4 py-6 md:px-6 md:py-8">
            {eyebrow && <p className="text-xs font-medium text-content-secondary">{eyebrow}</p>}
            <h2
              id={titleId}
              className={cn(
                "text-2xl font-semibold leading-tight tracking-[-0.01em] text-content",
                eyebrow && "mt-1",
              )}
            >
              {title}
            </h2>
            {description && (
              <p className="mt-2 max-w-[60ch] text-base text-content-secondary">{description}</p>
            )}
            {action && <div className="mt-6 flex flex-wrap gap-2">{action}</div>}
          </div>
        </div>
        {aside && (
          <div className="flex min-w-0 flex-col gap-8 border-t border-edge px-4 py-6 md:px-6 cq-md:col-span-4 cq-md:border-l cq-md:border-t-0">
            {aside}
          </div>
        )}
      </div>
    </section>
  );
}

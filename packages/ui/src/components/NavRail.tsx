'use client';

/**
 * NavRail — Sidebar navigation with collapsible state.
 *
 * Keyboard navigation: ArrowUp/ArrowDown to move between items, Enter/Space to select.
 */

import React, { useCallback, useMemo, useRef } from "react";
import type { StatusVariant } from "../tokens";

export type NavRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number | null;
  badgeVariant?: StatusVariant;
  /** Optional URL — when provided, the item renders as a link instead of a button. */
  href?: string;
};

export type NavRailSection = {
  /** Section header label. When null, no header is rendered. */
  label: string | null;
  items: NavRailItem[];
};

export interface NavRailProps {
  items: NavRailItem[];
  activeView: string;
  onViewChange: (viewId: string) => void;
  expanded: boolean;
  onToggle?: () => void;
  /**
   * Optional render function for link items (items with `href`).
   * Receives href, className, children, and common props.
   * Use this to render framework-specific link components (e.g. Next.js `Link`).
   * Falls back to `<a>` when not provided.
   */
  renderLink?: (props: {
    href: string;
    className: string;
    children: React.ReactNode;
    'aria-label': string;
    'aria-current'?: 'page';
    onClick?: () => void;
  }) => React.ReactElement;
  /** Optional header content rendered above the nav items (e.g. brand/logo). */
  header?: React.ReactNode;
  /** Optional footer content rendered below the toggle (e.g. user profile). */
  footer?: React.ReactNode;
  /**
   * Structured sections with labeled dividers. When provided, takes precedence over `items`.
   * Each section can have a label (rendered as uppercase header) or null (no header).
   */
  sections?: NavRailSection[];
  /**
   * @deprecated Use `sections` instead. Optional separator with label rendered between item groups.
   */
  groupSeparator?: React.ReactNode;
  /**
   * @deprecated Use `sections` instead. Index at which to insert the group separator.
   */
  groupSeparatorAfterIndex?: number;
}

function cn(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

const badgeDotClasses: Record<StatusVariant, string> = {
  success: "bg-[var(--status-success)] dark:bg-green-300",
  brand: "bg-[var(--status-brand)] dark:bg-blue-300",
  warning: "bg-[var(--status-warning)] dark:bg-amber-300",
  danger: "bg-[var(--status-danger)] dark:bg-red-300",
  info: "bg-[var(--status-info)] dark:bg-sky-300",
  neutral: "bg-[var(--status-neutral)] dark:bg-gray-400",
};

function ChevronLeftIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M12.5 4.5L7.5 10L12.5 15.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NavRail({
  items,
  activeView,
  onViewChange,
  expanded,
  onToggle,
  renderLink,
  header,
  footer,
  sections: sectionsProp,
  groupSeparator,
  groupSeparatorAfterIndex,
}: NavRailProps) {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Normalize into sections: sectionsProp takes precedence, else wrap items in a single section
  const sections: NavRailSection[] = useMemo(
    () => sectionsProp ?? [{ label: null, items }],
    [sectionsProp, items],
  );

  // Flatten all items across sections for keyboard navigation
  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, flatIndex: number) => {
      let nextIndex: number | undefined;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex = flatIndex < allItems.length - 1 ? flatIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex = flatIndex > 0 ? flatIndex - 1 : allItems.length - 1;
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const navItem = allItems[flatIndex];
        if (navItem) {
          onViewChange(navItem.id);
        }
        return;
      }

      if (nextIndex !== undefined) {
        itemsRef.current[nextIndex]?.focus();
      }
    },
    [allItems, onViewChange],
  );

  const renderItemContent = (navItem: NavRailItem, isActive: boolean) => {
    const badge = navItem.badge ?? null;
    const badgeVariant: StatusVariant = navItem.badgeVariant ?? "neutral";
    const Icon = navItem.icon;

    return (
      <>
        {isActive && (
          <div
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-7 w-[4px] -translate-y-1/2 rounded-r-[6px] bg-[var(--interactive-primary)] dark:bg-blue-400"
          />
        )}

        <div className="relative size-[22px]">
          <div className="flex size-full items-center justify-center" aria-hidden="true">
            <Icon
              size={22}
              color={isActive ? "var(--nav-text-active)" : "var(--nav-text-inactive)"}
              strokeWidth={isActive ? 2 : 1.75}
            />
          </div>

          {!expanded && badge !== null && badge > 0 && (
            <div
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-[var(--surface-inverse)] dark:border-gray-900",
                badgeDotClasses[badgeVariant],
              )}
            />
          )}
        </div>

        <div
          className={cn(
            "flex flex-1 items-center justify-between overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
            expanded ? "opacity-100" : "opacity-0",
          )}
        >
          <span
            className={cn(
              "truncate text-[0.9375rem] leading-snug",
              isActive
                ? "font-semibold text-[var(--nav-text-active)]"
                : "font-medium text-[var(--nav-text-inactive)] dark:text-gray-200",
            )}
          >
            {navItem.label}
          </span>
          {badge !== null && badge > 0 && (
            <span
              className={cn(
                "ml-2 inline-flex h-5 shrink-0 items-center justify-center rounded-[10px] px-1.5 text-xs font-semibold text-[var(--nav-text-active)]",
                badgeVariant === "danger"
                  ? "bg-[var(--status-danger)] dark:bg-red-500"
                  : "bg-[var(--nav-bg-active)] dark:bg-gray-700",
              )}
            >
              {badge}
            </span>
          )}
        </div>
      </>
    );
  };

  const itemClassName = (isActive: boolean) =>
    cn(
      "relative flex h-12 w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]",
      isActive
        ? "bg-[var(--nav-bg-active)] text-[var(--text-inverse)]"
        : "bg-transparent text-[var(--nav-text-inactive)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)] dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-200",
    );

  // Track the flat index across sections for keyboard navigation ref assignment
  let flatIndex = 0;

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-inverse)] text-[var(--text-inverse)] transition-[width,min-width] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] dark:bg-gray-900",
        expanded ? "w-[260px] min-w-[260px]" : "w-[72px] min-w-[72px]",
      )}
    >
      {header}

      <div role="list" className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {sections.map((section, sectionIndex) => {
            const sectionItems = section.items.map((navItem) => {
              const currentFlatIndex = flatIndex;
              flatIndex++;

              const isActive = activeView === navItem.id;
              const content = renderItemContent(navItem, isActive);
              const classes = itemClassName(isActive);

              // Legacy groupSeparator support (only when sectionsProp is not provided)
              const showLegacySeparator =
                !sectionsProp &&
                groupSeparator != null &&
                groupSeparatorAfterIndex === currentFlatIndex;

              return (
                <React.Fragment key={navItem.id}>
                  {showLegacySeparator && groupSeparator}
                  {navItem.href && renderLink ? (
                    renderLink({
                      href: navItem.href,
                      className: classes,
                      children: content,
                      'aria-label': navItem.label,
                      ...(isActive ? { 'aria-current': 'page' as const } : {}),
                      onClick: () => onViewChange(navItem.id),
                    })
                  ) : navItem.href ? (
                    <a
                      href={navItem.href}
                      className={classes}
                      aria-label={navItem.label}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onViewChange(navItem.id)}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      ref={(element) => {
                        itemsRef.current[currentFlatIndex] = element;
                      }}
                      role="listitem"
                      type="button"
                      onClick={() => onViewChange(navItem.id)}
                      onKeyDown={(event) => handleKeyDown(event, currentFlatIndex)}
                      aria-label={navItem.label}
                      aria-current={isActive ? "page" : undefined}
                      className={classes}
                    >
                      {content}
                    </button>
                  )}
                </React.Fragment>
              );
            });

            return (
              <React.Fragment key={section.label ?? `section-${sectionIndex}`}>
                {sectionIndex > 0 && (
                  <div
                    data-testid="section-divider"
                    className="mx-2 my-2 h-px bg-white/10 dark:bg-gray-800"
                    aria-hidden="true"
                  />
                )}
                {section.label != null && (
                  <div
                    data-testid="section-label"
                    className={cn(
                      "px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--nav-text-muted)] transition-opacity duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      expanded ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {section.label}
                  </div>
                )}
                {sectionItems}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {onToggle && (
        <div className="border-t border-white/10 dark:border-gray-800">
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className={cn(
              "flex w-full items-center bg-transparent px-3 py-3 text-[var(--nav-text-muted)] transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:text-[var(--nav-text-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)] dark:text-gray-400 dark:hover:text-gray-200",
              expanded ? "justify-end" : "justify-center",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]",
                expanded ? "rotate-0" : "rotate-180",
              )}
            >
              <ChevronLeftIcon size={20} />
            </span>
          </button>
        </div>
      )}

      {footer}
    </nav>
  );
}

export default NavRail;

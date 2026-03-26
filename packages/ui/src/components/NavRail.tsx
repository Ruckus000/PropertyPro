'use client';

/**
 * NavRail — Sidebar navigation with collapsible state.
 *
 * Keyboard navigation: ArrowUp/ArrowDown to move between items, Enter/Space to select.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { StatusVariant } from "../tokens";

export type NavRailSubItem = {
  id: string;
  label: string;
  href: string;
  badge?: number | null;
  badgeVariant?: StatusVariant;
};

export type NavRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number | null;
  badgeVariant?: StatusVariant;
  /** Optional URL — when provided, the item renders as a link instead of a button. */
  href?: string;
  children?: NavRailSubItem[];
};

export type NavRailSection = {
  /** Section header label. Null omits the header entirely. */
  label: string | null;
  items: NavRailItem[];
};

export interface NavRailProps {
  /** @deprecated Prefer sections for explicit grouping. */
  items?: NavRailItem[];
  /** Section-based nav structure. Takes precedence over items. */
  sections?: NavRailSection[];
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
    'data-nav-focusable'?: "true";
    'data-testid'?: string;
    onClick?: () => void;
    onKeyDown?: (event: React.KeyboardEvent) => void;
  }) => React.ReactElement;
  /** Optional header content rendered above the nav items (e.g. brand/logo). */
  header?: React.ReactNode;
  /** Optional footer content rendered below the toggle (e.g. user profile). */
  footer?: React.ReactNode;
  /** Optional separator with label rendered between item groups. */
  groupSeparator?: React.ReactNode;
  /** Index at which to insert the group separator. */
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

function ChevronRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M8 5L13 10L8 15"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function PanelLeftCloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M12.5 7L10.25 10L12.5 13"
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
  sections,
  activeView,
  onViewChange,
  expanded,
  onToggle,
  renderLink,
  header,
  footer,
  groupSeparator,
  groupSeparatorAfterIndex,
}: NavRailProps) {
  const resolvedSections: NavRailSection[] = sections ?? (items ? [{ label: null, items }] : []);
  const navRef = useRef<HTMLElement | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(() =>
    resolvedSections.reduce<Record<string, boolean>>((state, section) => {
      for (const item of section.items) {
        if (item.children?.some((child) => child.id === activeView)) {
          state[item.id] = true;
        }
      }
      return state;
    }, {}),
  );

  useEffect(() => {
    setExpandedItems((current) => {
      let changed = false;
      const next = { ...current };

      for (const section of resolvedSections) {
        for (const item of section.items) {
          if (item.children?.some((child) => child.id === activeView) && !next[item.id]) {
            next[item.id] = true;
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [activeView, resolvedSections]);

  const focusByIndex = useCallback((index: number) => {
    const focusableItems = navRef.current?.querySelectorAll<HTMLElement>(
      '[data-nav-focusable="true"]',
    );
    focusableItems?.[index]?.focus();
  }, []);

  const handleRovingKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      const focusableCount =
        navRef.current?.querySelectorAll('[data-nav-focusable="true"]').length ?? 0;

      if (focusableCount === 0) {
        return;
      }

      let nextIndex: number | undefined;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex = index < focusableCount - 1 ? index + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex = index > 0 ? index - 1 : focusableCount - 1;
      }

      if (nextIndex !== undefined) {
        focusByIndex(nextIndex);
      }
    },
    [focusByIndex],
  );

  const handleButtonKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number, onSelect: () => void) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        handleRovingKeyDown(event, index);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    },
    [handleRovingKeyDown],
  );

  const renderItemContent = (
    navItem: NavRailItem,
    {
      isActive,
      containsActiveChild,
    }: {
      isActive: boolean;
      containsActiveChild: boolean;
    },
  ) => {
    const badge = navItem.badge ?? null;
    const badgeVariant: StatusVariant = navItem.badgeVariant ?? "neutral";
    const Icon = navItem.icon;
    const isHighlighted = isActive || containsActiveChild;

    return (
      <>
        {isActive && (
          <div
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-7 w-[4px] -translate-y-1/2 rounded-r-[6px] bg-[var(--nav-indicator)]"
          />
        )}

        <div className="relative size-[22px]">
          <div className="flex size-full items-center justify-center" aria-hidden="true">
            <Icon
              size={22}
              color={isHighlighted ? "var(--nav-text-active)" : "var(--nav-text-inactive)"}
              strokeWidth={isHighlighted ? 2 : 1.75}
            />
          </div>

          {!expanded && badge !== null && badge > 0 && (
            <div
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-[var(--nav-badge-border)]",
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
              isHighlighted
                ? "font-semibold text-[var(--nav-text-active)]"
                : "font-medium text-[var(--nav-text-inactive)]",
            )}
          >
            {navItem.label}
          </span>
          {badge !== null && badge > 0 && (
            <span
              className={cn(
                "ml-2 inline-flex h-5 shrink-0 items-center justify-center rounded-[10px] px-1.5 text-xs font-semibold text-[var(--nav-text-active)]",
                badgeVariant === "danger"
                  ? "bg-[var(--status-danger)]"
                  : "bg-[var(--nav-badge-bg)]",
              )}
            >
              {badge}
            </span>
          )}
        </div>
      </>
    );
  };

  const itemClassName = ({
    isActive,
    containsActiveChild,
    hasChildren,
  }: {
    isActive: boolean;
    containsActiveChild: boolean;
    hasChildren: boolean;
  }) =>
    cn(
      "relative flex h-12 w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]",
      isActive
        ? "bg-[var(--nav-bg-active)] text-[var(--nav-text-active)]"
        : containsActiveChild
          ? "bg-transparent text-[var(--nav-text-active)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)]"
        : "bg-transparent text-[var(--nav-text-inactive)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)]",
      hasChildren && expanded ? "min-w-0 flex-1" : null,
    );

  const subItemClassName = (isActive: boolean) =>
    cn(
      "flex h-9 items-center justify-between rounded-[10px] px-3 text-left text-sm transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]",
      isActive
        ? "bg-[var(--nav-bg-active)] font-medium text-[var(--nav-text-active)]"
        : "text-[var(--nav-text-muted)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)]",
    );

  const legacySeparator = (index: number) =>
    sections == null && groupSeparator != null && groupSeparatorAfterIndex === index
      ? groupSeparator
      : null;

  const renderSubItem = (
    navItem: NavRailItem,
    child: NavRailSubItem,
    focusIndex: number,
  ) => {
    const isActive = child.id === activeView;
    const badge = child.badge ?? null;
    const badgeVariant = child.badgeVariant ?? "neutral";
    const className = subItemClassName(isActive);
    const content = (
      <>
        <span className="truncate">{child.label}</span>
        {badge !== null && badge > 0 && (
          <span
            className={cn(
              "ml-2 inline-flex h-5 shrink-0 items-center justify-center rounded-[10px] px-1.5 text-xs font-semibold text-[var(--nav-text-active)]",
              badgeVariant === "danger"
                ? "bg-[var(--status-danger)]"
                : "bg-[var(--nav-badge-bg)]",
            )}
          >
            {badge}
          </span>
        )}
      </>
    );

    if (renderLink) {
      return renderLink({
        href: child.href,
        className,
        children: content,
        "aria-label": child.label,
        ...(isActive ? { "aria-current": "page" as const } : {}),
        "data-nav-focusable": "true",
        "data-testid": "nav-sub-item",
        onClick: () => onViewChange(child.id),
        onKeyDown: (event) => handleRovingKeyDown(event, focusIndex),
      });
    }

    return (
      <a
        href={child.href}
        className={className}
        aria-label={child.label}
        aria-current={isActive ? "page" : undefined}
        data-nav-focusable="true"
        data-testid="nav-sub-item"
        onClick={() => onViewChange(child.id)}
        onKeyDown={(event) => handleRovingKeyDown(event, focusIndex)}
      >
        {content}
      </a>
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label="Main navigation"
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-inverse)] text-[var(--text-inverse)] transition-[width,min-width] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] dark:bg-gray-900",
        expanded ? "w-[260px] min-w-[260px]" : "w-[72px] min-w-[72px]",
      )}
    >
      {header}

      <div role="list" className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {(() => {
            let focusIndex = 0;

            return resolvedSections.map((section, sectionIndex) => {
              const itemsBeforeSection = resolvedSections
                .slice(0, sectionIndex)
                .reduce((count, currentSection) => count + currentSection.items.length, 0);

              return (
                <React.Fragment key={`section-${sectionIndex}-${section.label ?? "untitled"}`}>
                  {sectionIndex > 0 && (
                    <div className="px-3 pt-3" data-testid="section-divider">
                      <div className="border-t border-[var(--nav-divider)]" />
                    </div>
                  )}
                  {expanded && section.label && (
                    <div
                      className="px-3 pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--nav-text-muted)]"
                      data-testid="section-label"
                    >
                      {section.label}
                    </div>
                  )}
                  {section.items.map((navItem, itemIndex) => {
                    const flatIndex = itemsBeforeSection + itemIndex;
                    const hasChildren = Boolean(navItem.children?.length);
                    const mainFocusIndex = focusIndex++;
                    const isActive = activeView === navItem.id;
                    const containsActiveChild =
                      navItem.children?.some((child) => child.id === activeView) ?? false;
                    const isExpanded =
                      expanded && hasChildren && (expandedItems[navItem.id] || containsActiveChild);
                    const content = renderItemContent(navItem, { isActive, containsActiveChild });
                    const classes = itemClassName({
                      isActive,
                      containsActiveChild,
                      hasChildren,
                    });

                    const mainAction = navItem.href && renderLink ? (
                      renderLink({
                        href: navItem.href,
                        className: classes,
                        children: content,
                        "aria-label": navItem.label,
                        ...(isActive ? { "aria-current": "page" as const } : {}),
                        "data-nav-focusable": "true",
                        "data-testid": "nav-item",
                        onClick: () => onViewChange(navItem.id),
                        onKeyDown: (event) => handleRovingKeyDown(event, mainFocusIndex),
                      })
                    ) : navItem.href ? (
                      <a
                        href={navItem.href}
                        className={classes}
                        aria-label={navItem.label}
                        aria-current={isActive ? "page" : undefined}
                        data-nav-focusable="true"
                        data-testid="nav-item"
                        onClick={() => onViewChange(navItem.id)}
                        onKeyDown={(event) => handleRovingKeyDown(event, mainFocusIndex)}
                      >
                        {content}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onViewChange(navItem.id)}
                        onKeyDown={(event) =>
                          handleButtonKeyDown(event, mainFocusIndex, () => onViewChange(navItem.id))
                        }
                        aria-label={navItem.label}
                        aria-current={isActive ? "page" : undefined}
                        aria-haspopup={
                          navItem.label.includes("(Upgrade)") ? "dialog" : undefined
                        }
                        data-nav-focusable="true"
                        data-testid="nav-item"
                        className={classes}
                      >
                        {content}
                      </button>
                    );

                    return (
                      <React.Fragment key={navItem.id}>
                        {legacySeparator(flatIndex)}
                        <div role="listitem" className="space-y-1">
                          {hasChildren && expanded ? (
                            <div className="flex items-center gap-1">
                              {mainAction}
                              <button
                                type="button"
                                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${navItem.label}`}
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  setExpandedItems((current) => ({
                                    ...current,
                                    [navItem.id]: !isExpanded,
                                  }))
                                }
                                className="flex h-12 w-10 shrink-0 items-center justify-center rounded-[10px] text-[var(--nav-text-muted)] transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "inline-flex transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]",
                                    isExpanded ? "rotate-90" : "rotate-0",
                                  )}
                                >
                                  <ChevronRightIcon size={18} />
                                </span>
                              </button>
                            </div>
                          ) : (
                            mainAction
                          )}
                          {hasChildren && isExpanded && (
                            <div className="ml-6 flex flex-col gap-0.5 border-l border-[var(--nav-divider)] pl-3">
                              {navItem.children!.map((child) => {
                                const childFocusIndex = focusIndex++;
                                return (
                                  <React.Fragment key={child.id}>
                                    {renderSubItem(navItem, child, childFocusIndex)}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>

      {onToggle && (
        <div className="border-t border-[var(--nav-divider)]">
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className={cn(
              "flex w-full items-center gap-2 bg-transparent px-2.5 py-2 text-[var(--nav-text-muted)] transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[var(--nav-bg-hover)] hover:text-[var(--nav-text-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]",
              expanded ? "" : "justify-center",
            )}
          >
            {expanded ? (
              <>
                <PanelLeftCloseIcon size={16} />
                <span className="text-[13px]">Collapse</span>
              </>
            ) : (
              <PanelLeftIcon size={16} />
            )}
          </button>
        </div>
      )}

      {footer}
    </nav>
  );
}

export default NavRail;

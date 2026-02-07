/**
 * NavRail - Sidebar navigation with collapsible state
 *
 * Phase 2.4 + 2.5:
 * - Collapse/expand toggle (ChevronLeft rotation)
 * - Badge counts on nav items with variant coloring
 * - Collapsed state: icon-only + dot badge indicator
 * - Expanded state: label + full badge count
 */

import React from "react";
import {
  semanticColors,
  componentTokens,
  primitiveFonts,
  primitiveRadius,
  createTransition,
  StatusVariant,
} from "../../tokens";

export type NavRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number | null;
  badgeVariant?: StatusVariant;
};

export interface NavRailProps {
  items: NavRailItem[];
  activeView: string;
  onViewChange: (viewId: string) => void;
  expanded: boolean;
  onToggle?: () => void;
}

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

export function NavRail({ items, activeView, onViewChange, expanded, onToggle }: NavRailProps) {
  const { rail, item } = componentTokens.nav;
  const width = expanded ? rail.widthExpanded : rail.widthCollapsed;

  return (
    <div
      className="dark-surface"
      style={{
        width,
        minWidth: width,
        background: semanticColors.surface.inverse,
        transition: createTransition(["width", "min-width"], "standard"),
        overflow: "hidden",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1, padding: 8, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((navItem) => {
            const isActive = activeView === navItem.id;
            const badge = navItem.badge ?? null;
            const badgeVariant: StatusVariant = navItem.badgeVariant ?? "neutral";
            const badgeDotColor = semanticColors.status[badgeVariant]?.foreground ?? semanticColors.status.neutral.foreground;
            const Icon = navItem.icon;

            return (
              <button
                key={navItem.id}
                type="button"
                onClick={() => onViewChange(navItem.id)}
                aria-label={navItem.label}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: item.gap,
                  height: item.height,
                  padding: `0 ${item.padding}px`,
                  background: isActive ? semanticColors.surface.inverseOverlay : "transparent",
                  border: "none",
                  borderRadius: item.radius,
                  cursor: "pointer",
                  position: "relative",
                  transition: createTransition("background", "micro"),
                  width: "100%",
                  color: semanticColors.surface.inverseTextMuted,
                }}
              >
                {isActive && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 24,
                      background: semanticColors.interactive.default,
                      borderRadius: `0 ${primitiveRadius.sm}px ${primitiveRadius.sm}px 0`,
                    }}
                  />
                )}

                <div style={{ position: "relative", width: item.iconSize, height: item.iconSize }}>
                  <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon
                      size={item.iconSize}
                      color={isActive ? semanticColors.text.inverse : semanticColors.surface.inverseTextMuted}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                  </div>
                  {!expanded && badge && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 8,
                        height: 8,
                        borderRadius: primitiveRadius.full,
                        background: badgeDotColor,
                        border: `2px solid ${semanticColors.surface.inverse}`,
                      }}
                    />
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flex: 1,
                    opacity: expanded ? 1 : 0,
                    transition: createTransition("opacity", "quick"),
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      fontSize: primitiveFonts.size.sm,
                      fontWeight: isActive ? primitiveFonts.weight.medium : primitiveFonts.weight.normal,
                      color: isActive ? semanticColors.text.inverse : semanticColors.surface.inverseTextSubtle,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {navItem.label}
                  </span>
                  {badge && (
                    <span
                      style={{
                        background:
                          badgeVariant === "danger"
                            ? semanticColors.status.danger.foreground
                            : semanticColors.surface.inverseOverlay,
                        color: semanticColors.text.inverse,
                        fontSize: primitiveFonts.size.xs,
                        fontWeight: primitiveFonts.weight.semibold,
                        padding: "0 6px",
                        borderRadius: 10,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {onToggle && (
        <div style={{ borderTop: `1px solid ${semanticColors.surface.inverseBorder}` }}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: expanded ? "flex-end" : "center",
              padding: 12,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: semanticColors.surface.inverseTextMuted,
              width: "100%",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                transform: expanded ? "rotate(0)" : "rotate(180deg)",
                transition: createTransition("transform", "standard"),
              }}
            >
              <ChevronLeftIcon size={20} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default NavRail;

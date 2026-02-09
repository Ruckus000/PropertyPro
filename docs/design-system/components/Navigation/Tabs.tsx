/**
 * Tabs - Navigation tabs with keyboard support
 *
 * - Arrow-key navigation between tabs
 * - Active indicator styling + optional count badge
 * - Semantic roles: role="tablist" / role="tab"
 */

import React, { HTMLAttributes, ReactNode, useRef } from "react";
import {
  semanticColors,
  semanticElevation,
  primitiveFonts,
  primitiveRadius,
  primitiveSpace,
  createTransition,
} from "../../tokens";

export type TabsItem = {
  id: string;
  label: ReactNode;
  count?: number;
};

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  tabs: TabsItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onTabChange, style, ...props }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusIndex = (index: number) => {
    tabRefs.current[index]?.focus?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = e.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;

    e.preventDefault();
    if (tabs.length === 0) return;

    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? tabs.length - 1
          : key === "ArrowRight"
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;

    onTabChange(tabs[nextIndex].id);
    requestAnimationFrame(() => focusIndex(nextIndex));
  };

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: primitiveSpace[1],
        background: semanticColors.surface.muted,
        padding: primitiveSpace[2],
        borderRadius: primitiveRadius.md,
        width: "fit-content",
        ...style,
      }}
      {...props}
    >
      {tabs.map((tab, idx) => {
        const selected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `${primitiveSpace[2]}px ${primitiveSpace[4]}px`,
              borderRadius: primitiveRadius.sm,
              border: "none",
              background: selected ? semanticColors.surface.default : "transparent",
              color: selected ? semanticColors.text.primary : semanticColors.text.secondary,
              fontFamily: primitiveFonts.family.sans,
              fontSize: primitiveFonts.size.sm,
              fontWeight: selected ? primitiveFonts.weight.medium : primitiveFonts.weight.normal,
              cursor: "pointer",
              boxShadow: selected ? semanticElevation.e1.shadow : semanticElevation.e0.shadow,
              transition: createTransition("all", "micro"),
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  marginLeft: primitiveSpace[2],
                  padding: `0 ${primitiveSpace[2]}px`,
                  borderRadius: primitiveRadius.full,
                  background: selected ? semanticColors.interactive.subtle : semanticColors.surface.muted,
                  color: selected ? semanticColors.interactive.default : semanticColors.text.tertiary,
                  fontSize: primitiveFonts.size.xs,
                  fontWeight: primitiveFonts.weight.medium,
                  height: 20,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;

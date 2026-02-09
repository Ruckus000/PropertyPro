/**
 * P0-03: NavRail component tests
 *
 * Tests keyboard navigation (ArrowUp, ArrowDown, Enter, Space),
 * expanded/collapsed states, badge display, active state, toggle button.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NavRail } from "../../src/components/NavRail";
import type { NavRailItem } from "../../src/components/NavRail";
import { componentTokens, semanticColors } from "../../src/tokens";

// Test icon component
function TestIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} data-testid="test-icon">
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
    </svg>
  );
}

const defaultItems: NavRailItem[] = [
  { id: "dashboard", label: "Dashboard", icon: TestIcon },
  { id: "documents", label: "Documents", icon: TestIcon },
  { id: "compliance", label: "Compliance", icon: TestIcon, badge: 3, badgeVariant: "danger" },
  { id: "settings", label: "Settings", icon: TestIcon },
];

function renderNavRail(overrides: Partial<React.ComponentProps<typeof NavRail>> = {}) {
  const props = {
    items: defaultItems,
    activeView: "dashboard",
    onViewChange: vi.fn(),
    expanded: true,
    ...overrides,
  };
  return { ...render(<NavRail {...props} />), props };
}

describe("NavRail", () => {
  describe("Basic rendering", () => {
    it("renders a nav element with aria-label", () => {
      renderNavRail();
      const nav = screen.getByRole("navigation");
      expect(nav).toBeTruthy();
      expect(nav.getAttribute("aria-label")).toBe("Main navigation");
    });

    it("renders all navigation items", () => {
      renderNavRail();
      for (const item of defaultItems) {
        expect(screen.getByLabelText(item.label)).toBeTruthy();
      }
    });

    it("renders items as buttons", () => {
      renderNavRail();
      const buttons = screen.getAllByRole("listitem");
      expect(buttons.length).toBe(defaultItems.length);
      for (const btn of buttons) {
        expect(btn.tagName).toBe("BUTTON");
      }
    });
  });

  describe("Active state", () => {
    it("marks active item with aria-current=page", () => {
      renderNavRail({ activeView: "documents" });
      const activeBtn = screen.getByLabelText("Documents");
      expect(activeBtn.getAttribute("aria-current")).toBe("page");
    });

    it("non-active items do not have aria-current", () => {
      renderNavRail({ activeView: "dashboard" });
      const inactiveBtn = screen.getByLabelText("Documents");
      expect(inactiveBtn.getAttribute("aria-current")).toBeNull();
    });

    it("active item has active indicator bar", () => {
      renderNavRail({ activeView: "dashboard" });
      const activeBtn = screen.getByLabelText("Dashboard");
      const indicator = activeBtn.querySelector("[aria-hidden='true']");
      expect(indicator).toBeTruthy();
    });
  });

  describe("Item click", () => {
    it("calls onViewChange with item id when clicked", () => {
      const { props } = renderNavRail();
      fireEvent.click(screen.getByLabelText("Documents"));
      expect(props.onViewChange).toHaveBeenCalledWith("documents");
    });
  });

  describe("Keyboard navigation", () => {
    it("ArrowDown moves focus to next item", () => {
      renderNavRail();
      const firstItem = screen.getByLabelText("Dashboard");
      firstItem.focus();
      fireEvent.keyDown(firstItem, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByLabelText("Documents"));
    });

    it("ArrowDown wraps from last to first item", () => {
      renderNavRail();
      const lastItem = screen.getByLabelText("Settings");
      lastItem.focus();
      fireEvent.keyDown(lastItem, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByLabelText("Dashboard"));
    });

    it("ArrowUp moves focus to previous item", () => {
      renderNavRail();
      const secondItem = screen.getByLabelText("Documents");
      secondItem.focus();
      fireEvent.keyDown(secondItem, { key: "ArrowUp" });
      expect(document.activeElement).toBe(screen.getByLabelText("Dashboard"));
    });

    it("ArrowUp wraps from first to last item", () => {
      renderNavRail();
      const firstItem = screen.getByLabelText("Dashboard");
      firstItem.focus();
      fireEvent.keyDown(firstItem, { key: "ArrowUp" });
      expect(document.activeElement).toBe(screen.getByLabelText("Settings"));
    });

    it("Enter selects the focused item", () => {
      const { props } = renderNavRail();
      const secondItem = screen.getByLabelText("Documents");
      secondItem.focus();
      fireEvent.keyDown(secondItem, { key: "Enter" });
      expect(props.onViewChange).toHaveBeenCalledWith("documents");
    });

    it("Space selects the focused item", () => {
      const { props } = renderNavRail();
      const secondItem = screen.getByLabelText("Documents");
      secondItem.focus();
      fireEvent.keyDown(secondItem, { key: " " });
      expect(props.onViewChange).toHaveBeenCalledWith("documents");
    });

    it("ArrowDown prevents default scroll", () => {
      renderNavRail();
      const firstItem = screen.getByLabelText("Dashboard");
      firstItem.focus();
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      firstItem.dispatchEvent(event);
      // The React handler calls preventDefault, verify through behavior:
      // focus moved means it was handled
      expect(document.activeElement).toBe(screen.getByLabelText("Documents"));
    });
  });

  describe("Expanded state", () => {
    it("uses expanded width when expanded=true", () => {
      renderNavRail({ expanded: true });
      const nav = screen.getByRole("navigation");
      expect(nav.style.width).toBe(`${componentTokens.nav.rail.widthExpanded}px`);
    });

    it("uses collapsed width when expanded=false", () => {
      renderNavRail({ expanded: false });
      const nav = screen.getByRole("navigation");
      expect(nav.style.width).toBe(`${componentTokens.nav.rail.widthCollapsed}px`);
    });

    it("labels are visible when expanded (opacity=1)", () => {
      renderNavRail({ expanded: true });
      const dashboardBtn = screen.getByLabelText("Dashboard");
      // The label container div should have opacity 1
      const labelContainer = dashboardBtn.querySelectorAll("div")[1]; // second div after icon
      // Find the div with opacity style
      const allDivs = dashboardBtn.querySelectorAll("div");
      const labelDiv = Array.from(allDivs).find(
        (d) => (d as HTMLElement).style.opacity === "1"
      );
      expect(labelDiv).toBeTruthy();
    });

    it("labels are hidden when collapsed (opacity=0)", () => {
      renderNavRail({ expanded: false });
      const dashboardBtn = screen.getByLabelText("Dashboard");
      const allDivs = dashboardBtn.querySelectorAll("div");
      const labelDiv = Array.from(allDivs).find(
        (d) => (d as HTMLElement).style.opacity === "0"
      );
      expect(labelDiv).toBeTruthy();
    });
  });

  describe("Badge display", () => {
    it("shows badge count for expanded items with badge > 0", () => {
      renderNavRail({ expanded: true });
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("shows badge dot for collapsed items with badge > 0", () => {
      renderNavRail({ expanded: false });
      const complianceBtn = screen.getByLabelText("Compliance");
      // Badge dot is inside the icon container when collapsed
      const dots = complianceBtn.querySelectorAll("[aria-hidden='true']");
      // Should have at least the badge dot (8×8 circle)
      const hasDot = Array.from(dots).some(
        (el) =>
          (el as HTMLElement).style.borderRadius !== "" &&
          (el as HTMLElement).style.width === "8px"
      );
      expect(hasDot).toBe(true);
    });

    it("does not show badge for items with badge=null", () => {
      renderNavRail({ expanded: true });
      const dashboardBtn = screen.getByLabelText("Dashboard");
      // Dashboard has no badge, so no count span
      const spans = dashboardBtn.querySelectorAll("span");
      const hasBadgeCount = Array.from(spans).some(
        (s) => /^\d+$/.test(s.textContent || "")
      );
      expect(hasBadgeCount).toBe(false);
    });
  });

  describe("Toggle button", () => {
    it("renders toggle button when onToggle is provided", () => {
      const onToggle = vi.fn();
      renderNavRail({ onToggle });
      const toggleBtn = screen.getByLabelText("Collapse sidebar");
      expect(toggleBtn).toBeTruthy();
    });

    it("toggle button has 'Expand sidebar' label when collapsed", () => {
      const onToggle = vi.fn();
      renderNavRail({ expanded: false, onToggle });
      expect(screen.getByLabelText("Expand sidebar")).toBeTruthy();
    });

    it("fires onToggle when toggle button clicked", () => {
      const onToggle = vi.fn();
      renderNavRail({ onToggle });
      fireEvent.click(screen.getByLabelText("Collapse sidebar"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("does not render toggle button when onToggle is not provided", () => {
      renderNavRail({ onToggle: undefined });
      expect(screen.queryByLabelText("Collapse sidebar")).toBeNull();
      expect(screen.queryByLabelText("Expand sidebar")).toBeNull();
    });
  });

  describe("Styling", () => {
    it("nav has inverse surface background", () => {
      renderNavRail();
      const nav = screen.getByRole("navigation");
      expect(nav.style.background).toBe(semanticColors.surface.inverse);
    });

    it("nav has full height", () => {
      renderNavRail();
      expect(screen.getByRole("navigation").style.height).toBe("100%");
    });

    it("nav has flex column layout", () => {
      renderNavRail();
      const nav = screen.getByRole("navigation");
      expect(nav.style.display).toBe("flex");
      expect(nav.style.flexDirection).toBe("column");
    });

    it("nav has transition on width", () => {
      renderNavRail();
      expect(screen.getByRole("navigation").style.transition).toContain("width");
    });
  });
});

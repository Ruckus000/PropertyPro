/**
 * P0-03: NavRail component tests
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { NavRail } from "../../src/components/NavRail";
import type { NavRailItem, NavRailSection } from "../../src/components/NavRail";

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
  {
    id: "compliance",
    label: "Compliance",
    icon: TestIcon,
    badge: 3,
    badgeVariant: "danger",
  },
  { id: "settings", label: "Settings", icon: TestIcon },
];

const sectionItems: NavRailSection[] = [
  {
    label: null,
    items: [{ id: "dashboard", label: "Dashboard", icon: TestIcon }],
  },
  {
    label: "Community",
    items: [
      { id: "announcements", label: "Announcements", icon: TestIcon, badge: 2 },
      { id: "meetings", label: "Meetings", icon: TestIcon },
    ],
  },
  {
    label: "Admin",
    items: [{ id: "governance", label: "Governance", icon: TestIcon }],
  },
];

const itemsWithChildren: NavRailSection[] = [
  {
    label: null,
    items: [
      {
        id: "announcements",
        label: "Announcements",
        icon: TestIcon,
        href: "/announcements",
        badge: 2,
        children: [
          { id: "announcements-all", label: "All announcements", href: "/announcements" },
          {
            id: "announcements-drafts",
            label: "Drafts",
            href: "/announcements/drafts",
            badge: 1,
          },
        ],
      },
      { id: "meetings", label: "Meetings", icon: TestIcon, href: "/meetings" },
    ],
  },
];

function renderNavRail(overrides: Partial<React.ComponentProps<typeof NavRail>> = {}) {
  const props = {
    items: defaultItems,
    activeView: "dashboard",
    onViewChange: vi.fn(),
    expanded: true,
    ...overrides,
  };

  return {
    ...render(<NavRail {...props} />),
    props,
  };
}

describe("NavRail", () => {
  describe("Basic rendering", () => {
    it("renders nav with aria-label and all items", () => {
      renderNavRail();

      expect(screen.getByRole("navigation").getAttribute("aria-label")).toBe(
        "Main navigation",
      );
      for (const item of defaultItems) {
        expect(screen.getByLabelText(item.label)).toBeTruthy();
      }

      const listItems = screen.getAllByRole("listitem");
      expect(listItems).toHaveLength(defaultItems.length);
    });

    it("renders explicit dark classes on nav", () => {
      renderNavRail();
      expect(screen.getByRole("navigation").className).toContain("dark:bg-gray-900");
    });

    it("uses nav semantic tokens for item treatments", () => {
      renderNavRail();

      const activeItem = screen.getByLabelText("Dashboard");
      const inactiveItem = screen.getByLabelText("Documents");

      expect(activeItem.className).toContain("bg-[var(--nav-bg-active)]");
      expect(inactiveItem.className).toContain("text-[var(--nav-text-inactive)]");
      expect(inactiveItem.className).toContain("hover:bg-[var(--nav-bg-hover)]");
    });
  });

  describe("Active state", () => {
    it("marks active item with aria-current=page", () => {
      renderNavRail({ activeView: "documents" });
      expect(screen.getByLabelText("Documents").getAttribute("aria-current")).toBe(
        "page",
      );
      expect(screen.getByLabelText("Dashboard").getAttribute("aria-current")).toBeNull();
    });

    it("renders active indicator", () => {
      renderNavRail({ activeView: "dashboard" });
      const active = screen.getByLabelText("Dashboard");
      expect(active.querySelector(".w-\\[4px\\]")).toBeTruthy();
    });
  });

  describe("Click and keyboard navigation", () => {
    it("clicking item triggers onViewChange", () => {
      const { props } = renderNavRail();
      fireEvent.click(screen.getByLabelText("Documents"));
      expect(props.onViewChange).toHaveBeenCalledWith("documents");
    });

    it("ArrowDown and ArrowUp move focus", () => {
      renderNavRail();

      const dashboard = screen.getByLabelText("Dashboard");
      const documents = screen.getByLabelText("Documents");
      const settings = screen.getByLabelText("Settings");

      dashboard.focus();
      fireEvent.keyDown(dashboard, { key: "ArrowDown" });
      expect(document.activeElement).toBe(documents);

      fireEvent.keyDown(documents, { key: "ArrowUp" });
      expect(document.activeElement).toBe(dashboard);

      fireEvent.keyDown(dashboard, { key: "ArrowUp" });
      expect(document.activeElement).toBe(settings);
    });

    it("Enter and Space trigger onViewChange", () => {
      const { props } = renderNavRail();
      const documents = screen.getByLabelText("Documents");

      fireEvent.keyDown(documents, { key: "Enter" });
      fireEvent.keyDown(documents, { key: " " });

      expect(props.onViewChange).toHaveBeenNthCalledWith(1, "documents");
      expect(props.onViewChange).toHaveBeenNthCalledWith(2, "documents");
    });

    it("uses explicit popup semantics for non-link actions", () => {
      renderNavRail({
        items: [{ id: "upgrade", label: "Requires a higher plan", icon: TestIcon, ariaHasPopup: "dialog" }],
        activeView: "upgrade",
      });

      expect(screen.getByLabelText("Requires a higher plan").getAttribute("aria-haspopup")).toBe(
        "dialog",
      );
    });
  });

  describe("Expanded/collapsed states", () => {
    it("uses expanded width classes", () => {
      renderNavRail({ expanded: true });
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("w-[260px]");
      expect(nav.className).toContain("min-w-[260px]");
    });

    it("uses collapsed width classes", () => {
      renderNavRail({ expanded: false });
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("w-[72px]");
      expect(nav.className).toContain("min-w-[72px]");
    });

    it("label container toggles opacity class", () => {
      renderNavRail({ expanded: true });
      const expandedButton = screen.getByLabelText("Dashboard");
      expect(expandedButton.querySelector(".opacity-100")).toBeTruthy();

      renderNavRail({ expanded: false });
      const collapsedButton = screen.getAllByLabelText("Dashboard")[1];
      expect(collapsedButton?.querySelector(".opacity-0")).toBeTruthy();
    });
  });

  describe("Section-based rendering", () => {
    it("renders section labels for labeled sections when expanded", () => {
      renderNavRail({
        items: undefined,
        sections: sectionItems,
      });

      expect(screen.getByText("Community")).toBeTruthy();
      expect(screen.getByText("Admin")).toBeTruthy();
    });

    it("does not render a label for null-label sections", () => {
      renderNavRail({
        items: undefined,
        sections: sectionItems,
      });

      const labels = document.querySelectorAll('[data-testid="section-label"]');
      expect(labels).toHaveLength(2);
    });

    it("renders dividers between sections", () => {
      renderNavRail({
        items: undefined,
        sections: sectionItems,
      });

      const dividers = document.querySelectorAll('[data-testid="section-divider"]');
      expect(dividers).toHaveLength(2);
    });

    it("hides section labels when collapsed", () => {
      renderNavRail({
        items: undefined,
        sections: sectionItems,
        expanded: false,
      });

      expect(screen.queryByText("Community")).toBeNull();
      expect(screen.queryByText("Admin")).toBeNull();
    });
  });

  describe("Badge behavior", () => {
    it("shows badge count when expanded", () => {
      renderNavRail({ expanded: true });
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("shows badge dot when collapsed", () => {
      renderNavRail({ expanded: false });
      const compliance = screen.getByLabelText("Compliance");
      expect(compliance.querySelector(".size-2.rounded-full")).toBeTruthy();
    });
  });

  describe("Children and disclosure", () => {
    it("renders a chevron button for items with children", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "meetings",
      });

      const chevron = screen.getByLabelText("Expand Announcements");
      expect(chevron).toBeTruthy();
      expect(chevron.tagName).toBe("BUTTON");
      expect(chevron.getAttribute("aria-expanded")).toBe("false");
    });

    it("expands children when chevron is clicked", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "meetings",
      });

      const chevron = screen.getByLabelText("Expand Announcements");
      fireEvent.click(chevron);

      expect(chevron.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("All announcements")).toBeTruthy();
      expect(screen.getByText("Drafts")).toBeTruthy();
    });

    it("renders the parent row as a link, not a button", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "meetings",
      });

      const parentLink = screen.getByText("Announcements").closest("a");
      expect(parentLink).toBeTruthy();
      expect(parentLink?.getAttribute("href")).toBe("/announcements");
    });

    it("gives the parent a lighter treatment when a child is active", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "announcements-drafts",
      });

      const parentRow = screen.getByText("Announcements").closest('[data-testid="nav-item"]');
      expect(parentRow?.className).not.toContain("bg-[var(--nav-bg-active)]");
      expect(parentRow?.className).toContain("text-[var(--nav-text-active)]");
    });

    it("auto-expands the parent when a child is active", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "announcements-drafts",
      });

      expect(screen.getByText("Drafts")).toBeTruthy();
      const draftsItem = screen.getByText("Drafts").closest("[aria-current]");
      expect(draftsItem?.getAttribute("aria-current")).toBe("page");
    });

    it("hides children when the sidebar is collapsed", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "announcements-drafts",
        expanded: false,
      });

      expect(screen.queryByText("All announcements")).toBeNull();
      expect(screen.queryByText("Drafts")).toBeNull();
    });

    it("does not render a chevron for items without children", () => {
      renderNavRail({
        items: undefined,
        sections: itemsWithChildren,
        activeView: "meetings",
      });

      expect(screen.queryByLabelText("Expand Meetings")).toBeNull();
    });
  });

  describe("Toggle button", () => {
    it("renders and fires toggle callback", () => {
      const onToggle = vi.fn();
      renderNavRail({ onToggle });

      const button = screen.getByLabelText("Collapse sidebar");
      fireEvent.click(button);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("shows expand label when collapsed", () => {
      const onToggle = vi.fn();
      renderNavRail({ expanded: false, onToggle });
      expect(screen.getByLabelText("Expand sidebar")).toBeTruthy();
    });

    it('shows "Collapse" text when expanded', () => {
      const onToggle = vi.fn();
      renderNavRail({ onToggle });

      expect(screen.getByText("Collapse")).toBeTruthy();
    });

    it('hides the "Collapse" text when collapsed', () => {
      const onToggle = vi.fn();
      renderNavRail({ expanded: false, onToggle });

      expect(screen.queryByText("Collapse")).toBeNull();
    });

    it("is omitted when onToggle is undefined", () => {
      renderNavRail({ onToggle: undefined });
      expect(screen.queryByLabelText("Collapse sidebar")).toBeNull();
      expect(screen.queryByLabelText("Expand sidebar")).toBeNull();
    });
  });

  describe("Section-based rendering", () => {
    const SECTION_DATA: NavRailSection[] = [
      {
        label: null,
        items: [
          { id: "dashboard", label: "Dashboard", icon: TestIcon, href: "/dashboard" },
        ],
      },
      {
        label: "Community",
        items: [
          { id: "announcements", label: "Announcements", icon: TestIcon, href: "/announcements", badge: 2 },
          { id: "meetings", label: "Meetings", icon: TestIcon, href: "/meetings" },
        ],
      },
      {
        label: "Admin",
        items: [
          { id: "governance", label: "Governance", icon: TestIcon, href: "/governance" },
        ],
      },
    ];

    function renderSectionNavRail(
      overrides: Partial<React.ComponentProps<typeof NavRail>> = {},
    ) {
      const props = {
        sections: SECTION_DATA,
        activeView: "dashboard",
        onViewChange: vi.fn(),
        expanded: true,
        ...overrides,
      };

      return {
        ...render(<NavRail {...props} />),
        props,
      };
    }

    it("renders all items from all sections", () => {
      renderSectionNavRail();

      expect(screen.getByLabelText("Dashboard")).toBeTruthy();
      expect(screen.getByLabelText("Announcements")).toBeTruthy();
      expect(screen.getByLabelText("Meetings")).toBeTruthy();
      expect(screen.getByLabelText("Governance")).toBeTruthy();
    });

    it("renders section labels as uppercase text", () => {
      renderSectionNavRail();

      const labels = screen.getAllByTestId("section-label");
      expect(labels).toHaveLength(2);
      expect(labels[0]!.textContent).toBe("Community");
      expect(labels[1]!.textContent).toBe("Admin");
      // Verify uppercase styling class
      expect(labels[0]!.className).toContain("uppercase");
    });

    it("does not render a header for null-label sections", () => {
      renderSectionNavRail();

      // Only 2 labeled sections (Community and Admin), not 3
      const labels = screen.getAllByTestId("section-label");
      expect(labels).toHaveLength(2);
    });

    it("renders dividers between sections", () => {
      renderSectionNavRail();

      // Dividers appear between sections (not before the first one)
      const dividers = screen.getAllByTestId("section-divider");
      expect(dividers).toHaveLength(2); // between section 0-1 and section 1-2
    });

    it("hides section labels when collapsed", () => {
      renderSectionNavRail({ expanded: false });

      const labels = screen.queryAllByTestId("section-label");
      for (const label of labels) {
        expect(label.className).toContain("opacity-0");
      }
    });

    it("shows section labels when expanded", () => {
      renderSectionNavRail({ expanded: true });

      const labels = screen.getAllByTestId("section-label");
      for (const label of labels) {
        expect(label.className).toContain("opacity-100");
      }
    });

    it("still renders badge counts in section mode", () => {
      renderSectionNavRail({ expanded: true });

      expect(screen.getByText("2")).toBeTruthy();
    });

    it("backward compat: items prop still works without sections", () => {
      renderNavRail({ items: defaultItems });

      for (const item of defaultItems) {
        expect(screen.getByLabelText(item.label)).toBeTruthy();
      }
    });
  });
});

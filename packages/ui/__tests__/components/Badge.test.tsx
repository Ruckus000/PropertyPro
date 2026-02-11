/**
 * P0-03: Badge component tests
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Badge, PriorityBadge, StatusBadge } from "../../src/components/Badge";

const variants = ["success", "brand", "warning", "danger", "info", "neutral"] as const;
const sizes = ["sm", "md", "lg"] as const;

describe("Badge", () => {
  describe("Variant × Size matrix", () => {
    for (const variant of variants) {
      for (const size of sizes) {
        it(`renders ${variant}/${size} without error`, () => {
          render(
            <Badge variant={variant} size={size} data-testid="badge">
              {variant}
            </Badge>,
          );

          const badge = screen.getByTestId("badge");
          expect(badge.tagName).toBe("SPAN");
          if (size === "sm") {
            expect(badge.className).toContain("h-5");
          }
          if (size === "md") {
            expect(badge.className).toContain("h-6");
          }
          if (size === "lg") {
            expect(badge.className).toContain("h-7");
          }
        });
      }
    }
  });

  it("defaults to neutral variant and md size", () => {
    render(<Badge data-testid="badge">Default</Badge>);
    const className = screen.getByTestId("badge").className;
    expect(className).toContain("h-6");
    expect(className).toContain("bg-[var(--status-neutral-bg)]");
  });

  describe("Outlined mode", () => {
    it("uses outlined classes", () => {
      render(
        <Badge variant="success" outlined data-testid="badge">
          Outlined
        </Badge>,
      );
      const className = screen.getByTestId("badge").className;
      expect(className).toContain("bg-transparent");
      expect(className).toContain("border");
      expect(className).toContain("border-[var(--status-success-border)]");
    });
  });

  describe("Compound slots", () => {
    it("renders Badge.Icon and Badge.Label", () => {
      render(
        <Badge>
          <Badge.Icon>
            <span data-testid="badge-icon">*</span>
          </Badge.Icon>
          <Badge.Label>Label</Badge.Label>
        </Badge>,
      );

      expect(screen.getByTestId("badge-icon")).toBeTruthy();
      expect(screen.getByText("Label")).toBeTruthy();
    });

    it("renders Badge.Dot", () => {
      const { container } = render(
        <Badge variant="danger">
          <Badge.Dot />
          <Badge.Label>Alert</Badge.Label>
        </Badge>,
      );

      expect(container.querySelector(".rounded-full")).toBeTruthy();
    });
  });

  describe("Dark mode classes", () => {
    it("success includes explicit dark classes", () => {
      render(
        <Badge variant="success" data-testid="badge">
          Dark
        </Badge>,
      );
      const className = screen.getByTestId("badge").className;
      expect(className).toContain("dark:bg-green-950");
      expect(className).toContain("dark:text-green-200");
    });

    it("danger includes explicit dark classes", () => {
      render(
        <Badge variant="danger" data-testid="badge">
          Dark
        </Badge>,
      );
      const className = screen.getByTestId("badge").className;
      expect(className).toContain("dark:bg-red-950");
      expect(className).toContain("dark:text-red-200");
    });

    it("outlined neutral includes explicit dark classes", () => {
      render(
        <Badge variant="neutral" outlined data-testid="badge">
          Dark
        </Badge>,
      );
      const className = screen.getByTestId("badge").className;
      expect(className).toContain("dark:border-gray-600");
      expect(className).toContain("dark:text-gray-300");
    });
  });

  it("has correct displayName", () => {
    expect(Badge.displayName).toBe("Badge");
  });
});

describe("StatusBadge", () => {
  it("renders compliant status", () => {
    render(<StatusBadge status="compliant" data-testid="status-badge" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge.getAttribute("aria-label")).toBe("Compliant");
    expect(screen.getByText("Compliant")).toBeTruthy();
    expect(badge.querySelector("svg")).toBeTruthy();
  });

  it("can hide icon and label", () => {
    render(
      <StatusBadge
        status="pending"
        showIcon={false}
        showLabel={false}
        data-testid="status-badge"
      />,
    );

    const badge = screen.getByTestId("status-badge");
    expect(badge.querySelector("svg")).toBeNull();
    expect(screen.queryByText("Due Soon")).toBeNull();
  });

  it("has correct displayName", () => {
    expect(StatusBadge.displayName).toBe("StatusBadge");
  });
});

describe("PriorityBadge", () => {
  it("maps high/medium/low labels", () => {
    render(
      <>
        <PriorityBadge priority="high" data-testid="high" />
        <PriorityBadge priority="medium" data-testid="medium" />
        <PriorityBadge priority="low" data-testid="low" />
      </>,
    );

    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Medium")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.getByTestId("high").className).toContain("bg-[var(--status-danger-bg)]");
    expect(screen.getByTestId("medium").className).toContain("bg-[var(--status-warning-bg)]");
    expect(screen.getByTestId("low").className).toContain("bg-[var(--status-neutral-bg)]");
  });

  it("defaults to sm size", () => {
    render(<PriorityBadge priority="high" data-testid="priority" />);
    expect(screen.getByTestId("priority").className).toContain("h-5");
  });

  it("has correct displayName", () => {
    expect(PriorityBadge.displayName).toBe("PriorityBadge");
  });
});

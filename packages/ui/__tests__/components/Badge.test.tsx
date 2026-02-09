/**
 * P0-03: Badge component tests
 *
 * Tests all variant × size combinations, compound slots (Icon, Label, Dot),
 * outlined mode, StatusBadge, and PriorityBadge.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Badge, StatusBadge, PriorityBadge } from "../../src/components/Badge";
import { semanticColors, componentTokens, primitiveFonts } from "../../src/tokens";

const variants = ["success", "brand", "warning", "danger", "info", "neutral"] as const;
const badgeSizes = ["sm", "md", "lg"] as const;

describe("Badge", () => {
  describe("Variant × Size matrix", () => {
    for (const variant of variants) {
      for (const size of badgeSizes) {
        it(`renders ${variant}/${size} without error`, () => {
          render(
            <Badge variant={variant} size={size} data-testid="badge">
              {variant}
            </Badge>
          );
          const el = screen.getByTestId("badge");
          expect(el.tagName).toBe("SPAN");
          expect(el.style.height).toBe(`${componentTokens.badge.height[size]}px`);
        });
      }
    }
  });

  describe("Default props", () => {
    it("defaults to neutral variant and md size", () => {
      render(<Badge data-testid="badge">Default</Badge>);
      const el = screen.getByTestId("badge");
      expect(el.style.height).toBe(`${componentTokens.badge.height.md}px`);
      expect(el.style.color).toBe(semanticColors.status.neutral.foreground);
    });
  });

  describe("Variant styling", () => {
    it("success uses success status colors", () => {
      render(
        <Badge variant="success" data-testid="badge">
          OK
        </Badge>
      );
      const el = screen.getByTestId("badge");
      expect(el.style.background).toBe(semanticColors.status.success.background);
      expect(el.style.color).toBe(semanticColors.status.success.foreground);
    });

    it("danger uses danger status colors", () => {
      render(
        <Badge variant="danger" data-testid="badge">
          Error
        </Badge>
      );
      const el = screen.getByTestId("badge");
      expect(el.style.background).toBe(semanticColors.status.danger.background);
      expect(el.style.color).toBe(semanticColors.status.danger.foreground);
    });
  });

  describe("Outlined mode", () => {
    it("has transparent background when outlined", () => {
      render(
        <Badge variant="success" outlined data-testid="badge">
          OK
        </Badge>
      );
      const el = screen.getByTestId("badge");
      expect(el.style.background).toBe("transparent");
      expect(el.style.border).toContain("1px solid");
      expect(el.style.border).toContain(semanticColors.status.success.border);
    });

    it("non-outlined has no visible border", () => {
      render(
        <Badge variant="success" data-testid="badge">
          OK
        </Badge>
      );
      // jsdom may serialize "none" as empty string for border shorthand
      const border = screen.getByTestId("badge").style.border;
      expect(border === "none" || border === "").toBe(true);
    });
  });

  describe("Size styling", () => {
    it("sm badge uses correct height and padding", () => {
      render(
        <Badge size="sm" data-testid="badge">
          SM
        </Badge>
      );
      const el = screen.getByTestId("badge");
      expect(el.style.height).toBe(`${componentTokens.badge.height.sm}px`);
      expect(el.style.padding).toBe(`0px ${componentTokens.badge.padding.sm}px`);
    });

    it("lg badge uses correct height and padding", () => {
      render(
        <Badge size="lg" data-testid="badge">
          LG
        </Badge>
      );
      const el = screen.getByTestId("badge");
      expect(el.style.height).toBe(`${componentTokens.badge.height.lg}px`);
      expect(el.style.padding).toBe(`0px ${componentTokens.badge.padding.lg}px`);
    });
  });

  describe("Typography", () => {
    it("uses xs font size", () => {
      render(<Badge data-testid="badge">Text</Badge>);
      expect(screen.getByTestId("badge").style.fontSize).toBe(primitiveFonts.size.xs);
    });

    it("uses semibold font weight", () => {
      render(<Badge data-testid="badge">Text</Badge>);
      expect(screen.getByTestId("badge").style.fontWeight).toBe(
        String(primitiveFonts.weight.semibold)
      );
    });
  });

  describe("Layout", () => {
    it("displays as inline-flex", () => {
      render(<Badge data-testid="badge">Text</Badge>);
      expect(screen.getByTestId("badge").style.display).toBe("inline-flex");
    });

    it("has full border radius", () => {
      render(<Badge data-testid="badge">Text</Badge>);
      // componentTokens.badge.radius is 9999 (number), jsdom renders as "9999px"
      expect(screen.getByTestId("badge").style.borderRadius).toBe(
        `${componentTokens.badge.radius}px`
      );
    });

    it("has nowrap white-space", () => {
      render(<Badge data-testid="badge">Text</Badge>);
      expect(screen.getByTestId("badge").style.whiteSpace).toBe("nowrap");
    });
  });

  describe("Simple text rendering", () => {
    it("wraps simple string children in Badge.Label", () => {
      render(<Badge data-testid="badge">Simple</Badge>);
      expect(screen.getByText("Simple")).toBeTruthy();
    });
  });

  describe("Compound: Badge.Icon", () => {
    it("renders icon with aria-hidden", () => {
      render(
        <Badge variant="success">
          <Badge.Icon>
            <span data-testid="icon">✓</span>
          </Badge.Icon>
          <Badge.Label>OK</Badge.Label>
        </Badge>
      );
      expect(screen.getByTestId("icon")).toBeTruthy();
      // Parent span should be aria-hidden
      const iconWrapper = screen.getByTestId("icon").parentElement;
      expect(iconWrapper?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("Compound: Badge.Label", () => {
    it("renders label text", () => {
      render(
        <Badge>
          <Badge.Label>Label Text</Badge.Label>
        </Badge>
      );
      expect(screen.getByText("Label Text")).toBeTruthy();
    });
  });

  describe("Compound: Badge.Dot", () => {
    it("renders a colored dot indicator", () => {
      const { container } = render(
        <Badge variant="danger">
          <Badge.Dot />
          <Badge.Label>Alert</Badge.Label>
        </Badge>
      );
      // Dot should be a span with border-radius 50%
      const dots = container.querySelectorAll("[aria-hidden='true']");
      const dotEl = Array.from(dots).find(
        (el) => (el as HTMLElement).style.borderRadius === "50%"
      );
      expect(dotEl).toBeTruthy();
    });
  });

  describe("DisplayName", () => {
    it("Badge has correct displayName", () => {
      expect(Badge.displayName).toBe("Badge");
    });
  });
});

describe("StatusBadge", () => {
  it("renders compliant status with success variant", () => {
    render(<StatusBadge status="compliant" data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.getAttribute("aria-label")).toBe("Compliant");
    expect(el.style.background).toBe(semanticColors.status.success.background);
  });

  it("renders overdue status with danger variant", () => {
    render(<StatusBadge status="overdue" data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.getAttribute("aria-label")).toBe("Overdue");
    expect(el.style.background).toBe(semanticColors.status.danger.background);
  });

  it("renders pending status with warning variant", () => {
    render(<StatusBadge status="pending" data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.getAttribute("aria-label")).toBe("Due Soon");
  });

  it("shows icon when showIcon is true (default)", () => {
    render(<StatusBadge status="compliant" data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.querySelector("svg")).toBeTruthy();
  });

  it("hides icon when showIcon is false", () => {
    render(<StatusBadge status="compliant" showIcon={false} data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.querySelector("svg")).toBeNull();
  });

  it("shows label when showLabel is true (default)", () => {
    render(<StatusBadge status="compliant" data-testid="sb" />);
    expect(screen.getByText("Compliant")).toBeTruthy();
  });

  it("hides label when showLabel is false", () => {
    render(<StatusBadge status="compliant" showLabel={false} data-testid="sb" />);
    expect(screen.queryByText("Compliant")).toBeNull();
  });

  it("falls back to neutral for unknown status", () => {
    render(<StatusBadge status={"unknown" as "neutral"} data-testid="sb" />);
    const el = screen.getByTestId("sb");
    expect(el.getAttribute("aria-label")).toBe("Neutral");
  });

  it("has correct displayName", () => {
    expect(StatusBadge.displayName).toBe("StatusBadge");
  });
});

describe("PriorityBadge", () => {
  it("renders high priority with danger variant", () => {
    render(<PriorityBadge priority="high" data-testid="pb" />);
    const el = screen.getByTestId("pb");
    expect(el.style.color).toBe(semanticColors.status.danger.foreground);
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("renders medium priority with warning variant", () => {
    render(<PriorityBadge priority="medium" data-testid="pb" />);
    expect(screen.getByText("Medium")).toBeTruthy();
    expect(screen.getByTestId("pb").style.color).toBe(
      semanticColors.status.warning.foreground
    );
  });

  it("renders low priority with neutral variant", () => {
    render(<PriorityBadge priority="low" data-testid="pb" />);
    expect(screen.getByText("Low")).toBeTruthy();
  });

  it("defaults to sm size", () => {
    render(<PriorityBadge priority="high" data-testid="pb" />);
    expect(screen.getByTestId("pb").style.height).toBe(
      `${componentTokens.badge.height.sm}px`
    );
  });

  it("has correct displayName", () => {
    expect(PriorityBadge.displayName).toBe("PriorityBadge");
  });
});

/**
 * P0-03: Button component tests
 *
 * Tests all variant × size combinations, loading state, disabled state,
 * compound children (Button.Icon, Button.Label), and fullWidth mode.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Button } from "../../src/components/Button";
import { semanticColors, primitiveFonts } from "../../src/tokens";

const variants = ["primary", "secondary", "ghost", "danger", "link"] as const;
const sizes = ["sm", "md", "lg"] as const;

describe("Button", () => {
  describe("Variant × Size matrix", () => {
    for (const variant of variants) {
      for (const size of sizes) {
        it(`renders ${variant}/${size} without error`, () => {
          render(
            <Button variant={variant} size={size} data-testid="btn">
              Click
            </Button>
          );
          const btn = screen.getByTestId("btn");
          expect(btn.tagName).toBe("BUTTON");
          expect(btn.className).toContain(`pp-button--${variant}`);
          expect(btn.className).toContain(`pp-button--${size}`);
        });
      }
    }
  });

  describe("Default props", () => {
    it("defaults to primary variant and md size", () => {
      render(<Button data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.className).toContain("pp-button--primary");
      expect(btn.className).toContain("pp-button--md");
    });

    it("renders as a <button> element", () => {
      render(<Button>Click</Button>);
      expect(screen.getByRole("button")).toBeTruthy();
    });
  });

  describe("Click handling", () => {
    it("fires onClick when clicked", () => {
      const handler = vi.fn();
      render(<Button onClick={handler}>Click</Button>);
      fireEvent.click(screen.getByRole("button"));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading state", () => {
    it("shows spinner and hides content when loading", () => {
      render(
        <Button loading data-testid="btn">
          Submit
        </Button>
      );
      const btn = screen.getByTestId("btn");
      expect(btn.getAttribute("data-loading")).toBe("true");
      // Button should be disabled when loading
      expect(btn).toBeDisabled();
      // Spinner SVG should be present
      expect(btn.querySelector("svg.button-spinner")).toBeTruthy();
      // Text content should not be rendered
      expect(btn.textContent).not.toContain("Submit");
    });

    it("sets opacity and pointer-events for loading", () => {
      render(<Button loading data-testid="btn">Submit</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.opacity).toBe("0.7");
      expect(btn.style.pointerEvents).toBe("none");
    });

    it("does not fire onClick when loading", () => {
      const handler = vi.fn();
      render(
        <Button loading onClick={handler}>
          Submit
        </Button>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Disabled state", () => {
    it("sets disabled attribute on button", () => {
      render(<Button disabled>Click</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("sets cursor to not-allowed", () => {
      render(<Button disabled data-testid="btn">Click</Button>);
      expect(screen.getByTestId("btn").style.cursor).toBe("not-allowed");
    });

    it("applies disabled colors", () => {
      render(<Button disabled data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.color).toBe(semanticColors.text.disabled);
    });

    it("does not fire onClick when disabled", () => {
      const handler = vi.fn();
      render(
        <Button disabled onClick={handler}>
          Click
        </Button>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Variant styling", () => {
    it("primary has interactive default background", () => {
      render(<Button variant="primary" data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.background).toBe(semanticColors.interactive.default);
      expect(btn.style.color).toBe(semanticColors.text.inverse);
    });

    it("secondary has transparent background with border", () => {
      render(<Button variant="secondary" data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.background).toBe("transparent");
      expect(btn.style.border).toContain("1px solid");
    });

    it("ghost has transparent background and no border", () => {
      render(<Button variant="ghost" data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.background).toBe("transparent");
      // jsdom may serialize "none" as empty string for border shorthand
      const border = btn.style.border;
      expect(border === "none" || border === "").toBe(true);
    });

    it("link variant has transparent background and link color", () => {
      render(<Button variant="link" data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.background).toBe("transparent");
      expect(btn.style.color).toBe(semanticColors.text.link);
    });

    it("danger variant shows danger status colors", () => {
      render(<Button variant="danger" data-testid="btn">Delete</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.color).toBe(semanticColors.status.danger.foreground);
    });
  });

  describe("fullWidth", () => {
    it("sets width to 100% when fullWidth", () => {
      render(<Button fullWidth data-testid="btn">Click</Button>);
      const btn = screen.getByTestId("btn");
      expect(btn.style.width).toBe("100%");
      expect(btn.className).toContain("pp-button--fullWidth");
    });

    it("defaults to auto width", () => {
      render(<Button data-testid="btn">Click</Button>);
      expect(screen.getByTestId("btn").style.width).toBe("auto");
    });
  });

  describe("Icons (simple mode)", () => {
    it("renders left icon", () => {
      const Icon = () => <span data-testid="left-icon">→</span>;
      render(
        <Button leftIcon={<Icon />} data-testid="btn">
          Next
        </Button>
      );
      expect(screen.getByTestId("left-icon")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
    });

    it("renders right icon", () => {
      const Icon = () => <span data-testid="right-icon">→</span>;
      render(
        <Button rightIcon={<Icon />} data-testid="btn">
          Next
        </Button>
      );
      expect(screen.getByTestId("right-icon")).toBeTruthy();
    });
  });

  describe("Compound children", () => {
    it("renders Button.Icon and Button.Label compounds", () => {
      render(
        <Button data-testid="btn">
          <Button.Icon>
            <span data-testid="compound-icon">★</span>
          </Button.Icon>
          <Button.Label>Star</Button.Label>
        </Button>
      );
      expect(screen.getByTestId("compound-icon")).toBeTruthy();
      expect(screen.getByText("Star")).toBeTruthy();
    });
  });

  describe("Typography", () => {
    it("uses medium font weight", () => {
      render(<Button data-testid="btn">Click</Button>);
      expect(screen.getByTestId("btn").style.fontWeight).toBe(
        String(primitiveFonts.weight.medium)
      );
    });

    it("uses sans font family", () => {
      render(<Button data-testid="btn">Click</Button>);
      expect(screen.getByTestId("btn").style.fontFamily).toBe(primitiveFonts.family.sans);
    });
  });

  describe("Transition", () => {
    it("has transition for background and color", () => {
      render(<Button data-testid="btn">Click</Button>);
      const transition = screen.getByTestId("btn").style.transition;
      expect(transition).toContain("background");
      expect(transition).toContain("color");
    });
  });

  describe("Style merging", () => {
    it("merges custom style prop", () => {
      render(
        <Button style={{ marginTop: 20 }} data-testid="btn">
          Click
        </Button>
      );
      expect(screen.getByTestId("btn").style.marginTop).toBe("20px");
    });
  });

  describe("DisplayName", () => {
    it("has correct displayName", () => {
      expect(Button.displayName).toBe("Button");
    });
  });
});

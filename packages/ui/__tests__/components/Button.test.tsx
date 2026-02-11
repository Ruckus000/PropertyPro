/**
 * P0-03: Button component tests
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Button } from "../../src/components/Button";

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
            </Button>,
          );

          const button = screen.getByTestId("btn");
          expect(button.tagName).toBe("BUTTON");
          expect(button.className).toContain(`pp-button--${variant}`);
          expect(button.className).toContain(`pp-button--${size}`);
        });
      }
    }
  });

  describe("Default props", () => {
    it("defaults to primary variant and md size", () => {
      render(<Button data-testid="btn">Click</Button>);
      const button = screen.getByTestId("btn");
      expect(button.className).toContain("pp-button--primary");
      expect(button.className).toContain("pp-button--md");
    });
  });

  describe("Click behavior", () => {
    it("fires onClick when clicked", () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click</Button>);
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not fire onClick when disabled", () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Click
        </Button>,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Loading state", () => {
    it("shows spinner, disables interaction, and hides content", () => {
      render(
        <Button loading data-testid="btn">
          Submit
        </Button>,
      );

      const button = screen.getByTestId("btn");
      expect(button).toBeDisabled();
      expect(button.getAttribute("data-loading")).toBe("true");
      expect(button.querySelector("svg.button-spinner")).toBeTruthy();
      expect(button.textContent).not.toContain("Submit");
      expect(button.className).toContain("opacity-70");
      expect(button.className).toContain("pointer-events-none");
    });
  });

  describe("Layout helpers", () => {
    it("supports fullWidth mode", () => {
      render(
        <Button fullWidth data-testid="btn">
          Expand
        </Button>,
      );
      const button = screen.getByTestId("btn");
      expect(button.className).toContain("pp-button--fullWidth");
      expect(button.className).toContain("w-full");
    });

    it("renders simple left/right icons", () => {
      const Left = () => <span data-testid="left-icon">L</span>;
      const Right = () => <span data-testid="right-icon">R</span>;

      render(
        <Button leftIcon={<Left />} rightIcon={<Right />}>
          Iconed
        </Button>,
      );

      expect(screen.getByTestId("left-icon")).toBeTruthy();
      expect(screen.getByTestId("right-icon")).toBeTruthy();
      expect(screen.getByText("Iconed")).toBeTruthy();
    });

    it("renders compound slots", () => {
      render(
        <Button data-testid="btn">
          <Button.Icon>
            <span data-testid="compound-icon">*</span>
          </Button.Icon>
          <Button.Label>Compound</Button.Label>
        </Button>,
      );

      expect(screen.getByTestId("compound-icon")).toBeTruthy();
      expect(screen.getByText("Compound")).toBeTruthy();
    });
  });

  describe("Dark mode classes", () => {
    it("primary includes explicit dark variant classes", () => {
      render(
        <Button variant="primary" data-testid="btn">
          Dark
        </Button>,
      );
      const className = screen.getByTestId("btn").className;
      expect(className).toContain("dark:bg-blue-500");
      expect(className).toContain("dark:hover:bg-blue-400");
    });

    it("secondary includes explicit dark variant classes", () => {
      render(
        <Button variant="secondary" data-testid="btn">
          Dark
        </Button>,
      );
      const className = screen.getByTestId("btn").className;
      expect(className).toContain("dark:border-gray-600");
      expect(className).toContain("dark:text-gray-100");
    });

    it("ghost includes explicit dark variant classes", () => {
      render(
        <Button variant="ghost" data-testid="btn">
          Dark
        </Button>,
      );
      expect(screen.getByTestId("btn").className).toContain("dark:text-gray-300");
    });

    it("danger includes explicit dark variant classes", () => {
      render(
        <Button variant="danger" data-testid="btn">
          Dark
        </Button>,
      );
      const className = screen.getByTestId("btn").className;
      expect(className).toContain("dark:bg-red-950");
      expect(className).toContain("dark:text-red-200");
    });

    it("link includes explicit dark variant classes", () => {
      render(
        <Button variant="link" data-testid="btn">
          Dark
        </Button>,
      );
      expect(screen.getByTestId("btn").className).toContain("dark:text-blue-300");
    });
  });

  it("has correct displayName", () => {
    expect(Button.displayName).toBe("Button");
  });
});

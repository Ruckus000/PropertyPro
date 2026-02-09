/**
 * P0-03: Card component tests
 *
 * Tests compound slots (Header, Body, Footer, Section, Title, Subtitle, Actions),
 * size variants, interactive/selected states, status border, and keyboard navigation.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Card } from "../../src/components/Card";
import { semanticColors, componentTokens, semanticElevation } from "../../src/tokens";

describe("Card", () => {
  describe("Default rendering", () => {
    it("renders a div with flex column", () => {
      render(<Card data-testid="card">content</Card>);
      const el = screen.getByTestId("card");
      expect(el.tagName).toBe("DIV");
      expect(el.style.display).toBe("flex");
      expect(el.style.flexDirection).toBe("column");
    });

    it("has default background surface color", () => {
      render(<Card data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.background).toBe(semanticColors.surface.default);
    });

    it("has border with subtle color by default", () => {
      render(<Card data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.border).toContain(semanticColors.border.subtle);
    });

    it("has e0 elevation (flat) by default", () => {
      render(<Card data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.boxShadow).toBe(semanticElevation.e0.shadow);
    });

    it("has md border radius from component tokens", () => {
      render(<Card data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.borderRadius).toBe(
        `${componentTokens.card.radius}px`
      );
    });

    it("has pp-card className", () => {
      render(<Card data-testid="card">content</Card>);
      expect(screen.getByTestId("card").className).toContain("pp-card");
    });
  });

  describe("Size variants", () => {
    const cardSizes = ["sm", "md", "lg"] as const;

    for (const size of cardSizes) {
      it(`renders ${size} size with correct padding for simple content`, () => {
        render(
          <Card size={size} data-testid="card">
            simple content
          </Card>
        );
        const el = screen.getByTestId("card");
        // jsdom adds "px" suffix to numeric padding values
        expect(el.style.padding).toBe(`${componentTokens.card.padding[size]}px`);
      });
    }
  });

  describe("noPadding", () => {
    it("removes padding when noPadding is true", () => {
      render(
        <Card noPadding data-testid="card">
          content
        </Card>
      );
      expect(screen.getByTestId("card").style.padding).toBe("0px");
    });
  });

  describe("Status border", () => {
    it("shows 3px left border with status foreground color for success", () => {
      render(<Card status="success" data-testid="card">content</Card>);
      const el = screen.getByTestId("card");
      expect(el.style.borderLeft).toContain("3px solid");
      expect(el.style.borderLeft).toContain(semanticColors.status.success.foreground);
    });

    it("shows 3px left border for danger status", () => {
      render(<Card status="danger" data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.borderLeft).toContain(
        semanticColors.status.danger.foreground
      );
    });
  });

  describe("Selected state", () => {
    it("uses interactive subtle background when selected", () => {
      render(<Card selected data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.background).toBe(
        semanticColors.interactive.subtle
      );
    });

    it("uses interactive default border when selected", () => {
      render(<Card selected data-testid="card">content</Card>);
      expect(screen.getByTestId("card").style.border).toContain(
        semanticColors.interactive.default
      );
    });
  });

  describe("Interactive state", () => {
    it("sets cursor to pointer when interactive and onClick provided", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      expect(screen.getByTestId("card").style.cursor).toBe("pointer");
    });

    it("fires onClick when clicked", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      fireEvent.click(screen.getByTestId("card"));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("has role=button and tabIndex=0 when interactive with onClick", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      const el = screen.getByTestId("card");
      expect(el.getAttribute("role")).toBe("button");
      expect(el.getAttribute("tabindex")).toBe("0");
    });

    it("responds to Enter key", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      fireEvent.keyDown(screen.getByTestId("card"), { key: "Enter" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("responds to Space key", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      fireEvent.keyDown(screen.getByTestId("card"), { key: " " });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("has pp-card--interactive className when interactive with onClick", () => {
      const handler = vi.fn();
      render(
        <Card interactive onClick={handler} data-testid="card">
          content
        </Card>
      );
      expect(screen.getByTestId("card").className).toContain("pp-card--interactive");
    });

    it("is NOT interactive without onClick", () => {
      render(
        <Card interactive data-testid="card">
          content
        </Card>
      );
      const el = screen.getByTestId("card");
      expect(el.getAttribute("role")).toBeNull();
      expect(el.style.cursor).toBe("");
    });
  });

  describe("Compound: Card.Header", () => {
    it("renders header content", () => {
      render(
        <Card>
          <Card.Header data-testid="header">
            <span>Title</span>
          </Card.Header>
        </Card>
      );
      expect(screen.getByTestId("header")).toBeTruthy();
      expect(screen.getByText("Title")).toBeTruthy();
    });

    it("renders bordered header with border-bottom", () => {
      render(
        <Card>
          <Card.Header bordered data-testid="header">
            Title
          </Card.Header>
        </Card>
      );
      expect(screen.getByTestId("header").style.borderBottom).toContain("1px solid");
    });
  });

  describe("Compound: Card.Title", () => {
    it("renders as h3", () => {
      render(
        <Card>
          <Card.Header>
            <Card.Title data-testid="title">My Title</Card.Title>
          </Card.Header>
        </Card>
      );
      expect(screen.getByTestId("title").tagName).toBe("H3");
    });
  });

  describe("Compound: Card.Subtitle", () => {
    it("renders as span with caption styling", () => {
      render(
        <Card>
          <Card.Header>
            <Card.Subtitle data-testid="subtitle">Sub</Card.Subtitle>
          </Card.Header>
        </Card>
      );
      expect(screen.getByTestId("subtitle").tagName).toBe("SPAN");
    });
  });

  describe("Compound: Card.Body", () => {
    it("renders with size-appropriate padding", () => {
      render(
        <Card size="lg">
          <Card.Body data-testid="body">Body content</Card.Body>
        </Card>
      );
      expect(screen.getByTestId("body").style.padding).toBe(
        `${componentTokens.card.padding.lg}px`
      );
    });
  });

  describe("Compound: Card.Footer", () => {
    it("renders footer content", () => {
      render(
        <Card>
          <Card.Footer data-testid="footer">
            <button>Save</button>
          </Card.Footer>
        </Card>
      );
      expect(screen.getByTestId("footer")).toBeTruthy();
      expect(screen.getByText("Save")).toBeTruthy();
    });

    it("renders bordered footer with border-top", () => {
      render(
        <Card>
          <Card.Footer bordered data-testid="footer">
            Footer
          </Card.Footer>
        </Card>
      );
      expect(screen.getByTestId("footer").style.borderTop).toContain("1px solid");
    });
  });

  describe("Compound: Card.Section", () => {
    it("renders section with border-top by default", () => {
      render(
        <Card>
          <Card.Section data-testid="section">Section content</Card.Section>
        </Card>
      );
      expect(screen.getByTestId("section").style.borderTop).toContain("1px solid");
    });

    it("section without border when bordered=false", () => {
      render(
        <Card>
          <Card.Section bordered={false} data-testid="section">
            Section content
          </Card.Section>
        </Card>
      );
      expect(screen.getByTestId("section").style.borderTop).toBe("");
    });
  });

  describe("Compound: Card.Actions", () => {
    it("renders action buttons in a row", () => {
      render(
        <Card>
          <Card.Header>
            <Card.Title>Title</Card.Title>
            <Card.Actions data-testid="actions">
              <button>Action</button>
            </Card.Actions>
          </Card.Header>
        </Card>
      );
      expect(screen.getByTestId("actions")).toBeTruthy();
    });
  });

  describe("Compound children detection", () => {
    it("strips padding when using compound children", () => {
      render(
        <Card data-testid="card">
          <Card.Header>Header</Card.Header>
          <Card.Body>Body</Card.Body>
        </Card>
      );
      expect(screen.getByTestId("card").style.padding).toBe("0px");
    });
  });

  describe("Transition", () => {
    it("has transition on box-shadow, border-color, background", () => {
      render(<Card data-testid="card">content</Card>);
      const transition = screen.getByTestId("card").style.transition;
      expect(transition).toContain("box-shadow");
      expect(transition).toContain("border-color");
      expect(transition).toContain("background");
    });
  });

  describe("DisplayName", () => {
    it("has correct displayName", () => {
      expect(Card.displayName).toBe("Card");
    });
  });
});

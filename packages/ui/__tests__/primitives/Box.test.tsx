/**
 * P0-02: Box primitive tests
 *
 * Tests polymorphic rendering, token-mapped spacing/background/border/radius/shadow props,
 * and correct CSS style output.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Box } from "../../src/primitives/Box";
import { semanticSpacing, semanticColors, primitiveRadius, primitiveShadow } from "../../src/tokens";

describe("Box", () => {
  describe("Polymorphic rendering", () => {
    it("renders a div by default", () => {
      render(<Box data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.tagName).toBe("DIV");
    });

    it('renders as="section" when specified', () => {
      render(<Box as="section" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.tagName).toBe("SECTION");
    });

    it('renders as="article" when specified', () => {
      render(<Box as="article" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").tagName).toBe("ARTICLE");
    });

    it('renders as="main" when specified', () => {
      render(<Box as="main" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").tagName).toBe("MAIN");
    });
  });

  describe("Spacing props → CSS", () => {
    it("applies uniform padding from token size", () => {
      render(<Box padding="md" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      const expected = `${semanticSpacing.inset.md}px`;
      expect(el.style.paddingTop).toBe(expected);
      expect(el.style.paddingRight).toBe(expected);
      expect(el.style.paddingBottom).toBe(expected);
      expect(el.style.paddingLeft).toBe(expected);
    });

    it("applies paddingX and paddingY independently", () => {
      render(<Box paddingX="lg" paddingY="sm" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.paddingLeft).toBe(`${semanticSpacing.inset.lg}px`);
      expect(el.style.paddingRight).toBe(`${semanticSpacing.inset.lg}px`);
      expect(el.style.paddingTop).toBe(`${semanticSpacing.inset.sm}px`);
      expect(el.style.paddingBottom).toBe(`${semanticSpacing.inset.sm}px`);
    });

    it("applies directional padding overriding shorthand", () => {
      render(<Box padding="sm" paddingTop="xl" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.paddingTop).toBe(`${semanticSpacing.inset.xl}px`);
      expect(el.style.paddingRight).toBe(`${semanticSpacing.inset.sm}px`);
    });

    it("applies numeric padding directly", () => {
      render(<Box padding={42} data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.paddingTop).toBe("42px");
    });

    it("applies margin from token size", () => {
      render(<Box margin="md" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      const expected = `${semanticSpacing.inset.md}px`;
      expect(el.style.marginTop).toBe(expected);
      expect(el.style.marginRight).toBe(expected);
    });
  });

  describe("Background", () => {
    it("resolves semantic surface background", () => {
      render(<Box background="page" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.background).toBe(semanticColors.surface.page);
    });

    it("passes through arbitrary color string", () => {
      render(<Box background="tomato" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.background).toBe("tomato");
    });
  });

  describe("Border", () => {
    it("applies default border when border={true}", () => {
      render(<Box border data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.border).toContain("1px solid");
      expect(el.style.border).toContain(semanticColors.border.default);
    });

    it("applies border with named color", () => {
      render(<Box border="strong" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.border).toContain(semanticColors.border.strong);
    });

    it("applies directional borders", () => {
      render(<Box borderBottom data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.borderBottom).toContain("1px solid");
    });
  });

  describe("Radius", () => {
    it("resolves token radius", () => {
      render(<Box radius="lg" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.borderRadius).toBe(`${primitiveRadius.lg}px`);
    });

    it("applies numeric radius directly", () => {
      render(<Box radius={99} data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.borderRadius).toBe("99px");
    });
  });

  describe("Shadow", () => {
    it("resolves token shadow", () => {
      render(<Box shadow="md" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.boxShadow).toBe(primitiveShadow.md);
    });
  });

  describe("Layout props", () => {
    it("applies display prop", () => {
      render(<Box display="flex" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.display).toBe("flex");
    });

    it("applies position prop", () => {
      render(<Box position="relative" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.position).toBe("relative");
    });

    it("applies overflow prop", () => {
      render(<Box overflow="hidden" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.overflow).toBe("hidden");
    });

    it("applies width and height", () => {
      render(<Box width={200} height="100%" data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.width).toBe("200px");
      expect(el.style.height).toBe("100%");
    });

    it("applies cursor prop", () => {
      render(<Box cursor="pointer" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.cursor).toBe("pointer");
    });
  });

  describe("Transition", () => {
    it("applies transition when transition={true}", () => {
      render(<Box transition data-testid="box">content</Box>);
      const el = screen.getByTestId("box");
      expect(el.style.transition).toContain("all");
      expect(el.style.transition).toContain("150ms");
    });

    it("applies custom transition string", () => {
      render(<Box transition="opacity 300ms ease" data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.transition).toBe("opacity 300ms ease");
    });
  });

  describe("Style merging", () => {
    it("merges custom style with computed styles", () => {
      render(
        <Box padding="sm" style={{ color: "red" }} data-testid="box">
          content
        </Box>
      );
      const el = screen.getByTestId("box");
      expect(el.style.color).toBe("red");
      expect(el.style.paddingTop).toBe(`${semanticSpacing.inset.sm}px`);
    });
  });

  describe("Box-sizing", () => {
    it("always sets box-sizing: border-box", () => {
      render(<Box data-testid="box">content</Box>);
      expect(screen.getByTestId("box").style.boxSizing).toBe("border-box");
    });
  });

  describe("Children", () => {
    it("renders children", () => {
      render(<Box>Hello World</Box>);
      expect(screen.getByText("Hello World")).toBeTruthy();
    });
  });
});

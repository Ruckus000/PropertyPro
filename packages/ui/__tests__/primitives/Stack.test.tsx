/**
 * P0-02: Stack primitive tests
 *
 * Tests flexbox layout, gap resolution, polymorphic rendering,
 * and convenience components (HStack, VStack, Center, Spacer).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Stack, HStack, VStack, Center, Spacer } from "../../src/primitives/Stack";
import { semanticSpacing } from "../../src/tokens";

describe("Stack", () => {
  describe("Default rendering", () => {
    it("renders a div with flex column by default", () => {
      render(<Stack data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.tagName).toBe("DIV");
      expect(el.style.display).toBe("flex");
      expect(el.style.flexDirection).toBe("column");
    });

    it("defaults to align=stretch and justify=flex-start", () => {
      render(<Stack data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.alignItems).toBe("stretch");
      expect(el.style.justifyContent).toBe("flex-start");
    });
  });

  describe("Polymorphic rendering", () => {
    it('renders as="nav" when specified', () => {
      render(<Stack as="nav" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").tagName).toBe("NAV");
    });

    it('renders as="ul" when specified', () => {
      render(<Stack as="ul" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").tagName).toBe("UL");
    });
  });

  describe("Direction", () => {
    it("applies row direction", () => {
      render(<Stack direction="row" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flexDirection).toBe("row");
    });

    it("applies row-reverse direction", () => {
      render(<Stack direction="row-reverse" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flexDirection).toBe("row-reverse");
    });
  });

  describe("Gap resolution", () => {
    it("resolves semantic gap token", () => {
      render(<Stack gap="md" data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.columnGap).toBe(`${semanticSpacing.stack.md}px`);
      expect(el.style.rowGap).toBe(`${semanticSpacing.stack.md}px`);
    });

    it("resolves numeric gap directly", () => {
      render(<Stack gap={24} data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.columnGap).toBe("24px");
      expect(el.style.rowGap).toBe("24px");
    });

    it("resolves gapX and gapY independently", () => {
      render(<Stack gapX="sm" gapY="lg" data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.columnGap).toBe(`${semanticSpacing.stack.sm}px`);
      expect(el.style.rowGap).toBe(`${semanticSpacing.stack.lg}px`);
    });

    it("gapX/gapY override gap", () => {
      render(<Stack gap="md" gapX="xs" data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.columnGap).toBe(`${semanticSpacing.stack.xs}px`);
      expect(el.style.rowGap).toBe(`${semanticSpacing.stack.md}px`);
    });
  });

  describe("Alignment and justification", () => {
    it("applies align=center", () => {
      render(<Stack align="center" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.alignItems).toBe("center");
    });

    it("applies justify=space-between", () => {
      render(<Stack justify="space-between" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.justifyContent).toBe("space-between");
    });
  });

  describe("Wrap", () => {
    it("wrap={true} sets flexWrap to wrap", () => {
      render(<Stack wrap data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flexWrap).toBe("wrap");
    });

    it("wrap={false} sets flexWrap to nowrap", () => {
      render(<Stack wrap={false} data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flexWrap).toBe("nowrap");
    });

    it('wrap="wrap-reverse" is applied directly', () => {
      render(<Stack wrap="wrap-reverse" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flexWrap).toBe("wrap-reverse");
    });
  });

  describe("Flex", () => {
    it("applies flex number", () => {
      render(<Stack flex={1} data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flex).toContain("1");
    });

    it("applies flex string", () => {
      render(<Stack flex="1 1 auto" data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.flex).toBe("1 1 auto");
    });
  });

  describe("Inline", () => {
    it("inline={true} sets display to inline-flex", () => {
      render(<Stack inline data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.display).toBe("inline-flex");
    });
  });

  describe("Padding", () => {
    it("applies semantic padding", () => {
      render(<Stack padding="md" data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.paddingTop).toBe(`${semanticSpacing.inset.md}px`);
      expect(el.style.paddingBottom).toBe(`${semanticSpacing.inset.md}px`);
      expect(el.style.paddingLeft).toBe(`${semanticSpacing.inset.md}px`);
      expect(el.style.paddingRight).toBe(`${semanticSpacing.inset.md}px`);
    });

    it("applies paddingX and paddingY", () => {
      render(<Stack paddingX="lg" paddingY="sm" data-testid="stack">content</Stack>);
      const el = screen.getByTestId("stack");
      expect(el.style.paddingLeft).toBe(`${semanticSpacing.inset.lg}px`);
      expect(el.style.paddingRight).toBe(`${semanticSpacing.inset.lg}px`);
      expect(el.style.paddingTop).toBe(`${semanticSpacing.inset.sm}px`);
      expect(el.style.paddingBottom).toBe(`${semanticSpacing.inset.sm}px`);
    });
  });

  describe("Box-sizing", () => {
    it("always sets box-sizing: border-box", () => {
      render(<Stack data-testid="stack">content</Stack>);
      expect(screen.getByTestId("stack").style.boxSizing).toBe("border-box");
    });
  });

  describe("Children", () => {
    it("renders children", () => {
      render(
        <Stack>
          <div>Item 1</div>
          <div>Item 2</div>
        </Stack>
      );
      expect(screen.getByText("Item 1")).toBeTruthy();
      expect(screen.getByText("Item 2")).toBeTruthy();
    });
  });
});

describe("HStack", () => {
  it("renders with direction=row", () => {
    render(<HStack data-testid="hstack">content</HStack>);
    expect(screen.getByTestId("hstack").style.flexDirection).toBe("row");
  });

  it("passes through other Stack props", () => {
    render(<HStack gap="md" align="center" data-testid="hstack">content</HStack>);
    const el = screen.getByTestId("hstack");
    expect(el.style.alignItems).toBe("center");
    expect(el.style.columnGap).toBe(`${semanticSpacing.stack.md}px`);
  });
});

describe("VStack", () => {
  it("renders with direction=column", () => {
    render(<VStack data-testid="vstack">content</VStack>);
    expect(screen.getByTestId("vstack").style.flexDirection).toBe("column");
  });
});

describe("Center", () => {
  it("renders with align=center and justify=center", () => {
    render(<Center data-testid="center">content</Center>);
    const el = screen.getByTestId("center");
    expect(el.style.alignItems).toBe("center");
    expect(el.style.justifyContent).toBe("center");
  });
});

describe("Spacer", () => {
  it("renders an aria-hidden div with flex: 1 by default", () => {
    const { container } = render(<Spacer />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    // jsdom normalizes flex: 1 to "1 1 0%"
    expect(el.style.flex).toContain("1");
  });

  it("accepts custom flex value", () => {
    const { container } = render(<Spacer flex={2} />);
    const el = container.firstChild as HTMLElement;
    // jsdom normalizes flex: 2 to "2 1 0%"
    expect(el.style.flex).toContain("2");
  });
});

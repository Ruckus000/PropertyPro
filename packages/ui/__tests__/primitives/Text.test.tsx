/**
 * P0-02: Text primitive tests
 *
 * Tests polymorphic rendering, typography variant resolution, color mapping,
 * truncation, legacy variants, and convenience components (Heading, Label, Caption, Code, Paragraph).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Text, Heading, Label, Caption, Code, Paragraph } from "../../src/primitives/Text";
import { semanticColors, semanticTypography, primitiveFonts } from "../../src/tokens";

describe("Text", () => {
  describe("Default rendering", () => {
    it("renders a <p> by default (body variant)", () => {
      render(<Text data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("P");
    });

    it("applies body normal typography styles", () => {
      render(<Text data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.fontFamily).toBe(semanticTypography.body.normal.fontFamily);
      expect(el.style.fontSize).toBe(semanticTypography.body.normal.fontSize);
    });

    it("defaults to primary text color", () => {
      render(<Text data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.color).toBe(semanticColors.text.primary);
    });

    it("sets margin: 0", () => {
      render(<Text data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.margin).toBe("0px");
    });
  });

  describe("Polymorphic rendering", () => {
    it('renders as="span" when specified', () => {
      render(<Text as="span" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("SPAN");
    });

    it('renders as="label" when specified', () => {
      render(<Text as="label" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("LABEL");
    });
  });

  describe("Variant → element mapping", () => {
    it("display variant renders as h1", () => {
      render(<Text variant="display" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("H1");
    });

    it("heading md renders as h3", () => {
      render(<Text variant="heading" size="md" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("H3");
    });

    it("heading lg renders as h2", () => {
      render(<Text variant="heading" size="lg" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("H2");
    });

    it("heading sm renders as h4", () => {
      render(<Text variant="heading" size="sm" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("H4");
    });

    it("caption variant renders as span", () => {
      render(<Text variant="caption" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("SPAN");
    });

    it("mono variant renders as code", () => {
      render(<Text variant="mono" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").tagName).toBe("CODE");
    });
  });

  describe("Variant → typography styles", () => {
    it("display applies correct typography", () => {
      render(<Text variant="display" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.fontWeight).toBe(String(primitiveFonts.weight.bold));
      expect(el.style.fontSize).toBe(semanticTypography.display.fontSize);
    });

    it("heading lg applies correct typography", () => {
      render(<Text variant="heading" size="lg" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.fontWeight).toBe(String(primitiveFonts.weight.semibold));
      expect(el.style.fontSize).toBe(semanticTypography.heading.lg.fontSize);
    });

    it("bodySmall applies correct typography", () => {
      render(<Text variant="bodySmall" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.fontSize).toBe(semanticTypography.bodySmall.normal.fontSize);
    });

    it("mono applies monospace font family", () => {
      render(<Text variant="mono" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.fontFamily).toBe(primitiveFonts.family.mono);
    });
  });

  describe("Color", () => {
    it("resolves semantic text color", () => {
      render(<Text color="secondary" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.color).toBe(semanticColors.text.secondary);
    });

    it("resolves brand text color", () => {
      render(<Text color="brand" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.color).toBe(semanticColors.text.brand);
    });

    it("passes through arbitrary color string", () => {
      render(<Text color="tomato" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.color).toBe("tomato");
    });
  });

  describe("Weight override", () => {
    it("overrides variant weight with explicit weight prop", () => {
      render(<Text variant="body" weight="bold" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.fontWeight).toBe(String(primitiveFonts.weight.bold));
    });
  });

  describe("Alignment, transform, decoration", () => {
    it("applies text alignment", () => {
      render(<Text align="center" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.textAlign).toBe("center");
    });

    it("applies text transform", () => {
      render(<Text transform="uppercase" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.textTransform).toBe("uppercase");
    });

    it("applies text decoration", () => {
      render(<Text decoration="underline" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.textDecoration).toBe("underline");
    });
  });

  describe("Truncation", () => {
    it("single-line truncation", () => {
      render(<Text truncate data-testid="text">Long text content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.overflow).toBe("hidden");
      expect(el.style.textOverflow).toBe("ellipsis");
      expect(el.style.whiteSpace).toBe("nowrap");
    });

    it("multi-line truncation with lines prop", () => {
      render(<Text truncate lines={3} data-testid="text">Long text content</Text>);
      const el = screen.getByTestId("text");
      expect(el.style.overflow).toBe("hidden");
      expect(el.style.textOverflow).toBe("ellipsis");
      expect(el.style.display).toBe("-webkit-box");
      expect(el.style.webkitLineClamp).toBe("3");
    });
  });

  describe("Legacy variant mapping", () => {
    it("heading1 maps to heading lg and renders as h2", () => {
      render(<Text variant="heading1" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("H2");
      expect(el.style.fontSize).toBe(semanticTypography.heading.lg.fontSize);
    });

    it("heading2 maps to heading md and renders as h3", () => {
      render(<Text variant="heading2" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("H3");
      expect(el.style.fontSize).toBe(semanticTypography.heading.md.fontSize);
    });

    it("heading3 maps to heading sm and renders as h4", () => {
      render(<Text variant="heading3" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("H4");
      expect(el.style.fontSize).toBe(semanticTypography.heading.sm.fontSize);
    });

    it("bodyMedium maps to body medium weight and renders as span", () => {
      render(<Text variant="bodyMedium" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("SPAN");
      expect(el.style.fontWeight).toBe(String(primitiveFonts.weight.medium));
    });

    it("bodySm maps to bodySmall and renders as p", () => {
      render(<Text variant="bodySm" data-testid="text">content</Text>);
      const el = screen.getByTestId("text");
      expect(el.tagName).toBe("P");
      expect(el.style.fontSize).toBe(semanticTypography.bodySmall.normal.fontSize);
    });
  });

  describe("WhiteSpace and wordBreak", () => {
    it("applies whiteSpace when not truncated", () => {
      render(<Text whiteSpace="pre-wrap" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.whiteSpace).toBe("pre-wrap");
    });

    it("applies wordBreak", () => {
      render(<Text wordBreak="break-all" data-testid="text">content</Text>);
      expect(screen.getByTestId("text").style.wordBreak).toBe("break-all");
    });
  });

  describe("Style merging", () => {
    it("merges custom style with computed styles", () => {
      render(
        <Text style={{ marginBottom: 10 }} data-testid="text">
          content
        </Text>
      );
      const el = screen.getByTestId("text");
      expect(el.style.marginBottom).toBe("10px");
      // Computed margin: 0 is overridden by style prop
    });
  });
});

describe("Heading", () => {
  it("level 1 renders as h1 with display variant", () => {
    render(<Heading level={1} data-testid="h">content</Heading>);
    const el = screen.getByTestId("h");
    expect(el.tagName).toBe("H1");
    expect(el.style.fontWeight).toBe(String(primitiveFonts.weight.bold));
  });

  it("level 2 renders as h2 with heading lg", () => {
    render(<Heading level={2} data-testid="h">content</Heading>);
    const el = screen.getByTestId("h");
    expect(el.tagName).toBe("H2");
    expect(el.style.fontSize).toBe(semanticTypography.heading.lg.fontSize);
  });

  it("level 3 renders as h3 with heading md", () => {
    render(<Heading level={3} data-testid="h">content</Heading>);
    expect(screen.getByTestId("h").tagName).toBe("H3");
  });

  it("level 4 renders as h4 with heading sm", () => {
    render(<Heading level={4} data-testid="h">content</Heading>);
    expect(screen.getByTestId("h").tagName).toBe("H4");
  });

  it("defaults to level 1", () => {
    render(<Heading data-testid="h">content</Heading>);
    expect(screen.getByTestId("h").tagName).toBe("H1");
  });
});

describe("Label", () => {
  it("renders as <label> element", () => {
    render(<Label data-testid="label">Name</Label>);
    expect(screen.getByTestId("label").tagName).toBe("LABEL");
  });

  it("uses bodySmall medium typography", () => {
    render(<Label data-testid="label">Name</Label>);
    const el = screen.getByTestId("label");
    expect(el.style.fontWeight).toBe(String(primitiveFonts.weight.medium));
    expect(el.style.fontSize).toBe(semanticTypography.bodySmall.medium.fontSize);
  });
});

describe("Caption", () => {
  it("renders as <span> with caption typography", () => {
    render(<Caption data-testid="cap">small text</Caption>);
    const el = screen.getByTestId("cap");
    expect(el.tagName).toBe("SPAN");
    expect(el.style.fontSize).toBe(semanticTypography.caption.fontSize);
  });

  it("defaults to tertiary color", () => {
    render(<Caption data-testid="cap">small text</Caption>);
    expect(screen.getByTestId("cap").style.color).toBe(semanticColors.text.tertiary);
  });
});

describe("Code", () => {
  it("renders as <code> with monospace font", () => {
    render(<Code data-testid="code">const x = 1</Code>);
    const el = screen.getByTestId("code");
    expect(el.tagName).toBe("CODE");
    expect(el.style.fontFamily).toBe(primitiveFonts.family.mono);
  });
});

describe("Paragraph", () => {
  it("renders as <p> with body typography", () => {
    render(<Paragraph data-testid="p">text</Paragraph>);
    const el = screen.getByTestId("p");
    expect(el.tagName).toBe("P");
    expect(el.style.fontSize).toBe(semanticTypography.body.normal.fontSize);
  });
});

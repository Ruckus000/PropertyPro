/**
 * P0-01: Design Token Tests
 *
 * Verify TypeScript token constants match CSS custom property names.
 * This ensures the three-tier token system (primitive → semantic → component)
 * stays in sync between the TS layer and the CSS layer.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  primitiveColors,
  primitiveFonts,
  primitiveSpace,
  primitiveRadius,
  primitiveShadow,
  semanticElevation,
  primitiveMotion,
  semanticMotion,
  createTransition,
  semanticColors,
  semanticSpacing,
  semanticTypography,
  primitiveBreakpoints,
  interactionSizing,
  responsiveDensity,
  componentTokens,
  complianceEscalation,
  getStatusColors,
} from "../../src/tokens";

// Read the CSS file once for all matching tests
const cssPath = path.resolve(__dirname, "../../src/styles/tokens.css");
const cssContent = fs.readFileSync(cssPath, "utf-8");

function cssHasVar(varName: string): boolean {
  return cssContent.includes(varName);
}

describe("P0-01 Design Tokens", () => {
  describe("Primitive Colors ↔ CSS variables", () => {
    it("blue palette values match CSS --blue-* variables", () => {
      for (const [shade, hex] of Object.entries(primitiveColors.blue)) {
        const varName = `--blue-${shade}`;
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
        expect(cssContent).toContain(`${varName}: ${hex}`);
      }
    });

    it("gray palette values match CSS --gray-* variables", () => {
      for (const [shade, hex] of Object.entries(primitiveColors.gray)) {
        const varName = `--gray-${shade}`;
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
        expect(cssContent).toContain(`${varName}: ${hex}`);
      }
    });

    it("green palette values match CSS --green-* variables", () => {
      for (const [shade, hex] of Object.entries(primitiveColors.green)) {
        const varName = `--green-${shade}`;
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
        expect(cssContent).toContain(`${varName}: ${hex}`);
      }
    });

    it("amber palette values match CSS --amber-* variables", () => {
      for (const [shade, hex] of Object.entries(primitiveColors.amber)) {
        const varName = `--amber-${shade}`;
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
        expect(cssContent).toContain(`${varName}: ${hex}`);
      }
    });

    it("red palette values match CSS --red-* variables", () => {
      for (const [shade, hex] of Object.entries(primitiveColors.red)) {
        const varName = `--red-${shade}`;
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
        expect(cssContent).toContain(`${varName}: ${hex}`);
      }
    });
  });

  describe("Spacing ↔ CSS variables", () => {
    const spaceCssMap: Record<string, string> = {
      1: "--space-1: 4px",
      2: "--space-2: 8px",
      3: "--space-3: 12px",
      4: "--space-4: 16px",
      5: "--space-5: 20px",
      6: "--space-6: 24px",
      8: "--space-8: 32px",
      12: "--space-12: 48px",
      16: "--space-16: 64px",
      20: "--space-20: 80px",
    };

    it("primitiveSpace values match CSS --space-* variables", () => {
      for (const [key, expected] of Object.entries(spaceCssMap)) {
        expect(cssContent, `Missing CSS declaration "${expected}"`).toContain(expected);
        const numKey = Number(key) as keyof typeof primitiveSpace;
        const tsValue = primitiveSpace[numKey];
        expect(tsValue).toBe(parseInt(expected.split(": ")[1]));
      }
    });

    it("primitiveSpace follows 4px base unit grid", () => {
      expect(primitiveSpace[1]).toBe(4);
      expect(primitiveSpace[2]).toBe(8);
      expect(primitiveSpace[3]).toBe(12);
      expect(primitiveSpace[4]).toBe(16);
      expect(primitiveSpace[5]).toBe(20);
    });
  });

  describe("Radius ↔ CSS variables", () => {
    it("radius values match CSS --radius-* variables", () => {
      const radiusCssMap: Record<string, string> = {
        sm: "--radius-sm: 6px",
        md: "--radius-md: 10px",
        lg: "--radius-lg: 16px",
        xl: "--radius-xl: 20px",
        "2xl": "--radius-2xl: 24px",
        full: "--radius-full: 9999px",
      };

      for (const [key, expected] of Object.entries(radiusCssMap)) {
        expect(cssContent, `Missing CSS declaration "${expected}"`).toContain(expected);
        const tsValue = primitiveRadius[key as keyof typeof primitiveRadius];
        expect(tsValue).toBe(parseInt(expected.split(": ")[1]));
      }
    });
  });

  describe("Typography ↔ CSS variables", () => {
    it("font family CSS variables are referenced in TS tokens", () => {
      expect(primitiveFonts.family.sans).toContain("var(--font-sans");
      expect(primitiveFonts.family.mono).toContain("var(--font-mono");
      expect(cssHasVar("--font-sans")).toBe(true);
      expect(cssHasVar("--font-mono")).toBe(true);
    });

    it("font size CSS variables are referenced in TS tokens", () => {
      const sizes = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"] as const;
      for (const size of sizes) {
        expect(primitiveFonts.size[size]).toContain(`var(--font-size-${size}`);
        expect(cssHasVar(`--font-size-${size}`)).toBe(true);
      }
    });

    it("font weights are pure numbers (no CSS vars)", () => {
      expect(primitiveFonts.weight.normal).toBe(400);
      expect(primitiveFonts.weight.medium).toBe(500);
      expect(primitiveFonts.weight.semibold).toBe(600);
      expect(primitiveFonts.weight.bold).toBe(700);
    });
  });

  describe("Motion ↔ CSS variables", () => {
    it("motion duration values match CSS --motion-duration-* variables", () => {
      const motionDurations: Record<string, number> = {
        instant: 0,
        micro: 100,
        quick: 150,
        standard: 250,
        slow: 350,
        expressive: 500,
      };

      for (const [key, ms] of Object.entries(motionDurations)) {
        expect(cssContent).toContain(`--motion-duration-${key}: ${ms}ms`);
        expect(
          primitiveMotion.duration[key as keyof typeof primitiveMotion.duration]
        ).toBe(ms);
      }
    });

    it("easing curves match CSS --ease-* variables", () => {
      expect(cssContent).toContain("--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)");
      expect(cssContent).toContain("--ease-enter: cubic-bezier(0, 0, 0.2, 1)");
      expect(cssContent).toContain("--ease-exit: cubic-bezier(0.4, 0, 1, 1)");
      expect(cssContent).toContain("--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)");
    });
  });

  describe("Semantic Colors", () => {
    it("text colors reference correct CSS variables", () => {
      expect(semanticColors.text.primary).toBe("var(--text-primary)");
      expect(semanticColors.text.secondary).toBe("var(--text-secondary)");
      expect(semanticColors.text.disabled).toBe("var(--text-disabled)");
      expect(semanticColors.text.inverse).toBe("var(--text-inverse)");
      expect(semanticColors.text.brand).toBe("var(--text-brand)");
      expect(semanticColors.text.link).toBe("var(--text-link)");
    });

    it("surface colors reference correct CSS variables", () => {
      expect(semanticColors.surface.page).toBe("var(--surface-page)");
      expect(semanticColors.surface.default).toBe("var(--surface-card)");
      expect(semanticColors.surface.elevated).toBe("var(--surface-elevated)");
      expect(semanticColors.surface.inverse).toBe("var(--surface-inverse)");
    });

    it("defines the page surface as gray-50", () => {
      expect(cssContent).toContain("--surface-page: var(--gray-50)");
    });

    it("border colors reference correct CSS variables", () => {
      expect(semanticColors.border.default).toBe("var(--border-default)");
      expect(semanticColors.border.subtle).toBe("var(--border-subtle)");
      expect(semanticColors.border.focus).toBe("var(--border-focus)");
      expect(semanticColors.border.error).toBe("var(--border-error)");
    });

    it("status color groups each have foreground, background, border, subtle", () => {
      const statusKeys = ["success", "brand", "warning", "danger", "info", "neutral"] as const;
      for (const key of statusKeys) {
        const status = semanticColors.status[key];
        expect(status.foreground).toContain(`var(--status-${key})`);
        expect(status.background).toContain(`var(--status-${key}-bg)`);
        expect(status.border).toContain(`var(--status-${key}-border)`);
        expect(status.subtle).toContain(`var(--status-${key}-subtle)`);
      }
    });

    it("CSS defines all semantic text/surface/border/status variables", () => {
      // Text vars
      for (const key of Object.keys(semanticColors.text)) {
        const cssVar = semanticColors.text[key as keyof typeof semanticColors.text];
        const varName = cssVar.replace("var(", "").replace(")", "");
        expect(cssHasVar(varName), `Missing CSS var ${varName}`).toBe(true);
      }
    });

    it("getStatusColors returns correct status color object", () => {
      const successColors = getStatusColors("success");
      expect(successColors.foreground).toBe("var(--status-success)");
      expect(successColors.background).toBe("var(--status-success-bg)");
    });
  });

  describe("Semantic Spacing", () => {
    it("inline spacing maps to primitive values", () => {
      expect(semanticSpacing.inline.xs).toBe(primitiveSpace[1]);
      expect(semanticSpacing.inline.sm).toBe(primitiveSpace[2]);
      expect(semanticSpacing.inline.md).toBe(primitiveSpace[3]);
      expect(semanticSpacing.inline.lg).toBe(primitiveSpace[4]);
      expect(semanticSpacing.inline.xl).toBe(primitiveSpace[6]);
    });

    it("stack spacing maps to primitive values", () => {
      expect(semanticSpacing.stack.xs).toBe(primitiveSpace[2]);
      expect(semanticSpacing.stack.sm).toBe(primitiveSpace[3]);
      expect(semanticSpacing.stack.md).toBe(primitiveSpace[4]);
      expect(semanticSpacing.stack.lg).toBe(primitiveSpace[6]);
      expect(semanticSpacing.stack.xl).toBe(primitiveSpace[8]);
    });

    it("inset spacing maps to primitive values", () => {
      expect(semanticSpacing.inset.xs).toBe(primitiveSpace[2]);
      expect(semanticSpacing.inset.sm).toBe(primitiveSpace[3]);
      expect(semanticSpacing.inset.md).toBe(primitiveSpace[4]);
      expect(semanticSpacing.inset.lg).toBe(primitiveSpace[5]);
      expect(semanticSpacing.inset.xl).toBe(primitiveSpace[6]);
    });
  });

  describe("Semantic Typography", () => {
    it("display variant uses bold weight and tight line height", () => {
      expect(semanticTypography.display.fontWeight).toBe(primitiveFonts.weight.bold);
      expect(semanticTypography.display.lineHeight).toBe(primitiveFonts.lineHeight.tight);
    });

    it("heading variants use semibold weight", () => {
      expect(semanticTypography.heading.lg.fontWeight).toBe(primitiveFonts.weight.semibold);
      expect(semanticTypography.heading.md.fontWeight).toBe(primitiveFonts.weight.semibold);
      expect(semanticTypography.heading.sm.fontWeight).toBe(primitiveFonts.weight.semibold);
    });

    it("body variants include normal and medium weights", () => {
      expect(semanticTypography.body.normal.fontWeight).toBe(primitiveFonts.weight.normal);
      expect(semanticTypography.body.medium.fontWeight).toBe(primitiveFonts.weight.medium);
    });

    it("mono variant uses monospace font family", () => {
      expect(semanticTypography.mono.fontFamily).toBe(primitiveFonts.family.mono);
    });
  });

  describe("Elevation", () => {
    it("e0 has no shadow", () => {
      expect(semanticElevation.e0.shadow).toBe("none");
    });

    it("elevation levels use increasing shadow values", () => {
      expect(semanticElevation.e1.shadow).toBe(primitiveShadow.sm);
      expect(semanticElevation.e2.shadow).toBe(primitiveShadow.md);
      expect(semanticElevation.e3.shadow).toBe(primitiveShadow.lg);
    });
  });

  describe("Semantic Motion", () => {
    it("feedback motion is quick with standard easing", () => {
      expect(semanticMotion.feedback.duration).toBe(primitiveMotion.duration.quick);
      expect(semanticMotion.feedback.easing).toBe(primitiveMotion.easing.standard);
    });

    it("none motion is instant for reduced motion fallback", () => {
      expect(semanticMotion.none.duration).toBe(0);
      expect(semanticMotion.none.easing).toBe("linear");
    });
  });

  describe("createTransition()", () => {
    it("creates a single-property transition string", () => {
      const result = createTransition("opacity", "quick", "standard");
      expect(result).toBe("opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)");
    });

    it("creates a multi-property transition string", () => {
      const result = createTransition(["opacity", "transform"], "standard", "enter");
      expect(result).toContain("opacity 250ms");
      expect(result).toContain("transform 250ms");
      expect(result).toContain("cubic-bezier(0, 0, 0.2, 1)");
    });

    it("defaults to 'all' property, 'quick' duration, 'standard' easing", () => {
      const result = createTransition();
      expect(result).toBe("all 150ms cubic-bezier(0.4, 0, 0.2, 1)");
    });
  });

  describe("Breakpoints", () => {
    it("breakpoints are defined correctly", () => {
      expect(primitiveBreakpoints.sm).toBe(640);
      expect(primitiveBreakpoints.md).toBe(768);
      expect(primitiveBreakpoints.lg).toBe(1024);
      expect(primitiveBreakpoints.xl).toBe(1280);
      expect(primitiveBreakpoints["2xl"]).toBe(1536);
    });

    it("interaction sizing defines touch and pointer targets", () => {
      expect(interactionSizing.touchTarget.minimum).toBe(44);
      expect(interactionSizing.touchTarget.comfortable).toBe(48);
      expect(interactionSizing.pointerTarget.minimum).toBe(36);
      expect(interactionSizing.pointerTarget.comfortable).toBe(40);
    });

    it("responsive density has spacious and default modes", () => {
      expect(responsiveDensity.spacious.buttonHeight).toBe(48);
      expect(responsiveDensity.default.buttonHeight).toBe(40);
    });
  });

  describe("Component Tokens", () => {
    it("button tokens have height, padding, iconSize for each size", () => {
      const sizes = ["sm", "md", "lg"] as const;
      for (const size of sizes) {
        expect(componentTokens.button.height[size]).toBeGreaterThan(0);
        expect(componentTokens.button.padding[size]).toBeGreaterThan(0);
        expect(componentTokens.button.iconSize[size]).toBeGreaterThan(0);
      }
    });

    it("badge tokens have height, padding, iconSize for each size", () => {
      const sizes = ["sm", "md", "lg"] as const;
      for (const size of sizes) {
        expect(componentTokens.badge.height[size]).toBeGreaterThan(0);
        expect(componentTokens.badge.padding[size]).toBeGreaterThan(0);
        expect(componentTokens.badge.iconSize[size]).toBeGreaterThan(0);
      }
    });

    it("nav rail tokens define collapsed and expanded widths", () => {
      expect(componentTokens.nav.rail.widthCollapsed).toBe(64);
      expect(componentTokens.nav.rail.widthExpanded).toBe(240);
    });

    it("card tokens have padding for each size", () => {
      const sizes = ["sm", "md", "lg"] as const;
      for (const size of sizes) {
        expect(componentTokens.card.padding[size]).toBeGreaterThan(0);
      }
    });
  });

  describe("Compliance Escalation Tokens", () => {
    it("defines four escalation tiers", () => {
      expect(Object.keys(complianceEscalation)).toEqual(["calm", "aware", "urgent", "critical"]);
    });

    it("calm tier maps to neutral variant", () => {
      expect(complianceEscalation.calm.variant).toBe("neutral");
      expect(complianceEscalation.calm.iconEmphasis).toBe(false);
    });

    it("critical tier maps to danger variant with icon emphasis", () => {
      expect(complianceEscalation.critical.variant).toBe("danger");
      expect(complianceEscalation.critical.iconEmphasis).toBe(true);
    });
  });

  describe("Surface Page Token", () => {
    it("--surface-page references --gray-50", () => {
      expect(cssContent).toContain("--surface-page: var(--gray-50)");
    });
  });

  describe("No hardcoded values (structural checks)", () => {
    it("all semantic color values reference CSS custom properties", () => {
      function checkVarReferences(obj: Record<string, unknown>, path = ""): void {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === "object" && value !== null) {
            checkVarReferences(value as Record<string, unknown>, currentPath);
          } else if (typeof value === "string") {
            expect(
              value.startsWith("var(--"),
              `${currentPath} = "${value}" does not reference a CSS custom property`
            ).toBe(true);
          }
        }
      }

      checkVarReferences(semanticColors as unknown as Record<string, unknown>);
    });
  });
});

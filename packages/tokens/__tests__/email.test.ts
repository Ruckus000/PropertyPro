import { describe, it, expect } from "vitest";
import { emailColors, primitiveColors } from "../src/email";

describe("emailColors", () => {
  it("textPrimary is gray-900", () => {
    expect(emailColors.textPrimary).toBe("#111827");
  });

  it("textSecondary is gray-600 (not gray-700)", () => {
    expect(emailColors.textSecondary).toBe("#4B5563");
  });

  it("surfacePage is gray-50 (not custom #F6F9FC)", () => {
    expect(emailColors.surfacePage).toBe("#F9FAFB");
  });

  it("interactivePrimary is coral-600 (Florida Modern rebrand)", () => {
    expect(emailColors.interactivePrimary).toBe("#C2533A");
  });

  it("all status groups have foreground/background/border/subtle", () => {
    const groups = ["success", "warning", "danger", "info", "neutral"] as const;
    for (const g of groups) {
      expect(emailColors[`${g}Foreground`]).toBeDefined();
      expect(emailColors[`${g}Background`]).toBeDefined();
      expect(emailColors[`${g}Border`]).toBeDefined();
      expect(emailColors[`${g}Subtle`]).toBeDefined();
    }
  });

  it("all values are hex strings", () => {
    for (const value of Object.values(emailColors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("primitiveColors re-export", () => {
  it("re-exports primitiveColors for one-off access", () => {
    expect(primitiveColors.red[600]).toBe("#DC2626");
    expect(primitiveColors.gray[800]).toBe("#1F2937");
    expect(primitiveColors.orange[600]).toBe("#EA580C");
  });
});

describe("emailTheme (Florida Modern v4)", () => {
  it("anchors surfaces on the sand ramp and brand on coral-600", async () => {
    const { emailTheme } = await import("../src/email");
    expect(emailTheme.canvas).toBe(primitiveColors.sand[100]);
    expect(emailTheme.card).toBe(primitiveColors.sand[0]);
    expect(emailTheme.border).toBe(primitiveColors.sand[200]);
    expect(emailTheme.coral).toBe("#C2533A");
    expect(emailTheme.link).toBe("#A8412C");
  });

  it("gives every semantic tone a full rule/text/bg/border/ink set of hex values", async () => {
    const { emailTheme } = await import("../src/email");
    for (const tone of ["amber", "red", "green", "teal", "violet", "neutral"] as const) {
      for (const key of ["rule", "text", "bg", "border", "ink"] as const) {
        expect(emailTheme[tone][key], `${tone}.${key}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});

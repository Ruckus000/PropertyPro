import { describe, it, expect } from "vitest";
import { primitiveColors } from "../src/email";

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

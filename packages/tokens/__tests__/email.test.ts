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

  it("interactivePrimary is blue-600", () => {
    expect(emailColors.interactivePrimary).toBe("#2563EB");
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

import { describe, it, expect } from "vitest";
import { staticTokens } from "../src/static";

describe("static tokens", () => {
  it("spacing follows the 4px grid", () => {
    expect(staticTokens.spacing["1"]).toBe("4px");
    expect(staticTokens.spacing["6"]).toBe("24px");
    expect(staticTokens.spacing["20"]).toBe("80px");
  });
  it("radius scale matches DESIGN.md", () => {
    expect(staticTokens.radius.xs).toBe("4px");
    expect(staticTokens.radius.sm).toBe("6px");
    expect(staticTokens.radius.md).toBe("8px");
    expect(staticTokens.radius.lg).toBe("12px");
    expect(staticTokens.radius.full).toBe("9999px");
  });
  it("touch sizing is 44px below md", () => {
    expect(staticTokens.sizing["button-height"]).toBe("44px");
    expect(staticTokens.sizing["input-height"]).toBe("44px");
    expect(staticTokens.sizing["pointer-target-min"]).toBe("32px");
  });
  it("desktop sizing is 32px", () => {
    expect(staticTokens.sizingDesktop["button-height"]).toBe("32px");
    expect(staticTokens.sizingDesktop["input-height"]).toBe("32px");
    expect(staticTokens.sizingDesktop["touch-target-min"]).toBe("32px");
  });
  it("font stacks lead with Geist", () => {
    expect(staticTokens.fontFamily.sans.startsWith('"Geist"')).toBe(true);
    expect(staticTokens.fontFamily.mono.startsWith('"Geist Mono"')).toBe(true);
  });
  it("focus ring references primitive vars, not raw hex", () => {
    expect(staticTokens.focus["focus-ring-color"]).toBe("var(--coral-500)");
    expect(staticTokens.focus["focus-ring-color-danger"]).toBe("var(--red-500)");
  });
  it("elevation ladder is E0-none through E3", () => {
    expect(staticTokens.elevation.e0).toBe("none");
    expect(staticTokens.elevation.e3).toContain("0 10px 15px");
  });
  it("nav tokens resolve only to semantic vars (no raw hex)", () => {
    for (const value of Object.values(staticTokens.nav)) {
      expect(value).toMatch(/^var\(--/);
    }
  });
});

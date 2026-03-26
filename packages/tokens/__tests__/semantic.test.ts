import { describe, it, expect } from "vitest";
import {
  tokenDefinitions,
  toHex,
  toCssValue,
  type PrimitiveRef,
  type ThemeRef,
  type TokenRef,
} from "../src/semantic";

describe("toHex", () => {
  it("resolves PrimitiveRef to hex", () => {
    const ref: PrimitiveRef = { kind: "primitive", scale: "blue", step: 600 };
    expect(toHex(ref)).toBe("#2563EB");
  });

  it("resolves ThemeRef to fallback hex", () => {
    const ref: ThemeRef = {
      kind: "theme",
      cssVar: "--theme-primary",
      fallback: { kind: "primitive", scale: "blue", step: 600 },
    };
    expect(toHex(ref)).toBe("#2563EB");
  });
});

describe("toCssValue", () => {
  it("resolves PrimitiveRef to var(--scale-step)", () => {
    const ref: PrimitiveRef = { kind: "primitive", scale: "gray", step: 900 };
    expect(toCssValue(ref)).toBe("var(--gray-900)");
  });

  it("resolves ThemeRef to var(--theme-x, var(--scale-step))", () => {
    const ref: ThemeRef = {
      kind: "theme",
      cssVar: "--theme-primary",
      fallback: { kind: "primitive", scale: "blue", step: 600 },
    };
    expect(toCssValue(ref)).toBe("var(--theme-primary, var(--blue-600))");
  });
});

describe("tokenDefinitions", () => {
  it("text.primary resolves to gray-900 hex", () => {
    expect(toHex(tokenDefinitions.text.primary)).toBe("#111827");
  });

  it("interactive.primary is theme-aware", () => {
    expect(tokenDefinitions.interactive.primary.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.interactive.primary)).toBe(
      "var(--theme-primary, var(--blue-600))"
    );
    expect(toHex(tokenDefinitions.interactive.primary)).toBe("#2563EB");
  });

  it("status.brand.foreground is theme-aware", () => {
    expect(tokenDefinitions.status.brand.foreground.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.status.brand.foreground)).toBe(
      "var(--theme-primary, var(--blue-600))"
    );
  });

  it("brandAccent is theme-aware", () => {
    expect(tokenDefinitions.brandAccent.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.brandAccent)).toBe(
      "var(--theme-accent, var(--blue-200))"
    );
  });

  it("all six status groups have foreground/background/border/subtle", () => {
    const variants = ["success", "brand", "warning", "danger", "info", "neutral"] as const;
    for (const v of variants) {
      const group = tokenDefinitions.status[v];
      expect(group.foreground).toBeDefined();
      expect(group.background).toBeDefined();
      expect(group.border).toBeDefined();
      expect(group.subtle).toBeDefined();
    }
  });
});

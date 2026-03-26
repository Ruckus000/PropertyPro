import { describe, it, expect } from "vitest";
import { tokenDefinitions, toCssValue, toHex, type TokenRef } from "../src/semantic";
import { primitiveColors } from "../src/primitives";
import { emailColors } from "../src/email";
import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve(__dirname, "../src/generated/tokens.css");
const cssContent = fs.readFileSync(cssPath, "utf-8");

/** Recursively collect all TokenRef values from a nested object */
function collectRefs(obj: Record<string, unknown>, refs: TokenRef[] = []): TokenRef[] {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && "kind" in value) {
      refs.push(value as TokenRef);
    } else if (value && typeof value === "object") {
      collectRefs(value as Record<string, unknown>, refs);
    }
  }
  return refs;
}

describe("Token parity", () => {
  it("generated CSS declares all primitive color vars", () => {
    for (const [scale, steps] of Object.entries(primitiveColors)) {
      for (const [step, hex] of Object.entries(steps)) {
        expect(cssContent).toContain(`--${scale}-${step}: ${hex}`);
      }
    }
  });

  it("generated CSS contains toCssValue() for every semantic token", () => {
    const refs = collectRefs(tokenDefinitions as unknown as Record<string, unknown>);
    for (const ref of refs) {
      const cssValue = toCssValue(ref);
      expect(cssContent, `Missing CSS value: ${cssValue}`).toContain(cssValue);
    }
  });

  it("emailColors values match toHex() for their corresponding tokens", () => {
    expect(emailColors.textPrimary).toBe(toHex(tokenDefinitions.text.primary));
    expect(emailColors.surfacePage).toBe(toHex(tokenDefinitions.surface.page));
    expect(emailColors.interactivePrimary).toBe(toHex(tokenDefinitions.interactive.primary));
    expect(emailColors.successForeground).toBe(toHex(tokenDefinitions.status.success.foreground));
    expect(emailColors.dangerForeground).toBe(toHex(tokenDefinitions.status.danger.foreground));
    expect(emailColors.warningBackground).toBe(toHex(tokenDefinitions.status.warning.background));
  });

  it("uses two-space indentation matching UI tokens.css format", () => {
    const lines = cssContent.split("\n").filter((l) => l.includes("--"));
    for (const line of lines) {
      expect(line).toMatch(/^  --/);
    }
  });

  it("generated CSS declares expected var names for non-trivial mappings", () => {
    expect(cssContent).toContain("--interactive-primary-hover:");
    expect(cssContent).toContain("--interactive-primary-active:");
    expect(cssContent).toContain("--interactive-subtle-hover:");
    expect(cssContent).toContain("--brand-accent:");
    expect(cssContent).toContain("--status-success:");
    expect(cssContent).toContain("--status-success-bg:");
    expect(cssContent).toContain("--status-brand:");
    expect(cssContent).toContain("--surface-card:");
    expect(cssContent).toContain("--surface-hover:");
  });
});

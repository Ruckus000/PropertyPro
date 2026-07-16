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

  it("emailColors mirror toHex() for tokens still shared with the app", () => {
    expect(emailColors.textPrimary).toBe(toHex(tokenDefinitions.text.primary));
    expect(emailColors.successForeground).toBe(toHex(tokenDefinitions.status.success.foreground));
    expect(emailColors.dangerForeground).toBe(toHex(tokenDefinitions.status.danger.foreground));
    expect(emailColors.warningBackground).toBe(toHex(tokenDefinitions.status.warning.background));
  });

  it("email brand/interactive/info stay on the cool blue ramp (decoupled from the app's coral/teal rebrand)", () => {
    // The app rebranded interactive.*/text.brand to "Florida Modern" coral and
    // status.info to teal for landing-consistency; transactional emails
    // deliberately stay on the prior blue, so these are pinned to `blue` and
    // must NOT follow the now-coral/teal app tokens.
    expect(emailColors.interactivePrimary).toBe(primitiveColors.blue[600]);
    expect(emailColors.interactivePrimaryHover).toBe(primitiveColors.blue[700]);
    expect(emailColors.textBrand).toBe(primitiveColors.blue[600]);
    expect(emailColors.textLink).toBe(primitiveColors.blue[600]);
    expect(emailColors.infoForeground).toBe(primitiveColors.blue[700]);
    // Explicitly diverged from the now-coral/teal app tokens:
    expect(emailColors.interactivePrimary).not.toBe(toHex(tokenDefinitions.interactive.primary));
    expect(emailColors.infoForeground).not.toBe(toHex(tokenDefinitions.status.info.foreground));
  });

  it("email surfaces/borders stay on the cool gray ramp (decoupled from the warmed app surface tokens)", () => {
    // The app's surface.*/border.* tokens warmed to the `sand` ramp for
    // landing-consistency; transactional emails deliberately stay neutral-cool,
    // so these are pinned to `gray` and must NOT follow surface.*/border.*.
    expect(emailColors.surfacePage).toBe(primitiveColors.gray[50]);
    expect(emailColors.surfaceCard).toBe(primitiveColors.gray[0]);
    expect(emailColors.surfaceMuted).toBe(primitiveColors.gray[100]);
    expect(emailColors.borderDefault).toBe(primitiveColors.gray[200]);
    expect(emailColors.borderStrong).toBe(primitiveColors.gray[300]);
    // Explicitly diverged from the now-warm app surface token:
    expect(emailColors.surfacePage).not.toBe(toHex(tokenDefinitions.surface.page));
  });

  it("uses two-space indentation matching UI tokens.css format", () => {
    // Scope to custom-property *declarations* only (lines that start with
    // `--`, ignoring leading whitespace) — not every line that merely
    // references a var(--x) in a property value. The generated file is now
    // the full tokens.css (colors + spacing/radius/typography/motion/sizing/
    // focus/elevation/nav + structural CSS), so nested rules (e.g. the
    // responsive-density media query) legitimately indent one level deeper
    // than top-level :root declarations — each nesting level still adds a
    // full two-space increment.
    const lines = cssContent.split("\n").filter((l) => l.trim().startsWith("--"));
    for (const line of lines) {
      expect(line).toMatch(/^( {2})+--/);
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

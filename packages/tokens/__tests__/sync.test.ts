import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateFullCSS } from "../scripts/build";

describe("tokens.css sync", () => {
  it("packages/ui/src/styles/tokens.css is exactly the generator output (no hand edits)", () => {
    const uiCss = fs.readFileSync(path.resolve(__dirname, "../../ui/src/styles/tokens.css"), "utf-8");
    expect(uiCss).toBe(generateFullCSS());
  });
  it("src/generated/tokens.css is exactly the generator output", () => {
    const genCss = fs.readFileSync(path.resolve(__dirname, "../src/generated/tokens.css"), "utf-8");
    expect(genCss).toBe(generateFullCSS());
  });
});

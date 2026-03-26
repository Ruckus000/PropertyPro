import { describe, it, expect } from "vitest";
import { primitiveColors } from "../src/primitives";

describe("primitiveColors", () => {
  it("exports all required color scales", () => {
    expect(Object.keys(primitiveColors)).toEqual(
      expect.arrayContaining(["blue", "gray", "green", "amber", "red", "orange"])
    );
  });

  it("blue scale has all 11 steps", () => {
    const steps = Object.keys(primitiveColors.blue).map(Number);
    expect(steps).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  });

  it("gray scale has all 13 steps", () => {
    const steps = Object.keys(primitiveColors.gray).map(Number);
    expect(steps).toEqual([0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  });

  it("all values are uppercase hex strings", () => {
    for (const scale of Object.values(primitiveColors)) {
      for (const hex of Object.values(scale)) {
        expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("matches current UI primitives exactly", () => {
    expect(primitiveColors.blue[600]).toBe("#2563EB");
    expect(primitiveColors.gray[900]).toBe("#111827");
    expect(primitiveColors.green[700]).toBe("#047857");
    expect(primitiveColors.amber[700]).toBe("#B45309");
    expect(primitiveColors.red[700]).toBe("#B91C1C");
  });

  it("includes new scales for email migration", () => {
    expect(primitiveColors.red[900]).toBe("#7F1D1D");
    expect(primitiveColors.orange[600]).toBe("#EA580C");
  });
});

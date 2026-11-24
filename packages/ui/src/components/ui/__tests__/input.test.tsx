// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "../input";
import { Textarea } from "../textarea";

describe("Input", () => {
  it("is 44px on touch, 32px on desktop, with the control border", () => {
    render(<Input aria-label="Name" />);
    const classes = screen.getByLabelText("Name").className.split(/\s+/);
    for (const cls of ["h-11", "md:h-8", "rounded-sm", "border-edge-control"]) {
      expect(classes).toContain(cls);
    }
  });
  it("is flat (no shadow)", () => {
    render(<Input aria-label="Name" />);
    expect(screen.getByLabelText("Name").className).not.toMatch(/\bshadow(-\w+)?\b/);
  });
});

describe("Textarea", () => {
  it("uses the control border and is flat", () => {
    render(<Textarea aria-label="Notes" />);
    const className = screen.getByLabelText("Notes").className;
    expect(className.split(/\s+/)).toContain("border-edge-control");
    expect(className.split(/\s+/)).toContain("rounded-sm");
    expect(className).not.toMatch(/\bshadow(-\w+)?\b/);
  });
});

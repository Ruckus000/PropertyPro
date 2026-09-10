// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../button";

describe("Button (lifted shadcn)", () => {
  it("renders a disabled spinner button while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: /save/i });
    expect(button).toBeDisabled();
    expect(button.getAttribute("data-loading")).toBe("true");
  });
  it("applies the outline variant classes", () => {
    render(<Button variant="outline">Open</Button>);
    expect(screen.getByRole("button").className).toContain("border-edge");
  });
});

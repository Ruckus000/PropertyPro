// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "../button";
import { cn } from "../../../utils/cn";

const classesOf = (value: string) => value.split(/\s+/);

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

  // 44px below md (touch floor), 32px-ish control scale from md up.
  it.each([
    ["sm", ["h-11", "md:h-7", "px-3", "text-xs"]],
    ["default", ["h-11", "md:h-8", "px-3"]],
    ["lg", ["h-11", "md:h-10", "px-4"]],
    ["icon", ["h-11", "w-11", "md:h-8", "md:w-8"]],
  ] as const)("size %s carries the 44/desktop scale", (size, expected) => {
    const classes = classesOf(buttonVariants({ size }));
    for (const cls of expected) expect(classes).toContain(cls);
  });

  it.each(["default", "outline", "secondary", "destructive"] as const)(
    "variant %s is flat (no shadow)",
    (variant) => {
      expect(buttonVariants({ variant })).not.toMatch(/\bshadow(-\w+)?\b/);
    },
  );

  it("an explicit caller height with an md: twin wins the merge at every width", () => {
    const merged = cn(buttonVariants(), "h-9 md:h-9");
    const classes = classesOf(merged);
    expect(classes).toContain("md:h-9");
    expect(classes).not.toContain("md:h-8");
  });
});

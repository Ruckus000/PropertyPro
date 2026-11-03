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

  // twMerge only drops a conflicting class in the SAME variant. The primitive's
  // desktop height is `md:h-7` / `md:h-8`, so an unprefixed `h-auto` replaces
  // `h-11` and leaves the `md:` one standing: the button snaps back to a fixed
  // 28px/32px from md up and clips whatever the caller wanted auto-sized.
  it("an unprefixed h-auto leaves the primitive's md: height standing", () => {
    const classes = classesOf(cn(buttonVariants({ size: "sm" }), "h-auto"));
    expect(classes).toContain("h-auto");
    expect(classes).toContain("md:h-7");
  });

  it("h-auto with a matching md:h-auto wins the merge at every width", () => {
    const classes = classesOf(cn(buttonVariants({ size: "sm" }), "h-auto md:h-auto"));
    expect(classes).toContain("md:h-auto");
    expect(classes).not.toContain("md:h-7");
  });

  it("w-auto on an icon button needs md:w-auto for the same reason", () => {
    const classes = classesOf(
      cn(buttonVariants({ size: "icon" }), "h-auto w-auto md:h-auto md:w-auto"),
    );
    expect(classes).toContain("md:h-auto");
    expect(classes).toContain("md:w-auto");
    expect(classes).not.toContain("md:h-8");
    expect(classes).not.toContain("md:w-8");
  });
});

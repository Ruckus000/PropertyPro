import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "../../utils/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-quick focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-interactive text-content-inverse shadow hover:bg-interactive-hover",
        destructive:
          "bg-status-danger text-content-inverse shadow-sm hover:bg-[var(--red-900)]",
        outline:
          "border border-edge bg-surface-card shadow-sm hover:bg-surface-hover hover:text-content",
        secondary:
          "bg-surface-muted text-content shadow-sm hover:bg-surface-hover",
        ghost: "hover:bg-surface-hover hover:text-content",
        link: "text-interactive underline-offset-4 hover:underline",
      },
      // 44px below `lg`, the variant height at and above it. `DESIGN.md:207`
      // has always asked for a 44px touch target on touch viewports; until
      // 2026-09-17 no variant reached it and ~32 call sites hand-rolled the
      // step themselves. The rule now lives here instead.
      //
      // The breakpoint is `lg` (1024px), NOT the 768px the rule used to state.
      // At 768-1024 the device is still a tablet and still touch, and
      // `DESIGN.md:8` calls the board-member persona tablet-first *with larger
      // targets* — so stepping down at 768 handed exactly that persona the
      // smaller control. It also matches `layout/app-top-bar.tsx`, which
      // already shipped `size-11 ... lg:size-9`.
      //
      // Every variant clamps to the same 44px below `lg`, so `sm`/`default`/
      // `lg` are indistinguishable on a phone. That is what a minimum does to
      // values of 32/36/40; the variants keep their meaning above the
      // breakpoint. This is NOT an accessibility fix — WCAG 2.2 SC 2.5.8 (AA)
      // asks for 24x24 and the whole app already measured clean against it
      // (2,612 targets, zero failures). It is a deliberate product decision
      // about touch comfort.
      size: {
        default: "h-11 px-4 py-2 lg:h-9",
        sm: "h-11 rounded-md px-3 text-xs lg:h-8",
        lg: "h-11 rounded-md px-8 lg:h-10",
        icon: "size-11 lg:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Shows a spinner and disables the button while a submit/action is
   * in-flight. Under `asChild`, the spinner is skipped (Slot requires
   * exactly one child) but `disabled`/`data-loading` are still applied
   * to the wrapped element.
   */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        data-loading={loading ? "true" : "false"}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

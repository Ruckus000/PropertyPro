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
          "bg-interactive text-content-inverse hover:bg-interactive-hover",
        destructive:
          "bg-status-danger text-content-inverse hover:bg-[var(--red-900)]",
        outline:
          "border border-edge bg-surface-card hover:bg-surface-hover hover:text-content",
        secondary:
          "bg-surface-muted text-content hover:bg-surface-hover",
        ghost: "hover:bg-surface-hover hover:text-content",
        link: "text-interactive underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 md:h-8 px-3",
        sm: "h-11 md:h-7 px-3 text-xs",
        lg: "h-11 md:h-10 px-4",
        icon: "h-11 w-11 md:h-8 md:w-8",
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

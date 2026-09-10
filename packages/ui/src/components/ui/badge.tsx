import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../utils/cn"

const shadcnBadgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-quick",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-interactive text-content-inverse shadow hover:bg-interactive-hover",
        secondary:
          "border-transparent bg-surface-muted text-content hover:bg-surface-hover",
        destructive:
          "border-transparent bg-status-danger text-content-inverse shadow hover:bg-[var(--red-900)]",
        outline: "text-content",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface ShadcnBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof shadcnBadgeVariants> {}

function ShadcnBadge({ className, variant, ...props }: ShadcnBadgeProps) {
  return (
    <div className={cn(shadcnBadgeVariants({ variant }), className)} {...props} />
  )
}

export { ShadcnBadge, shadcnBadgeVariants }

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-quick focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-interactive text-content-inverse shadow hover:bg-interactive/80",
        secondary:
          "border-transparent bg-surface-muted text-content hover:bg-surface-muted/80",
        destructive:
          "border-transparent bg-status-danger text-content-inverse shadow hover:bg-status-danger/80",
        outline: "text-content",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

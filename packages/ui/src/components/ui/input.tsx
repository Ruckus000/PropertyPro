import * as React from "react"

import { cn } from "../../utils/cn"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 md:h-8 w-full rounded-sm border border-edge-strong bg-transparent px-3 py-1 text-base transition-colors duration-quick file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

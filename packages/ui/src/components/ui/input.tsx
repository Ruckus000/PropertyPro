import * as React from "react"

import { cn } from "../../utils/cn"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      // `h-11 ... lg:h-9`: 44px on touch viewports, 36px from 1024 up. See the
      // comment on `buttonVariants`' size scale for why the breakpoint is `lg`
      // and not the 768px the rule used to state.
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-edge bg-transparent px-3 py-1 text-base shadow-sm transition-colors duration-quick file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 md:text-sm lg:h-9",
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

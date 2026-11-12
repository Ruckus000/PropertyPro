"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-interactive shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-interactive data-[state=checked]:text-content-inverse data-[state=indeterminate]:bg-interactive data-[state=indeterminate]:text-content-inverse",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("group grid place-content-center text-current")}
    >
      {/* "Some selected" draws a dash, not a tick that reads as "all". */}
      <Check className="h-4 w-4 group-data-[state=indeterminate]:hidden" />
      <Minus className="hidden h-4 w-4 group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }

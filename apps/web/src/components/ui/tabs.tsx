"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // `flex-wrap`, and `h-auto min-h-9` so a second row is not clipped by the
      // fixed height. TabsTrigger is `whitespace-nowrap`, so without this the
      // strip simply runs off the side with no scrollbar and no way to reach
      // the tabs past the edge. Measured at 375px in a 327px content column:
      // /pm/reports 569px, /communities/[id]/payments 423px,
      // /communities/[id]/meetings and /esign the same shape — four of the
      // eleven routes that bleed, all from this one component.
      //
      // Wrapping rather than `overflow-x-auto`: a scroller needs its own tab
      // stop to satisfy WCAG 2.1.1, wrapping needs nothing, and at any width
      // where the tabs already fit `flex-wrap` is a no-op — so this cannot
      // change a desktop layout. Same call as `QuickFilterTabs`, so the
      // codebase has one answer to this rather than two.
      "inline-flex h-auto min-h-9 flex-wrap items-center justify-center rounded-lg bg-surface-muted p-1 text-content-secondary",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  // `min-h-11 ... lg:min-h-0` — a minimum, not a height. The trigger has never
  // carried a height: its 31.6px came from `px-3 py-1` plus an 18px-root line
  // box, and giving it a fixed one would grow every tab strip at desktop too.
  // A minimum adds the touch floor below `lg` and hands sizing back to
  // `TabsList` above it, which is upstream shadcn's composition.
  //
  // Deliberately NOT mirrored onto `TabsList`: that element is `p-1`, so a 44px
  // trigger already makes it 52px and a `min-h-11` there could never bind. It
  // would read as the rule being applied twice while doing nothing.
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-surface-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-card data-[state=active]:text-content data-[state=active]:shadow lg:min-h-0",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

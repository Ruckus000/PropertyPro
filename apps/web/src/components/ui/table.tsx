import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The wrapper scrolls horizontally when the table is wider than its box. A
 * scrollable region that cannot be focused cannot be scrolled without a
 * pointer (WCAG 2.1.1), and whatever it hides is simply unreachable — measured
 * on the Documents screen at 375px: a 401px table in a 274px box, `tabIndex`
 * -1, two of five columns gone.
 *
 * The tab stop is CONDITIONAL. Most tables in the app fit; giving every one of
 * them a focus stop would trade an access failure for a nuisance for the same
 * keyboard users. It is also re-measured on every render rather than only on
 * mount, because a table is typically empty on first paint and filled when its
 * query resolves — a mount-only check decides "fits" before there is anything
 * to overflow. `setState` with an unchanged value is a no-op, so this settles.
 *
 * Deliberately NO `role="region"`: that would need an accessible name this
 * component cannot know, and an unnamed region is worse than none.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = React.useState(false)

  const measure = React.useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    setScrollable(el.scrollWidth > el.clientWidth)
  }, [])

  // No dependency array: re-measure after every render, so late-arriving rows
  // are accounted for.
  React.useEffect(measure)

  React.useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  return (
    <div
      ref={wrapperRef}
      className="relative w-full overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      {...(scrollable ? { tabIndex: 0 } : {})}
    >
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("[&_tr]:border-b [&_tr]:border-edge", className)}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-surface-subtle font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-edge-subtle transition-colors duration-quick hover:bg-surface-hover data-[state=selected]:bg-surface-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-left align-middle font-medium text-content-secondary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-3 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-content-secondary", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

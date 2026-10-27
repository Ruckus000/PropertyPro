"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "../../utils/cn"
import { useIsDesktop } from "../../hooks/use-media-query"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// ── Size scale (design.md: modal widths sm 400 / md 560 / lg 720 / xl 960) ──
// `sm:max-w-*` so the mobile treatment (near-fullscreen inset) governs below the
// `sm` breakpoint; the variant caps width on larger screens.
const dialogContentVariants = cva(
  cn(
    // Position — center-anchored via translate.
    "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%]",
    // Mobile: near-fullscreen with a small inset; content scrolls, never overflows.
    "w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg",
    // Desktop: centered card capped at 85% viewport height.
    "sm:max-h-[85dvh]",
    // Chrome.
    "gap-4 border border-edge bg-surface-card p-6 shadow-e3 duration-200",
    // Animations.
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
  ),
  {
    variants: {
      size: {
        sm: "sm:max-w-[400px]",
        md: "sm:max-w-[560px]",
        lg: "sm:max-w-[720px]",
        xl: "sm:max-w-[960px]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

// Total horizontal/vertical margin (2rem) the modal keeps from the viewport
// edge — mirrors the `calc(100vw-2rem)` / `calc(100dvh-2rem)` classes above.
const VIEWPORT_MARGIN = 32
const KEYBOARD_STEP = 24
const KEYBOARD_STEP_LARGE = 96

type ResizeAxis = "x" | "y" | "both"

interface ComputeResizeInput {
  startWidth: number
  startHeight: number
  dx: number
  dy: number
  axis: ResizeAxis
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Center-anchored resize math. Radix centers the modal via
 * `translate(-50%, -50%)`, so moving an edge by `dx` requires the box to grow by
 * `2 * dx` to keep the dragged handle under the cursor. Exported for unit tests.
 */
export function computeResize({
  startWidth,
  startHeight,
  dx,
  dy,
  axis,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
}: ComputeResizeInput): { width: number; height: number } {
  const width =
    axis === "y" ? startWidth : clamp(startWidth + 2 * dx, minWidth, maxWidth)
  const height =
    axis === "x" ? startHeight : clamp(startHeight + 2 * dy, minHeight, maxHeight)
  return { width, height }
}

function useMergedRef<T>(...refs: Array<React.Ref<T> | undefined>) {
  return React.useCallback((node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") {
        ref(node)
      } else {
        ;(ref as React.MutableRefObject<T | null>).current = node
      }
    }
    // Deps are intentionally the spread `refs` array itself, not its
    // elements — this is the merge-ref pattern, not a stale-closure bug.
    // `react-hooks/exhaustive-deps` is not registered in this package's
    // ESLint config (see packages/ui/eslint.config.mjs), so there is
    // nothing here to suppress; if that rule is ever enabled for
    // packages/ui, it would flag this line and the array should stay as-is.
  }, refs)
}

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  /** Enable grab-and-drag resizing (desktop only). Off for small confirmations. */
  resizable?: boolean
  /** Minimum width in px when resizing. */
  minWidth?: number
  /** Minimum height in px when resizing. */
  minHeight?: number
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size,
      resizable = false,
      minWidth = 360,
      minHeight = 240,
      style,
      ...props
    },
    ref
  ) => {
    const isDesktop = useIsDesktop()
    const enableResize = resizable && isDesktop

    // Ephemeral size — Radix unmounts Content when the dialog closes, so this
    // resets to the default on every reopen (no persistence, by design).
    const [dims, setDims] = React.useState<{ width: number; height: number } | null>(
      null
    )
    const contentRef = React.useRef<HTMLDivElement | null>(null)
    const mergedRef = useMergedRef<HTMLDivElement>(ref, contentRef)
    const dragState = React.useRef<{
      startX: number
      startY: number
      startWidth: number
      startHeight: number
      axis: ResizeAxis
      dir: 1 | -1
    } | null>(null)

    const applyResize = React.useCallback(
      (dx: number, dy: number, axis: ResizeAxis, startWidth: number, startHeight: number) => {
        const next = computeResize({
          startWidth,
          startHeight,
          dx,
          dy,
          axis,
          minWidth,
          minHeight,
          maxWidth: window.innerWidth - VIEWPORT_MARGIN,
          maxHeight: window.innerHeight - VIEWPORT_MARGIN,
        })
        setDims(next)
      },
      [minWidth, minHeight]
    )

    // `dir` is -1 for the left and top edges: dragging them outward is a
    // negative delta, and the box is centred, so it grows the same either way.
    const handlePointerDown = (axis: ResizeAxis, dir: 1 | -1 = 1) => (event: React.PointerEvent) => {
      if (!enableResize) return
      const rect = contentRef.current?.getBoundingClientRect()
      if (!rect) return
      event.preventDefault()
      dragState.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        axis,
        dir,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag) return
      applyResize(
        (event.clientX - drag.startX) * drag.dir,
        (event.clientY - drag.startY) * drag.dir,
        drag.axis,
        drag.startWidth,
        drag.startHeight
      )
    }

    const handlePointerUp = (event: React.PointerEvent) => {
      if (!dragState.current) return
      dragState.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    const handleKeyDown = (axis: ResizeAxis) => (event: React.KeyboardEvent) => {
      if (!enableResize) return
      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
      let dx = 0
      let dy = 0
      switch (event.key) {
        case "ArrowRight":
          dx = step
          break
        case "ArrowLeft":
          dx = -step
          break
        case "ArrowDown":
          dy = step
          break
        case "ArrowUp":
          dy = -step
          break
        default:
          return
      }
      const rect = contentRef.current?.getBoundingClientRect()
      if (!rect) return
      event.preventDefault()
      applyResize(dx, dy, axis, rect.width, rect.height)
    }

    const resizeStyle: React.CSSProperties | undefined =
      enableResize && dims
        ? {
            width: dims.width,
            height: dims.height,
            maxWidth: `min(${dims.width}px, calc(100vw - 2rem))`,
            maxHeight: `min(${dims.height}px, calc(100dvh - 2rem))`,
          }
        : undefined

    const commonHandleClasses =
      "absolute z-10 hidden touch-none select-none text-content-tertiary transition-colors hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-surface-card focus-visible:ring-offset-2 md:block"
    // An inset ring: an outside one is clipped by a dialog that scrolls.
    const edgeClasses = "focus-visible:ring-inset focus-visible:ring-offset-0"

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={mergedRef}
          className={cn(dialogContentVariants({ size }), className)}
          style={resizeStyle ? { ...style, ...resizeStyle } : style}
          {...props}
        >
          {children}
          {/* Hit area: 44px below md, 36px at md+ (touch-target rule). Anchored at the
              icon's centre (24px in from top/right) and shifted back by half its own
              size, so the visible X stays put whichever size applies. */}
          <DialogPrimitive.Close className="absolute right-6 top-6 inline-flex h-11 w-11 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-md opacity-70 ring-offset-surface-card md:h-9 md:w-9 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-hover data-[state=open]:text-content-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {enableResize && (
            <>
              {/* Each edge is resizable along its whole length, and a strip never
                  takes more than 4px inside the border, so it stays off a scrollbar
                  running down that edge. A dialog that clips (the default
                  `overflow-y-auto`) gets a 4px strip inside the border: a strip
                  poking out would add scroll overflow. One that sets
                  `overflow-visible` (the help modal) gets 8px straddling it.
                  Right and bottom take keyboard focus; left and top are
                  pointer-only, since the box is centred and the keyboard pair
                  already reaches every size.
                  ponytail: the strips are children of the dialog, so in a dialog
                  whose own content scrolls they scroll with it and the right one
                  sits inside its scrollbar. Trigger: a scrolling resizable dialog
                  that cannot be resized from an edge; move its scroll to an inner
                  body and set `overflow-visible`, as the help modal does. */}
              <div
                role="separator"
                aria-label="Resize dialog width"
                aria-orientation="vertical"
                tabIndex={0}
                onPointerDown={handlePointerDown("x")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onKeyDown={handleKeyDown("x")}
                className={cn(commonHandleClasses, edgeClasses, "right-0 inset-y-0 w-1 cursor-ew-resize [.overflow-visible>&]:-right-1 [.overflow-visible>&]:w-2")}
              />
              <div
                role="separator"
                aria-label="Resize dialog height"
                aria-orientation="horizontal"
                tabIndex={0}
                onPointerDown={handlePointerDown("y")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onKeyDown={handleKeyDown("y")}
                className={cn(commonHandleClasses, edgeClasses, "bottom-0 inset-x-0 h-1 cursor-ns-resize [.overflow-visible>&]:-bottom-1 [.overflow-visible>&]:h-2")}
              />
              <div
                aria-hidden="true"
                data-resize-edge="left"
                onPointerDown={handlePointerDown("x", -1)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={cn(commonHandleClasses, edgeClasses, "left-0 inset-y-0 w-1 cursor-ew-resize [.overflow-visible>&]:-left-1 [.overflow-visible>&]:w-2")}
              />
              <div
                aria-hidden="true"
                data-resize-edge="top"
                onPointerDown={handlePointerDown("y", -1)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={cn(commonHandleClasses, edgeClasses, "top-0 inset-x-0 h-1 cursor-ns-resize [.overflow-visible>&]:-top-1 [.overflow-visible>&]:h-2")}
              />
              {/* Bottom-right corner — both. Last, so it wins where the edges meet. */}
              <div
                role="separator"
                aria-label="Resize dialog"
                tabIndex={0}
                onPointerDown={handlePointerDown("both")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onKeyDown={handleKeyDown("both")}
                className={cn(
                  commonHandleClasses,
                  "bottom-1 right-1 h-3 w-3 cursor-nwse-resize rounded-br-md border-b-2 border-r-2 border-edge-strong hover:border-content"
                )}
              />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  }
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-base text-content-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

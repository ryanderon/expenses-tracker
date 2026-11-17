"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { AnimatePresence, m, useMotionValue, useTransform } from "motion/react"

import { cn } from "@/lib/utils"
import { EASE_DRAWER } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/** Open state and setter for SheetContent (see DialogOpenContext). */
const SheetStateContext = React.createContext({ open: false, setOpen: () => {} })

function Sheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const setOpen = React.useCallback((next) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }, [openProp, onOpenChange])
  const state = React.useMemo(() => ({ open, setOpen }), [open, setOpen])

  return (
    <SheetStateContext.Provider value={state}>
      <SheetPrimitive.Root data-slot="sheet" open={open} onOpenChange={setOpen} {...props} />
    </SheetStateContext.Provider>
  );
}

function SheetTrigger({
  ...props
}) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

// Where each side's panel sits when closed.
const OFFSCREEN = {
  left: { x: "-100%" },
  right: { x: "100%" },
  top: { y: "-100%" },
  bottom: { y: "100%" },
}

// The iOS sheet curve: most of the travel happens at once, then it settles.
const SHEET_IN = { duration: 0.45, ease: EASE_DRAWER }
const SHEET_OUT = { duration: 0.28, ease: EASE_DRAWER }

/** How far open the panel is (0–1), from its offset along `axis`. */
function useOpenness(offset, panelRef) {
  return useTransform(offset, (v) => {
    const size = panelRef.current?.offsetWidth || 1
    const px = typeof v === "string" && v.endsWith("%")
      ? (parseFloat(v) / 100) * size
      : parseFloat(v) || 0
    return 1 - Math.min(Math.abs(px) / size, 1)
  })
}

/**
 * A side drawer that slides fully in and out, and that a finger can drag
 * closed (left and right sheets). The dimmed backdrop follows the panel, so
 * a half-dragged drawer has a half-dimmed page behind it.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}) {
  const { open, setOpen } = React.useContext(SheetStateContext)
  const panelRef = React.useRef(null)
  const horizontal = side === "left" || side === "right"
  const axis = horizontal ? "x" : "y"
  const offset = useMotionValue(OFFSCREEN[side][axis])
  const openness = useOpenness(offset, panelRef)
  // Dragging toward the edge it came from closes it.
  const closing = side === "left" ? -1 : 1

  const onDragEnd = (_, info) => {
    const size = panelRef.current?.offsetWidth || 1
    const distance = info.offset.x * closing
    const speed = info.velocity.x * closing
    if (distance > size * 0.35 || speed > 500) setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <SheetPrimitive.Portal forceMount data-slot="sheet-portal">
          <SheetPrimitive.Overlay asChild forceMount>
            <m.div
              data-slot="sheet-overlay"
              className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
              // Follows the panel's own slide (and a drag), so it needs no
              // animation of its own; it stays until the panel has left.
              style={{ opacity: openness }} />
          </SheetPrimitive.Overlay>
          <SheetPrimitive.Content asChild forceMount {...props}>
            <m.div
              ref={panelRef}
              data-slot="sheet-content"
              data-side={side}
              className={cn(
                "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
                className
              )}
              style={{ [axis]: offset }}
              initial={OFFSCREEN[side]}
              animate={{ [axis]: "0%", transition: SHEET_IN }}
              exit={{ ...OFFSCREEN[side], transition: SHEET_OUT }}
              {...(horizontal && {
                drag: "x",
                dragDirectionLock: true,
                dragConstraints: { left: 0, right: 0 },
                // Free toward the closing edge, a hard stop the other way.
                dragElastic: side === "left" ? { left: 1, right: 0 } : { left: 0, right: 1 },
                dragMomentum: false,
                onDragEnd,
              })}>
              {children}
              {showCloseButton && (
                <SheetPrimitive.Close data-slot="sheet-close" asChild>
                  <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
                    <XIcon />
                    <span className="sr-only">Close</span>
                  </Button>
                </SheetPrimitive.Close>
              )}
            </m.div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function SheetHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props} />
  );
}

function SheetFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props} />
  );
}

function SheetTitle({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props} />
  );
}

function SheetDescription({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"

import { cn } from "@/lib/utils"
import { EASE_FLUID, EXIT, SPRING_DIALOG } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/**
 * Whether the dialog is open, for DialogContent: Motion has to keep the
 * content mounted while it animates out, which Radix can't do on its own.
 */
const DialogOpenContext = React.createContext(false)

function Dialog({
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

  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root data-slot="dialog" open={open} onOpenChange={setOpen} {...props} />
    </DialogOpenContext.Provider>
  );
}

function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Overlay asChild forceMount {...props}>
      <m.div
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
          className
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_FLUID } }}
        exit={{ opacity: 0, transition: EXIT }} />
    </DialogPrimitive.Overlay>
  );
}

/**
 * Springs in from just below full size and a little lower, and leaves
 * faster than it came. Radix keeps focus and dismissal; Motion only animates
 * (`forceMount` hands mounting over to AnimatePresence).
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}) {
  const open = React.useContext(DialogOpenContext)
  return (
    <AnimatePresence>
      {open && (
        <DialogPortal forceMount>
          <DialogOverlay />
          <DialogPrimitive.Content
            asChild
            forceMount
            onPointerDownOutside={(e) => {
              // Prevent dialog from closing when interacting with select/popover portals
              const target = e.target;
              if (target?.closest?.('[data-radix-select-content]') || target?.closest?.('[role="listbox"]') || target?.closest?.('[data-radix-popper-content-wrapper]')) {
                e.preventDefault();
              }
            }}
            {...props}>
            <m.div
              data-slot="dialog-content"
              className={cn(
                "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm",
                className
              )}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: SPRING_DIALOG }}
              exit={{ opacity: 0, scale: 0.97, y: 6, transition: EXIT }}>
              {children}
              {showCloseButton && (
                <DialogPrimitive.Close data-slot="dialog-close" asChild>
                  <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
                    <XIcon />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogPrimitive.Close>
              )}
            </m.div>
          </DialogPrimitive.Content>
        </DialogPortal>
      )}
    </AnimatePresence>
  );
}

function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props} />
  );
}

function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

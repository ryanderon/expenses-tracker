/**
 * Penny's motion language, in one place so every animation shares a feel.
 *
 * - Springs with no bounce for anything that changes state on screen (tab
 *   indicators, chips, dialogs): they're interruptible, so a quick second tap
 *   redirects the motion instead of restarting it.
 * - A strong ease-out for things entering, and a shorter exit than entry:
 *   once the user has decided, get out of the way.
 * - The drawer curve is the iOS sheet curve: it front-loads the movement, so
 *   a long duration still feels quick.
 *
 * The matching CSS curves live in `index.css` as `--ease-fluid`,
 * `--ease-glide` and `--ease-drawer`.
 */

export const EASE_FLUID = [0.23, 1, 0.32, 1];
export const EASE_GLIDE = [0.645, 0.045, 0.355, 1];
export const EASE_DRAWER = [0.32, 0.72, 0, 1];

/** Default for indicators and state swaps. */
export const SPRING = { type: 'spring', duration: 0.35, bounce: 0 };
/** Small, fast swaps: chips, icons, presence of small controls. */
export const SPRING_SNAPPY = { type: 'spring', duration: 0.25, bounce: 0 };
/** Dialogs: a touch slower, since they're bigger. */
export const SPRING_DIALOG = { type: 'spring', duration: 0.3, bounce: 0 };

/** Things leaving: short and simple. */
export const EXIT = { duration: 0.15, ease: EASE_FLUID };

/** A section that opens and closes in place (height plus a fade). */
export const COLLAPSE = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { height: { duration: 0.28, ease: EASE_FLUID }, opacity: { duration: 0.2, delay: 0.05 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: { duration: 0.22, ease: EASE_FLUID }, opacity: { duration: 0.12 } },
  },
};

/** A row arriving in, or leaving, a list. */
export const LIST_ITEM = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { height: { duration: 0.25, ease: EASE_FLUID }, opacity: { duration: 0.2, delay: 0.04 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: { duration: 0.2, ease: EASE_FLUID }, opacity: { duration: 0.1 } },
  },
};

/** A small floating control (scroll-to-bottom, badges) popping in. */
export const POP = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.9, transition: EXIT },
};

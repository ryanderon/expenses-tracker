import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnimatePresence, animate, m, useMotionValue, useReducedMotion, useTransform,
} from 'motion/react';
import { COLLAPSE, EASE_FLUID } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Small motion building blocks shared by the pages.
 * The timing lives in `lib/motion.js`; these only wire it up.
 */

/**
 * A section that opens and closes in place instead of popping. Content
 * around it slides to make room, so the eye can follow what changed.
 * Nothing animates on first render.
 */
export function Collapse({ show, children, className, innerClassName }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          key="collapse"
          variants={COLLAPSE}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn('overflow-hidden', className)}
        >
          {/* Padding and margins live inside, so the measured height includes them. */}
          <div className={innerClassName}>{children}</div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A number that glides to its new value when it changes (another period
 * picked, a transaction added), so the change itself is visible. It shows
 * the value as-is on first render: counting up every time a page opens
 * would only slow the user down.
 *
 * A tween, not a spring: across millions of rupiah a spring's tail keeps
 * nudging the last digits for a second or more after it looks settled.
 * This one lands exactly on the value at 0.6s.
 */
export function AnimatedNumber({ value, format = (v) => String(v), className }) {
  const reduce = useReducedMotion();
  const current = useMotionValue(value);
  const text = useTransform(current, (v) => format(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      current.set(value);
      return undefined;
    }
    const controls = animate(current, value, { duration: 0.6, ease: EASE_FLUID });
    return () => controls.stop();
  }, [value, reduce, current]);

  return <m.span className={cn('tabular-nums', className)}>{text}</m.span>;
}

/**
 * Follows its content's height as it changes (a row of chips swapped for a
 * longer one), instead of jumping. Motion can't tween `auto` to `auto`, so
 * the inner box is measured and the outer one animates to it.
 */
export function AutoHeight({ children, className }) {
  const inner = useRef(null);
  const [height, setHeight] = useState(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <m.div
      className={cn('overflow-hidden', className)}
      // null means `auto` on the first render, so nothing shifts.
      animate={{ height: height ?? 'auto' }}
      transition={{ duration: 0.25, ease: EASE_FLUID }}
    >
      <div ref={inner}>{children}</div>
    </m.div>
  );
}

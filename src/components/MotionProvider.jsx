import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { SPRING } from '@/lib/motion';

/**
 * Motion for the whole app.
 *
 * `domMax` because the app uses layout animations, shared `layoutId`
 * indicators and drag. It's loaded with the app rather than lazily: the
 * bundler keeps those features in the same chunk as the rest of Motion
 * (they're reachable through its main entry), so a lazy load saved nothing
 * and only delayed the first animations. `strict` still makes a stray
 * `motion.div` an error, which keeps every element on the `m` API.
 * `reducedMotion="user"` turns movement into plain fades for people who ask
 * their OS for less motion.
 */
export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={SPRING}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

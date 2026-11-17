import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EASE_FLUID, EXIT, SPRING } from '@/lib/motion';
import useStore from '@/store/useStore';
import { useT } from '@/hooks/useT';

// Steps reference i18n keys; the copy itself lives in the locale files.
// `target` may be a list: the first one that's actually on screen wins, which
// is how a step points at the sidebar on desktop and the bottom bar on a phone.
const TOUR_STEPS = [
  {
    route: '/today',
    target: '[data-tour="today-hero"]',
    titleKey: 'tour.todayTitle',
    bodyKey: 'tour.todayBody',
    position: 'bottom',
  },
  {
    route: '/today',
    target: '[data-tour="today-add"]',
    titleKey: 'tour.addTitle',
    bodyKey: 'tour.addBody',
    position: 'bottom',
  },
  {
    route: '/budget',
    target: '[data-tour="budget-actions"]',
    titleKey: 'tour.budgetTitle',
    bodyKey: 'tour.budgetBody',
    position: 'bottom',
  },
  {
    route: '/insights',
    target: '[data-tour="insights-header"]',
    titleKey: 'tour.insightsTitle',
    bodyKey: 'tour.insightsBody',
    position: 'bottom',
  },
  {
    route: '/',
    target: [
      { selector: '[data-tour="nav-sidebar"]', position: 'right' },
      { selector: '[data-tour="nav-more"]', position: 'top' },
    ],
    titleKey: 'tour.moreTitle',
    bodyKey: 'tour.moreBody',
    position: 'top',
  },
];

/** The step's target element and tooltip side, skipping candidates that aren't rendered. */
function resolveTarget(step) {
  const candidates = Array.isArray(step.target)
    ? step.target
    : [{ selector: step.target, position: step.position }];
  for (const c of candidates) {
    const el = document.querySelector(c.selector);
    if (el && el.getClientRects().length > 0) return { el, position: c.position || step.position };
  }
  return null;
}

/** Size assumed before the tooltip has been measured once. */
const DEFAULT_TOOLTIP_SIZE = { width: 320, height: 160 };

function getTooltipStyle(rect, position, size) {
  // No element to point at: sit in the middle of the screen instead.
  if (!rect) {
    return {
      top: Math.max((window.innerHeight - size.height) / 2, 12),
      left: Math.max((window.innerWidth - size.width) / 2, 12),
    };
  }

  const tooltipWidth = size.width;
  const tooltipHeight = size.height;
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top, left;

  switch (position) {
    case 'top':
      top = rect.top - tooltipHeight - pad;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'bottom':
      top = rect.bottom + pad;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - pad;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + pad;
      break;
    default:
      top = rect.bottom + pad;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
  }

  // Clamp to viewport
  if (left < pad) left = pad;
  if (left + tooltipWidth > vw - pad) left = vw - tooltipWidth - pad;
  if (top < pad) {
    top = rect.bottom + pad; // flip to bottom
  }
  if (top + tooltipHeight > vh - pad) {
    top = rect.top - tooltipHeight - pad; // flip to top
  }

  return { top, left };
}

export default function Tour() {
  const { tourCompleted, setTourCompleted } = useStore();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const t = useT();
  const [targetRect, setTargetRect] = useState(null);
  const [targetPosition, setTargetPosition] = useState(null);
  // The step's element isn't on this page (e.g. it depends on data the user
  // doesn't have yet). The card still shows, centred, so the tour can't stall.
  const [targetMissing, setTargetMissing] = useState(false);
  const [tooltipSize, setTooltipSize] = useState(DEFAULT_TOOLTIP_SIZE);

  // The tooltip is positioned from its own measured size, so it has to be
  // measured after it mounts — reading a ref during render would give the
  // placeholder size on the first pass and never correct itself.
  const tooltipRef = useCallback((node) => {
    if (!node) return undefined;
    const observer = new ResizeObserver(() => {
      setTooltipSize((prev) =>
        prev.width === node.offsetWidth && prev.height === node.offsetHeight
          ? prev
          : { width: node.offsetWidth, height: node.offsetHeight }
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const location = useLocation();
  const navigate = useNavigate();

  // Auto-start tour on first visit
  useEffect(() => {
    if (!tourCompleted) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [tourCompleted]);

  const currentStep = TOUR_STEPS[step];

  const measureTarget = useCallback(() => {
    if (!currentStep) return;
    const found = resolveTarget(currentStep);
    if (found) {
      found.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Wait for scroll to finish
      setTimeout(() => {
        setTargetRect(found.el.getBoundingClientRect());
        setTargetPosition(found.position);
        setTargetMissing(false);
      }, 300);
    } else {
      setTargetRect(null);
      setTargetMissing(true);
    }
  }, [currentStep]);

  // Navigate to the step's route and measure
  useEffect(() => {
    if (!active || !currentStep) return;

    if (location.pathname !== currentStep.route) {
      navigate(currentStep.route);
    }

    // Delay measurement to let page render
    const timer = setTimeout(measureTarget, 400);
    return () => clearTimeout(timer);
  }, [active, step, currentStep, location.pathname, navigate, measureTarget]);

  // Re-measure on resize
  useEffect(() => {
    if (!active) return;
    const handler = () => measureTarget();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [active, measureTarget]);

  const endTour = useCallback(() => {
    setActive(false);
    setTourCompleted(true);
  }, [setTourCompleted]);

  // The spotlight stays where it is until the next target is measured, then
  // glides there, instead of blinking out between steps.
  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      endTour();
    }
  }, [step, endTour]);

  const prev = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, next, prev, endTour]);

  const showing = active && !!currentStep;
  const tooltipPos = showing
    ? getTooltipStyle(targetRect, targetPosition || currentStep.position, tooltipSize)
    : null;
  const hole = targetRect && {
    attrX: targetRect.left - 6,
    attrY: targetRect.top - 6,
    width: targetRect.width + 12,
    height: targetRect.height + 12,
  };

  return (
    <AnimatePresence>
      {showing && (
        <m.div
          key="tour"
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_FLUID } }}
          exit={{ opacity: 0, transition: EXIT }}
        >
          {/* Overlay with spotlight cutout */}
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
            <defs>
              <mask id="tour-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <AnimatePresence>
                  {hole && (
                    <m.rect
                      key="hole"
                      rx="10"
                      fill="black"
                      initial={{ ...hole, opacity: 0 }}
                      animate={{ ...hole, opacity: 1 }}
                      exit={{ opacity: 0, transition: EXIT }}
                      transition={SPRING}
                    />
                  )}
                </AnimatePresence>
              </mask>
            </defs>
            <rect
              x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)"
              mask="url(#tour-mask)"
            />
          </svg>

          {/* Click-to-dismiss transparent overlay (outside spotlight) */}
          <div
            className="absolute inset-0"
            role="button"
            tabIndex={0}
            aria-label="Close tour"
            onClick={endTour}
            onKeyDown={(e) => e.key === 'Enter' && endTour()}
            style={{ pointerEvents: 'auto' }}
          />

          {/* Spotlight ring highlight */}
          <AnimatePresence>
            {hole && (
              <m.div
                key="ring"
                className="absolute top-0 left-0 rounded-xl border-2 border-primary shadow-[0_0_0_4px_rgba(107,125,74,0.2)] pointer-events-none"
                initial={{ x: hole.attrX, y: hole.attrY, width: hole.width, height: hole.height, opacity: 0, scale: 1.06 }}
                animate={{ x: hole.attrX, y: hole.attrY, width: hole.width, height: hole.height, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: EXIT }}
                transition={SPRING}
              />
            )}
          </AnimatePresence>

          {/* Tooltip card */}
          {(targetRect || targetMissing) && (
            // Glides to each step's spot; its text crossfades below.
            <m.div
              ref={tooltipRef}
              role="dialog"
              aria-label={t(currentStep.titleKey)}
              className="absolute top-0 left-0 w-[320px] bg-background border border-border rounded-xl shadow-lg p-4"
              style={{ pointerEvents: 'auto' }}
              initial={{ x: tooltipPos.left, y: tooltipPos.top + 8, opacity: 0, scale: 0.96 }}
              animate={{ x: tooltipPos.left, y: tooltipPos.top, opacity: 1, scale: 1 }}
              transition={SPRING}
            >
              <m.div
                key={step}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: EASE_FLUID }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <Sparkles className="text-primary size-3.5" />
                    {t(currentStep.titleKey)}
                  </h3>
                  <button onClick={endTour} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                    <X className="size-3.5" />
                  </button>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {t(currentStep.bodyKey)}
              </p>
              </m.div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('tour.step', { current: step + 1, total: TOUR_STEPS.length })}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={endTour}
                  >
                    {t('common.skip')}
                  </Button>
                  {step > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={prev}
                    >
                      <ChevronLeft data-icon="inline-start" />
                      {t('common.back')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={next}
                  >
                    {step === TOUR_STEPS.length - 1 ? t('tour.finish') : t('common.next')}
                    {step < TOUR_STEPS.length - 1 && <ChevronRight data-icon="inline-end" />}
                  </Button>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1 mt-3">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-[width,background-color] duration-300 ease-fluid',
                      i === step ? 'w-4 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted-foreground/20'
                    )}
                  />
                ))}
              </div>
            </m.div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}

export function TourTrigger() {
  const t = useT();
  const { setTourCompleted } = useStore();

  const restartTour = () => {
    setTourCompleted(false);
    window.location.reload();
  };

  return (
    <Button variant="outline" size="sm" onClick={restartTour} className="gap-1.5">
      <Sparkles data-icon="inline-start" />
      <span className="hidden sm:inline">{t('tour.start')}</span>
    </Button>
  );
}

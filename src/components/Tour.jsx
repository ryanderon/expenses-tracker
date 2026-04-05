import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useStore from '@/store/useStore';

const TOUR_STEPS = [
  // Dashboard
  {
    route: '/',
    target: '[data-tour="month-picker"]',
    title: 'Month Picker',
    description: 'Switch between months to view your financial data for any period.',
    position: 'bottom',
  },
  {
    route: '/',
    target: '[data-tour="stat-cards"]',
    title: 'Financial Overview',
    description: 'Quick summary of your income, expenses, savings, investments, and net balance for the selected month.',
    position: 'bottom',
  },
  {
    route: '/',
    target: '[data-tour="charts"]',
    title: 'Visual Insights',
    description: 'See your spending breakdown and top categories at a glance with interactive charts.',
    position: 'top',
  },

  // Transactions
  {
    route: '/transactions',
    target: '[data-tour="add-transaction"]',
    title: 'Add Transaction',
    description: 'Tap here to record a new income, expense, transfer, or investment. This is where it all starts!',
    position: 'bottom',
  },
  {
    route: '/transactions',
    target: '[data-tour="search-filter"]',
    title: 'Search & Filter',
    description: 'Quickly find transactions by searching keywords or filtering by category.',
    position: 'bottom',
  },
  {
    route: '/transactions',
    target: '[data-tour="transaction-list"]',
    title: 'Transaction List',
    description: 'All your transactions for the month. Tap any item to edit or delete it.',
    position: 'top',
  },

  // Budget
  {
    route: '/budget',
    target: '[data-tour="budget-actions"]',
    title: 'Budget Tools',
    description: 'Enable budget rollover, copy last month\'s budget, or auto-fill from your actual spending. You can also manage custom categories here.',
    position: 'bottom',
  },
  {
    route: '/budget',
    target: '[data-tour="budget-summary"]',
    title: 'Budget Summary',
    description: 'Track your income, total budget, spending, and unallocated money at a glance.',
    position: 'bottom',
  },
  {
    route: '/budget',
    target: '[data-tour="budget-cards"]',
    title: 'Category Budgets',
    description: 'Set a spending limit for each category. The progress bar shows how much you\'ve used. Edit the amount and hit Save.',
    position: 'top',
  },

  // Header actions
  {
    route: '/',
    target: '[data-tour="header-actions"]',
    title: 'Backup & Export',
    description: 'Back up your data as JSON, restore from a backup, or export everything to Excel. Your data stays safe!',
    position: 'bottom',
  },
];

function getTooltipStyle(rect, position, tooltipRef) {
  if (!rect) return { top: 0, left: 0 };

  const tooltip = tooltipRef?.current;
  const tooltipWidth = tooltip?.offsetWidth || 320;
  const tooltipHeight = tooltip?.offsetHeight || 160;
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
  const [targetRect, setTargetRect] = useState(null);
  const tooltipRef = useRef(null);
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
    const el = document.querySelector(currentStep.target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Wait for scroll to finish
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      }, 300);
    } else {
      setTargetRect(null);
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

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setTargetRect(null);
      setStep((s) => s + 1);
    } else {
      endTour();
    }
  }, [step, endTour]);

  const prev = useCallback(() => {
    if (step > 0) {
      setTargetRect(null);
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

  if (!active || !currentStep) return null;

  const tooltipPos = getTooltipStyle(targetRect, currentStep.position, tooltipRef);

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Overlay with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="10"
                fill="black"
              />
            )}
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
      {targetRect && (
        <div
          className="absolute rounded-xl border-2 border-primary shadow-[0_0_0_4px_rgba(107,125,74,0.2)] pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      {targetRect && (
        <div
          ref={tooltipRef}
          role="dialog"
          aria-label={currentStep.title}
          className="absolute w-[320px] bg-background border border-border rounded-xl shadow-lg p-4 transition-all duration-300 animate-in fade-in-0 zoom-in-95"
          style={{ top: tooltipPos.top, left: tooltipPos.left, pointerEvents: 'auto' }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Sparkles className="text-primary size-3.5" />
              {currentStep.title}
            </h3>
            <button onClick={endTour} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
              <X className="size-3.5" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {currentStep.description}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {step + 1} / {TOUR_STEPS.length}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={endTour}
              >
                Skip
              </Button>
              {step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={prev}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={next}
              >
                {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
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
                  'size-1.5 rounded-full transition-colors',
                  i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted-foreground/20'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TourTrigger() {
  const { setTourCompleted } = useStore();

  const restartTour = () => {
    setTourCompleted(false);
    window.location.reload();
  };

  return (
    <Button variant="outline" size="sm" onClick={restartTour} className="gap-1.5">
      <Sparkles data-icon="inline-start" />
      <span className="hidden sm:inline">Tour</span>
    </Button>
  );
}

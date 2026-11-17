import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MonthField } from '@/components/ui/date-fields';
import { SegmentedTabs, Icon, IconBadge, EmptyState } from '@/components/ui/design';
import Markdown from '@/components/Markdown';
import useStore from '@/store/useStore';
import useChatStore, { isActive } from '@/store/useChatStore';
import { getModelInfo, getProviderInfo, keyForModel, AI_MODELS } from '@/lib/aiModels';
import { QUICK_PROMPTS } from '@/lib/aiContext';
import { cn, getMonthKey, getMonthRange } from '@/lib/utils';
import { EASE_FLUID, POP, SPRING_SNAPPY } from '@/lib/motion';
import { useT, useDateFormat } from '@/hooks/useT';
import { usePeriodLabel, useCycle } from '@/hooks/useCycle';
import PageHeader from '@/components/PageHeader';
import InsightsSummary from '@/components/InsightsSummary';

const PROMPT_ICONS = {
  overview: { icon: 'query_stats', tone: 'primary' },
  budget: { icon: 'track_changes', tone: 'amber' },
  savings: { icon: 'savings', tone: 'teal' },
  trend: { icon: 'trending_up', tone: 'violet' },
  health: { icon: 'monitor_heart', tone: 'danger' },
};

/** Errors the user fixes in Settings get a link straight there. */
const SETTINGS_ERRORS = new Set([
  'insights.errNoKey', 'insights.errAuth', 'insights.errPermission', 'insights.errNotFound',
]);

const CHIP = 'flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-secondary px-3 text-[12.5px] '
  + 'font-semibold text-muted-foreground transition-colors hover:text-foreground '
  + 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** "25 Okt–24 Nov" for a custom cycle, "Nov 2026" for a calendar month. */
function shortPeriodLabel(monthKey, calendar, locale) {
  const { start, end } = getMonthRange(monthKey);
  if (calendar) return format(start, 'MMM yyyy', { locale });
  return `${format(start, 'd MMM', { locale })}–${format(end, 'd MMM', { locale })}`;
}

function formatTokens(usage) {
  if (!usage) return null;
  // Claude reports cached input separately; the user paid for all of it.
  const input = (usage.input_tokens || 0)
    + (usage.cache_read_input_tokens || 0)
    + (usage.cache_creation_input_tokens || 0);
  return { input: input.toLocaleString(), output: (usage.output_tokens || 0).toLocaleString() };
}

// --- Setup states ----------------------------------------------------------

function SetupPrompt() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-xl pt-2">
      <EmptyState
        icon="key"
        title={t('insights.setupTitle')}
        body={t('insights.setupBody')}
        action={(
          <div className="flex flex-col items-center gap-2">
            <Button asChild size="sm">
              <Link to="/settings">{t('insights.setupAction')}</Link>
            </Button>
            <a
              href={getProviderInfo('google').keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('insights.setupLink')}
            </a>
          </div>
        )}
      />
    </div>
  );
}

// --- Composer controls -----------------------------------------------------

function ScopePicker({ scope, years, onChange }) {
  const t = useT();
  const dates = useDateFormat();
  const { calendar } = useCycle();
  const monthKey = scope.monthKey || getMonthKey(new Date());

  const [open, setOpen] = useState(false);
  const [type, setType] = useState(scope.type);
  const [year, setYear] = useState(() => Number(monthKey.slice(0, 4)));

  const label = scope.type === 'year'
    ? scope.year
    : shortPeriodLabel(monthKey, calendar, dates.dateLocale);

  const pick = (next) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setType(scope.type);
          setYear(Number(monthKey.slice(0, 4)));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={CHIP} title={t('insights.choosePeriod')}>
          <Icon name="calendar_month" size={16} />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 gap-3 rounded-[14px] p-3">
        <div>
          <p className="text-[13px] font-bold">{t('insights.choosePeriod')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('insights.choosePeriodHint')}</p>
        </div>
        <SegmentedTabs
          value={type}
          onChange={setType}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'month', label: t('common.month') },
            { value: 'year', label: t('common.year') },
          ]}
        />
        {type === 'month' ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setYear((y) => y - 1)}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon name="chevron_left" size={18} />
              </button>
              <span className="text-[13px] font-bold tabular-nums">{year}</span>
              <button
                type="button"
                onClick={() => setYear((y) => y + 1)}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon name="chevron_right" size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, i) => {
                const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                const active = scope.type === 'month' && key === monthKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pick({ type: 'month', monthKey: key })}
                    className={cn(
                      'rounded-lg px-1 py-2 text-center text-[12.5px] transition-colors',
                      active
                        ? 'bg-primary font-extrabold text-primary-foreground'
                        : 'font-medium hover:bg-secondary'
                    )}
                  >
                    {dates.monthShort(`${key}-01`).split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => pick({ type: 'year', year: y })}
                className={cn(
                  'rounded-lg px-1 py-2 text-center text-[12.5px] tabular-nums transition-colors',
                  scope.type === 'year' && scope.year === y
                    ? 'bg-primary font-extrabold text-primary-foreground'
                    : 'font-medium hover:bg-secondary'
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ModelPicker({ value, models, onChange }) {
  const t = useT();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        title={t('insights.modelLabel')}
        className={cn(
          CHIP,
          'w-auto border-0 py-0 pr-2 dark:bg-secondary dark:hover:bg-secondary [&_svg]:size-3.5'
        )}
      >
        <Icon name="auto_awesome" size={15} />
        <SelectValue>{getModelInfo(value).shortLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="start">
        <SelectGroup>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Two controls swapping in one spot (Send ⇄ Stop).
const SWAP = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.12 } },
};

function Composer({ busy, placeholder, onSend, onStop, controls }) {
  const t = useT();
  const [value, setValue] = useState('');
  const ref = useRef(null);
  // On a phone Return should break a line, as in every messaging app; the
  // send button is right there. With a keyboard, Enter sends.
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, []);

  // Grows with the text up to ~6 lines, then scrolls inside itself.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  const submit = () => {
    if (busy || !value.trim()) return;
    onSend(value);
    setValue('');
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="rounded-[22px] border border-border bg-card p-2 shadow-(--shadow-card) transition-colors focus-within:border-ring/60"
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        enterKeyHint={touch ? 'enter' : 'send'}
        aria-label={placeholder}
        className="block w-full resize-none bg-transparent px-2.5 pt-1.5 pb-1 text-base leading-6 outline-none placeholder:text-muted-foreground md:text-[14.5px]"
      />
      <div className="flex items-center gap-1.5 pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{controls}</div>
        {/* Send and Stop trade places in the same spot. */}
        <div className="relative size-9 shrink-0">
          <AnimatePresence initial={false}>
            {/* The wrapper animates, so the buttons keep their own
                disabled and hover opacity. */}
            <m.span key={busy ? 'stop' : 'send'} {...SWAP} className="absolute inset-0 flex">
              {busy ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label={t('insights.stop')}
                  title={t('insights.stop')}
                  className="press flex size-full items-center justify-center rounded-full bg-foreground text-background hover:opacity-85"
                >
                  <Icon name="stop" size={20} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!value.trim()}
                  aria-label={t('insights.send')}
                  title={t('insights.send')}
                  className="press flex size-full items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-35"
                >
                  <Icon name="arrow_upward" size={20} />
                </button>
              )}
            </m.span>
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
}

// --- Thread ----------------------------------------------------------------

function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-[13px] text-muted-foreground">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-primary/70 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}

function CopyButton({ text }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <ActionButton
      icon={copied ? 'check' : 'content_copy'}
      label={copied ? t('insights.copied') : t('insights.copy')}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
      }}
    />
  );
}

function Answer({ exchange, isLast, onRetry }) {
  const t = useT();
  const { status, answer, error, model, usage, truncated } = exchange;
  const working = isActive(exchange);
  const tokens = formatTokens(usage);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-primary',
            working && 'animate-pulse motion-reduce:animate-none'
          )}
        >
          <Icon name="auto_awesome" size={14} />
        </span>
        {getModelInfo(model).label}
      </div>

      {/* The first words fade in where the typing dots were. */}
      {answer && (
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE_FLUID }}>
          <Markdown content={answer} />
        </m.div>
      )}

      {working && !answer && (
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <TypingIndicator
            label={`${t(status === 'thinking' ? 'insights.thinking' : 'insights.reading')}…`}
          />
        </m.div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">
          <Icon name="error" size={18} className="mt-px shrink-0" />
          <div className="flex flex-col items-start gap-2">
            <p>{t(error)}</p>
            <div className="flex flex-wrap gap-3 text-[12.5px] font-bold">
              {isLast && (
                <button type="button" onClick={onRetry} className="underline underline-offset-2">
                  {t('insights.retry')}
                </button>
              )}
              {SETTINGS_ERRORS.has(error) && (
                <Link to="/settings" className="underline underline-offset-2">
                  {t('insights.openSettings')}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {(status === 'stopped' || truncated) && (
        <p className="text-[12.5px] italic text-muted-foreground">
          {t(truncated ? 'insights.truncated' : 'insights.stopped')}
        </p>
      )}

      {!working && status !== 'error' && (
        <div className="-ml-2 flex flex-wrap items-center gap-0.5">
          {answer && <CopyButton text={answer} />}
          {isLast && (
            <ActionButton
              icon="refresh"
              label={t(status === 'stopped' && !answer ? 'insights.retry' : 'insights.regenerate')}
              onClick={onRetry}
            />
          )}
          {tokens && (
            <span className="ml-auto px-2 text-[11px] tabular-nums text-muted-foreground/80">
              {t('insights.tokensUsed', tokens)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Exchange({ exchange, isLast, minHeight, onRetry }) {
  return (
    <div data-exchange={exchange.id} className="flex flex-col gap-5" style={{ minHeight }}>
      {/* A sent question rises out of the composer's corner. */}
      <m.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_SNAPPY}
        style={{ transformOrigin: '100% 100%' }}
        className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-secondary px-4 py-2.5 text-[14.5px] leading-relaxed"
      >
        {exchange.question}
      </m.div>
      <Answer exchange={exchange} isLast={isLast} onRetry={onRetry} />
    </div>
  );
}

// Suggestions arrive one after another, 40ms apart: enough to read as a
// list being dealt, too short to keep anyone waiting.
const STAGGER = { animate: { transition: { staggerChildren: 0.04 } } };
const RISE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_FLUID } },
};

function EmptyChat({ period, minHeight, onPick }) {
  const t = useT();
  return (
    <m.div
      variants={STAGGER}
      initial="initial"
      animate="animate"
      className="flex flex-col justify-center gap-5"
      style={{ minHeight }}
    >
      <m.div variants={RISE} className="flex flex-col items-center gap-2.5 text-center">
        <IconBadge name="auto_awesome" size={42} />
        <div>
          <h2 className="text-[16px] font-extrabold">{t('insights.emptyTitle')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            {t('insights.emptyBody', { period })}
          </p>
        </div>
      </m.div>
      <m.div variants={STAGGER} className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
        {QUICK_PROMPTS.map((p) => {
          const look = PROMPT_ICONS[p.id] || PROMPT_ICONS.overview;
          return (
            <m.button
              key={p.id}
              type="button"
              variants={RISE}
              onClick={() => onPick(t(p.promptKey))}
              className="press flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left hover:border-primary/40 hover:bg-secondary/40"
            >
              <IconBadge name={look.icon} tone={look.tone} size={32} />
              <span className="min-w-0 flex-1 text-[13.5px] font-semibold">{t(p.labelKey)}</span>
              <Icon name="arrow_forward" size={16} className="text-muted-foreground" />
            </m.button>
          );
        })}
      </m.div>
    </m.div>
  );
}

/**
 * The chat itself. Scrolling follows the pattern of the big chat apps: when a
 * question is sent it slides to the top of the view and the answer writes
 * itself out underneath, so the reader starts at the top of the answer
 * instead of being dragged along by every new line. To make room for that,
 * the latest exchange is always at least one viewport tall.
 */
function AiChat({ years }) {
  const t = useT();
  const periodLabel = usePeriodLabel();
  const aiSettings = useStore((s) => s.aiSettings);
  const setAiSettings = useStore((s) => s.setAiSettings);
  const scope = useChatStore((s) => s.scope);
  const exchanges = useChatStore((s) => s.exchanges);
  const ask = useChatStore((s) => s.ask);
  const retry = useChatStore((s) => s.retry);
  const stop = useChatStore((s) => s.stop);
  const setScope = useChatStore((s) => s.setScope);

  const busy = exchanges.some(isActive);
  const usableModels = AI_MODELS.filter((model) => keyForModel(aiSettings, model.id));
  const monthKey = scope.monthKey || getMonthKey(new Date());
  const period = scope.type === 'year' ? scope.year : periodLabel(monthKey);

  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const pinRef = useRef(null);
  const [viewportH, setViewportH] = useState(0);
  const [atBottom, setAtBottom] = useState(true);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
      measure();
    });
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Coming back to an existing thread opens on its latest exchange.
  useLayoutEffect(() => {
    const last = useChatStore.getState().exchanges.at(-1);
    if (last) pinRef.current = { id: last.id, smooth: false };
  }, []);

  useLayoutEffect(() => {
    const pin = pinRef.current;
    const scroller = scrollRef.current;
    if (!pin || !scroller || !viewportH) return;
    // Sending also shrinks the composer back to one line, which makes the
    // thread taller than the height the filler was sized from. Re-measure
    // first, or the scroll stops short by however many lines were typed.
    if (scroller.clientHeight !== viewportH) {
      setViewportH(scroller.clientHeight);
      return;
    }
    const node = scroller.querySelector(`[data-exchange="${pin.id}"]`);
    if (!node) return;
    pinRef.current = null;
    scroller.scrollTo({ top: node.offsetTop - 16, behavior: pin.smooth ? 'smooth' : 'auto' });
  }, [exchanges, viewportH]);

  const send = (text) => {
    const id = ask(text);
    if (id) pinRef.current = { id, smooth: true };
  };

  const onRetry = () => {
    const id = retry();
    if (id) pinRef.current = { id, smooth: true };
  };

  const changeScope = (next) => {
    const same = next.type === scope.type
      && (next.type === 'year' ? next.year === scope.year : next.monthKey === monthKey);
    if (same) return;
    if (exchanges.length && !window.confirm(t('insights.scopeResetConfirm'))) return;
    setScope(next);
  };

  // Content padding is 16px top + 24px bottom; the latest exchange fills the rest.
  const fill = Math.max(viewportH - 40, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={measure}
          className="relative h-full overflow-y-auto overscroll-contain"
        >
          <div ref={contentRef} className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-0.5 pt-4 pb-6">
            {exchanges.length === 0 && (
              <EmptyChat period={period} minHeight={fill} onPick={send} />
            )}
            {/* Always mounted, so only exchanges added from now on animate:
                coming back to a thread shows it as it was. */}
            <AnimatePresence initial={false}>
              {exchanges.map((ex, i) => (
                <Exchange
                  key={ex.id}
                  exchange={ex}
                  isLast={i === exchanges.length - 1}
                  minHeight={i === exchanges.length - 1 ? fill : undefined}
                  onRetry={onRetry}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Soft edge so text fades out under the composer instead of being cut. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-background to-transparent" />

        <AnimatePresence>
          {!atBottom && exchanges.length > 0 && (
            <m.button
              key="scroll-down"
              type="button"
              variants={POP}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              aria-label={t('insights.scrollDown')}
              className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-(--shadow-card) transition-colors hover:text-primary"
            >
              <Icon name="arrow_downward" size={18} />
            </m.button>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-3xl pt-2">
        <Composer
          busy={busy}
          onSend={send}
          onStop={stop}
          placeholder={
            exchanges.length
              ? t('insights.followUpPlaceholder')
              : t('insights.askPlaceholder', { period })
          }
          controls={(
            <>
              <ScopePicker scope={scope} years={years} onChange={changeScope} />
              <ModelPicker
                value={aiSettings.model}
                models={usableModels}
                onChange={(v) => setAiSettings({ model: v })}
              />
            </>
          )}
        />
      </div>
    </div>
  );
}

// --- Page ------------------------------------------------------------------

// The content under the tabs fades in when you switch; the pill does the moving.
const TAB_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.22, ease: EASE_FLUID },
};

export default function Insights() {
  const t = useT();
  const tab = useChatStore((s) => s.tab);
  const setTab = useChatStore((s) => s.setTab);
  const hasThread = useChatStore((s) => s.exchanges.length > 0);
  const reset = useChatStore((s) => s.reset);
  const aiSettings = useStore((s) => s.aiSettings);
  const transactions = useStore((s) => s.transactions);
  const [summaryMonth, setSummaryMonth] = useState(() => getMonthKey(new Date()));

  const hasKey = !!keyForModel(aiSettings, aiSettings.model);
  const hasData = transactions.length > 0;

  const years = useMemo(() => {
    const yrs = new Set(transactions.map((tx) => String(new Date(tx.date).getFullYear())));
    yrs.add(String(new Date().getFullYear()));
    return [...yrs].sort((a, b) => b - a);
  }, [transactions]);

  const tabs = (
    <SegmentedTabs
      id="insights-tabs"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'summary', label: t('insights.tabSummary') },
        {
          value: 'ai',
          label: (
            <span className="flex items-center gap-1.5">
              {t('insights.tabAi')}
              <Badge variant="secondary" className="px-1.5 text-[9px]">{t('insights.beta')}</Badge>
            </span>
          ),
        },
      ]}
    />
  );

  if (tab === 'summary') {
    return (
      <>
        <div data-tour="insights-header">
          <PageHeader actions={<MonthField value={summaryMonth} onChange={setSummaryMonth} />} />
        </div>
        <div className="flex flex-col gap-4">
          {tabs}
          <m.div {...TAB_FADE}>
            <InsightsSummary monthKey={summaryMonth} />
          </m.div>
        </div>
      </>
    );
  }

  return (
    // Sized to the viewport so the thread scrolls inside itself and the
    // composer stays put above the bottom nav. App.jsx publishes the header
    // and nav heights, and drops <main>'s bottom padding for this page.
    <div
      data-chat-fill
      data-tour="insights-header"
      className="flex min-h-104 flex-col [--chat-gap:2.25rem] lg:[--chat-gap:3.25rem]"
      style={{
        height: 'calc(100dvh - var(--app-header-h, 61px) - var(--bottom-nav-h, 0px) - var(--chat-gap))',
      }}
    >
      {/* The app bar already names the page on a phone; the room goes to the chat. */}
      <div className="hidden lg:block">
        <PageHeader />
      </div>

      <div className="flex items-center justify-between gap-3">
        {tabs}
        <AnimatePresence>
          {hasThread && (
            <m.button
              key="new-chat"
              type="button"
              variants={POP}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={reset}
              className="press flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12.5px] font-bold text-muted-foreground hover:text-foreground"
            >
              <Icon name="edit_square" size={17} />
              {/* Icon only on narrow phones, where the label would wrap the tabs. */}
              <span className="max-[389px]:sr-only">{t('insights.newChat')}</span>
            </m.button>
          )}
        </AnimatePresence>
      </div>

      {!hasKey && <SetupPrompt />}
      {hasKey && !hasData && (
        <div className="pt-4">
          <EmptyState icon="receipt_long" title={t('insights.noDataTitle')} body={t('insights.noDataBody')} />
        </div>
      )}
      {hasKey && hasData && (
        <m.div {...TAB_FADE} className="flex min-h-0 flex-1 flex-col">
          <AiChat years={years} />
        </m.div>
      )}
    </div>
  );
}

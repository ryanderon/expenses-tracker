import { useState } from 'react';
import { format, parse, subDays, startOfDay, startOfYear } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Icon, SegmentedTabs } from '@/components/ui/design';
import { useT, useDateFormat } from '@/hooks/useT';
import { usePeriodLabel } from '@/hooks/useCycle';
import { shiftMonth as shiftMonthKey } from '@/lib/budget';
import { cn, getMonthKey, getMonthRange } from '@/lib/utils';

/**
 * Date controls for the redesign.
 *
 * Native `<input type="month">` and `<input type="date">` render an OS widget
 * that ignores every token in the design — wrong font, wrong radius, a grey
 * system calendar icon. These wrap the same value contract in a styled pill
 * plus a popover, so a date field looks like the rest of the app.
 */

const TRIGGER = 'flex h-10 w-max items-center gap-2 whitespace-nowrap rounded-xl '
  + 'border border-border bg-card px-3.5 text-[13px] font-semibold transition-colors '
  + 'hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * Month + year picker. `value`/`onChange` speak `yyyy-MM`, matching the
 * native input this replaces.
 */
export function MonthField({ value, onChange, className, align = 'end' }) {
  const dates = useDateFormat();
  // With a custom cycle start day the trigger has to read as a span, not a
  // month name — every page that shows a period gets that from here.
  const periodLabel = usePeriodLabel();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));

  const selectedMonth = Number(value.slice(5, 7)) - 1;
  const selectedYear = Number(value.slice(0, 4));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => { setOpen(v); if (v) setYear(selectedYear); }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(TRIGGER, className)}>
          <Icon name="calendar_month" size={17} className="text-muted-foreground" />
          {periodLabel(value)}
          <Icon name="expand_more" size={16} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-62 rounded-[14px] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
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
            const active = i === selectedMonth && year === selectedYear;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onChange(key); setOpen(false); }}
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
      </PopoverContent>
    </Popover>
  );
}

/**
 * Single-date picker. `value`/`onChange` speak `yyyy-MM-dd`, matching the
 * native input this replaces.
 */
export function DateField({ value, onChange, className, align = 'start' }) {
  const dates = useDateFormat();
  const [open, setOpen] = useState(false);

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(TRIGGER, 'w-full justify-between', className)}>
          <span className="flex items-center gap-2">
            <Icon name="calendar_month" size={17} className="text-muted-foreground" />
            {selected ? dates.short(selected) : '—'}
          </span>
          <Icon name="expand_more" size={16} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto rounded-[14px] p-2">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          locale={dates.dateLocale}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Period selector with two modes: a budget period, or an arbitrary date range.
 *
 * One control rather than two, because they answer the same question and only
 * one of them can be active. `value` is
 * `{ mode: 'month', month }` or `{ mode: 'range', from, to }`; the caller
 * doesn't have to track which control is showing.
 */
export function PeriodField({ value, onChange, className, align = 'end' }) {
  const t = useT();
  const dates = useDateFormat();
  const periodLabel = usePeriodLabel();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(value.mode);
  const [year, setYear] = useState(() => Number((value.month || '').slice(0, 4)) || new Date().getFullYear());
  const [draft, setDraft] = useState();

  const isRange = value.mode === 'range';
  // "20 Aug – 18 Sep 2026", not "20 Aug 2026 – 18 Sep 2026": the year only
  // earns its place when the range actually crosses one.
  const label = isRange
    ? `${value.from.slice(0, 4) === value.to.slice(0, 4)
        ? format(parse(value.from, 'yyyy-MM-dd', new Date()), 'd MMM', { locale: dates.dateLocale })
        : dates.short(value.from)} – ${dates.short(value.to)}`
    : periodLabel(value.month);

  const presets = [
    {
      key: 'last7',
      run: () => ({ from: subDays(startOfDay(new Date()), 6), to: new Date() }),
    },
    {
      key: 'last30',
      run: () => ({ from: subDays(startOfDay(new Date()), 29), to: new Date() }),
    },
    {
      key: 'last90',
      run: () => ({ from: subDays(startOfDay(new Date()), 89), to: new Date() }),
    },
    {
      key: 'thisPeriod',
      run: () => getMonthRange(getMonthKey(new Date())),
    },
    {
      key: 'lastPeriod',
      run: () => getMonthRange(shiftMonthKey(getMonthKey(new Date()), -1)),
    },
    {
      key: 'thisYear',
      run: () => ({ start: startOfYear(new Date()), end: new Date() }),
    },
  ];

  const commitRange = (from, to) => {
    onChange({
      mode: 'range',
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd'),
    });
    setDraft(undefined);
    setOpen(false);
  };

  const applyPreset = (preset) => {
    const r = preset.run();
    commitRange(r.from ?? r.start, r.to ?? r.end);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) return;
        setTab(value.mode);
        setDraft(isRange
          ? { from: parse(value.from, 'yyyy-MM-dd', new Date()), to: parse(value.to, 'yyyy-MM-dd', new Date()) }
          : undefined);
        if (value.month) setYear(Number(value.month.slice(0, 4)));
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(TRIGGER, className)}>
          <Icon name="calendar_month" size={17} className="text-muted-foreground" />
          {label}
          <Icon name="expand_more" size={16} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-auto max-w-[min(92vw,22rem)] rounded-[14px] p-3.5">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'month', label: t('transactions.byPeriod') },
            { value: 'range', label: t('transactions.byRange') },
          ]}
          className="mb-3"
        />

        {tab === 'month' ? (
          <>
            <div className="mb-2.5 flex items-center justify-between">
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
                const active = !isRange && key === value.month;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { onChange({ mode: 'month', month: key }); setOpen(false); }}
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
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium transition-colors hover:bg-secondary"
                >
                  {t(`transactions.preset${p.key[0].toUpperCase()}${p.key.slice(1)}`)}
                </button>
              ))}
            </div>

            <Calendar
              mode="range"
              selected={draft}
              defaultMonth={draft?.from ?? new Date()}
              locale={dates.dateLocale}
              onSelect={setDraft}
            />

            <button
              type="button"
              disabled={!draft?.from || !draft?.to}
              onClick={() => commitRange(draft.from, draft.to)}
              className={cn(
                'mt-2 w-full rounded-xl bg-primary py-2 text-[13px] font-bold text-primary-foreground transition-opacity',
                (!draft?.from || !draft?.to) && 'pointer-events-none opacity-40'
              )}
            >
              {t('transactions.applyRange')}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

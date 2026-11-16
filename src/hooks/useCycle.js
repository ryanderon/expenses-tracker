import { useMemo } from 'react';
import { format, parse } from 'date-fns';
import useStore from '@/store/useStore';
import {
  getMonthRange, filterTransactionsByMonth, filterTransactionsByYear, paycheckSignature,
} from '@/lib/utils';
import { useDateFormat } from '@/hooks/useT';

/**
 * The budget cycle as React sees it.
 *
 * The date helpers in `lib/utils` read the same settings from module state,
 * which React cannot see. Subscribing here is what makes a change re-render
 * the pages that derive periods from it — so any `useMemo` that filters by
 * period should depend on `key`. With periods following paydays, `key` also
 * changes when a salary is logged, moved or deleted (and only then: it's a
 * string, so other edits don't re-render anything).
 */
export function useCycle() {
  const startDay = useStore((s) => s.budgetSettings?.cycleStartDay) || 1;
  const follow = useStore((s) => !!s.budgetSettings?.cycleFollowPaycheck);
  const paydays = useStore((s) => (s.budgetSettings?.cycleFollowPaycheck ? paycheckSignature(s.transactions) : ''));
  return {
    startDay,
    follow,
    /** Periods are plain calendar months, so a month name is an honest label. */
    calendar: startDay === 1 && !follow,
    key: `${startDay}|${follow}|${paydays}`,
  };
}

/**
 * `filterTransactionsByMonth` bound to the current cycle.
 *
 * Passing the day explicitly rather than letting the filter read module state
 * is what makes a page's `useMemo` depend on the setting in a way the reader —
 * and the linter — can actually see.
 */
export function useMonthFilter() {
  const { startDay, key } = useCycle();
  return useMemo(
    () => (transactions, monthKey) => filterTransactionsByMonth(transactions, monthKey, startDay),
    // `key` covers settings the helper reads from module state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startDay, key]
  );
}

/**
 * Names a period. A calendar month is just its name; a custom cycle has to show
 * its span, because "September" would be actively misleading for 25 Sep–24 Oct.
 */
export function usePeriodLabel() {
  const { calendar, key } = useCycle();
  const dates = useDateFormat();

  return useMemo(() => (monthKey) => {
    if (calendar) return dates.month(`${monthKey}-01`);
    const { start, end } = getMonthRange(monthKey);
    const locale = dates.dateLocale;
    return `${format(start, 'd MMM', { locale })} – ${format(end, 'd MMM yyyy', { locale })}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, key, dates]);
}

/** `filterTransactionsByYear` bound to the current start day, as `useMonthFilter` is. */
export function useYearFilter() {
  const { startDay, key } = useCycle();
  return useMemo(
    () => (transactions, year) => filterTransactionsByYear(transactions, year, startDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startDay, key]
  );
}

/**
 * Names a year. "2026" for calendar months; with a custom cycle the span, so
 * it's clear the year runs from the first period's start to the last one's end.
 */
export function useYearLabel() {
  const { calendar, key } = useCycle();
  const dates = useDateFormat();

  return useMemo(() => (year) => {
    if (calendar) return String(year);
    const locale = dates.dateLocale;
    const start = getMonthRange(`${year}-01`).start;
    const end = getMonthRange(`${year}-12`).end;
    return `${format(start, 'd MMM yyyy', { locale })} – ${format(end, 'd MMM yyyy', { locale })}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, key, dates]);
}

/** Label for a `PeriodField` value, for pages that show the period elsewhere too. */
export function usePeriodValueLabel() {
  const dates = useDateFormat();
  const periodLabel = usePeriodLabel();

  // "20 Aug – 18 Sep 2026", not "20 Aug 2026 – 18 Sep 2026": the year only
  // earns its place when the range actually crosses one.
  return useMemo(() => (value) => (value.mode === 'range'
    ? `${value.from.slice(0, 4) === value.to.slice(0, 4)
        ? format(parse(value.from, 'yyyy-MM-dd', new Date()), 'd MMM', { locale: dates.dateLocale })
        : dates.short(value.from)} – ${dates.short(value.to)}`
    : periodLabel(value.month)), [dates, periodLabel]);
}

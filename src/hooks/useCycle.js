import { useMemo } from 'react';
import { format } from 'date-fns';
import useStore from '@/store/useStore';
import { getMonthRange, filterTransactionsByMonth } from '@/lib/utils';
import { useDateFormat } from '@/hooks/useT';

/**
 * The budget period's start day, read from the store.
 *
 * The date helpers in `lib/utils` read the same value from module state, which
 * React cannot see. Subscribing here is what makes a change to the setting
 * actually re-render the pages that derive months from it — so any `useMemo`
 * that filters by month should list this in its dependencies.
 */
function useCycleStartDay() {
  return useStore((s) => s.budgetSettings?.cycleStartDay) || 1;
}

/**
 * `filterTransactionsByMonth` bound to the current start day.
 *
 * Passing the day explicitly rather than letting the filter read module state
 * is what makes a page's `useMemo` depend on the setting in a way the reader —
 * and the linter — can actually see.
 */
export function useMonthFilter() {
  const startDay = useCycleStartDay();
  return useMemo(
    () => (transactions, monthKey) => filterTransactionsByMonth(transactions, monthKey, startDay),
    [startDay]
  );
}

/**
 * Names a period. A calendar month is just its name; a custom cycle has to show
 * its span, because "September" would be actively misleading for 25 Sep–24 Oct.
 */
export function usePeriodLabel() {
  const startDay = useCycleStartDay();
  const dates = useDateFormat();

  return useMemo(() => (monthKey) => {
    if (startDay === 1) return dates.month(`${monthKey}-01`);
    const { start, end } = getMonthRange(monthKey);
    const locale = dates.dateLocale;
    return `${format(start, 'd MMM', { locale })} – ${format(end, 'd MMM yyyy', { locale })}`;
  }, [startDay, dates]);
}

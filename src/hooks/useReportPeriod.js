import { useState, useMemo } from 'react';
import useStore from '@/store/useStore';
import {
  useMonthFilter, useYearFilter, useYearLabel, usePeriodValueLabel,
} from '@/hooks/useCycle';
import { filterTransactionsByDateRange, getMonthKey } from '@/lib/utils';

/**
 * The period a report page is looking at: a budget period or a custom date
 * range (monthly view), or a whole year (yearly view). Reports and Analytics
 * share it so they filter, label and name exports the same way.
 *
 * Pair with `<ReportPeriodControls period={...} />`.
 */
export default function useReportPeriod() {
  const transactions = useStore((s) => s.transactions);
  const filterByMonth = useMonthFilter();
  const filterByYear = useYearFilter();
  const valueLabel = usePeriodValueLabel();
  const yearLabel = useYearLabel();

  const [view, setView] = useState('monthly');
  const [period, setPeriodState] = useState(() => ({ mode: 'month', month: getMonthKey(new Date()) }));
  const [year, setYear] = useState(() => Number(getMonthKey(new Date()).slice(0, 4)));

  // Picking a period also moves the yearly view to that period's year, so
  // switching tabs stays on the same stretch of time.
  const setPeriod = (next) => {
    setPeriodState(next);
    const anchor = next.mode === 'range' ? getMonthKey(next.to) : next.month;
    setYear(Number(anchor.slice(0, 4)));
  };

  const activeTx = useMemo(() => {
    if (view === 'yearly') return filterByYear(transactions, year);
    if (period.mode === 'range') return filterTransactionsByDateRange(transactions, period.from, period.to);
    return filterByMonth(transactions, period.month);
  }, [view, period, year, transactions, filterByMonth, filterByYear]);

  let fileKey = String(year);
  if (view === 'monthly') fileKey = period.mode === 'range' ? `${period.from}_${period.to}` : period.month;

  return {
    view,
    setView,
    period,
    setPeriod,
    year,
    setYear,
    activeTx,
    label: view === 'yearly' ? yearLabel(year) : valueLabel(period),
    /** For year-long charts (monthly comparison): the year the current view sits in. */
    chartYear: year,
    fileKey,
  };
}

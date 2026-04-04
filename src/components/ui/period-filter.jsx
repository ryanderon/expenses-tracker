import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Calendar, CalendarRange } from 'lucide-react';
import MonthPicker from '@/components/ui/month-picker';
import DateRangePicker from '@/components/ui/date-range-picker';
import { filterTransactionsByMonth, filterTransactionsByDateRange, getSalaryCycleRange } from '@/lib/utils';

export function usePeriodFilter(transactions) {
  const [mode, setMode] = useState('month');
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [dateRange, setDateRange] = useState(getSalaryCycleRange());

  const filtered = useMemo(() => {
    if (mode === 'month') {
      return filterTransactionsByMonth(transactions, currentMonth);
    }
    return filterTransactionsByDateRange(transactions, dateRange?.from, dateRange?.to);
  }, [transactions, mode, currentMonth, dateRange]);

  const periodLabel = useMemo(() => {
    if (mode === 'month') return format(new Date(currentMonth + '-01'), 'MMMM yyyy');
    if (!dateRange?.from) return 'Select range';
    if (!dateRange.to) return format(dateRange.from, 'MMM d, yyyy');
    return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`;
  }, [mode, currentMonth, dateRange]);

  return {
    mode, setMode,
    currentMonth, setCurrentMonth,
    dateRange, setDateRange,
    filtered,
    periodLabel,
  };
}

export default function PeriodFilter({
  mode, setMode,
  currentMonth, setCurrentMonth,
  dateRange, setDateRange,
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Mode toggle */}
      <div className="flex bg-secondary/60 rounded-lg p-0.5 border border-border shrink-0">
        <button
          onClick={() => setMode('month')}
          className={`p-1.5 rounded-md transition-all cursor-pointer ${
            mode === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Filter by month"
        >
          <Calendar size={14} />
        </button>
        <button
          onClick={() => setMode('range')}
          className={`p-1.5 rounded-md transition-all cursor-pointer ${
            mode === 'range' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Filter by date range"
        >
          <CalendarRange size={14} />
        </button>
      </div>

      {/* Active picker */}
      {mode === 'month' ? (
        <MonthPicker value={currentMonth} onChange={setCurrentMonth} />
      ) : (
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      )}
    </div>
  );
}

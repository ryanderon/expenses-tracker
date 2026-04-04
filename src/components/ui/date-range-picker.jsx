import { useState, useMemo, useCallback } from 'react';
import { format, subMonths, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { CalendarRange, Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getSalaryCycleRange, cn } from '@/lib/utils';

const PRESETS = [
  {
    label: 'Salary Cycle (25th–24th)',
    getValue: () => getSalaryCycleRange(),
  },
  {
    label: 'Last Salary Cycle',
    getValue: () => getSalaryCycleRange(subMonths(new Date(), 1)),
  },
  {
    label: 'This Month',
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: 'Last Month',
    getValue: () => {
      const d = subMonths(new Date(), 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    },
  },
  {
    label: 'This Week',
    getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }),
  },
  {
    label: 'Last 30 Days',
    getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: 'Last 90 Days',
    getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  useState(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });
  return isMobile;
}

function formatLabel(value) {
  if (!value?.from) return 'Pick a date range';
  if (!value.to) return format(value.from, 'MMM d, yyyy');
  return `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`;
}

function PresetsPanel({ onSelect }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
        Quick Select
      </p>
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onSelect(preset.getValue())}
          className="w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-secondary transition-colors cursor-pointer text-foreground"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function RangeStatus({ value }) {
  if (!value?.from) return (
    <p className="text-xs text-muted-foreground text-center py-1">Select start date</p>
  );
  if (!value.to) return (
    <p className="text-xs text-primary text-center py-1 animate-pulse">Now select end date</p>
  );
  return (
    <p className="text-xs text-center py-1 flex items-center justify-center gap-1.5 text-chart-1">
      <Check size={12} />
      {format(value.from, 'MMM d')} – {format(value.to, 'MMM d, yyyy')}
    </p>
  );
}

export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isMobile = useIsMobile();
  const label = useMemo(() => formatLabel(value), [value]);

  const handleOpen = useCallback((isOpen) => {
    if (isOpen) setDraft(value);
    setOpen(isOpen);
  }, [value]);

  const handleSelect = useCallback((range) => {
    setDraft(range);
    if (range?.from && range?.to) {
      onChange(range);
      setOpen(false);
    }
  }, [onChange]);

  const handlePreset = useCallback((range) => {
    setDraft(range);
    onChange(range);
    setOpen(false);
  }, [onChange]);

  const triggerBtn = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'h-8 gap-2 text-xs font-medium justify-start',
        !value?.from && 'text-muted-foreground'
      )}
      onClick={() => handleOpen(true)}
    >
      <CalendarRange size={14} />
      <span className="truncate max-w-[160px]">{label}</span>
    </Button>
  );

  const calendarContent = (
    <>
      <Calendar
        mode="range"
        selected={draft}
        onSelect={handleSelect}
        numberOfMonths={isMobile ? 1 : 2}
        defaultMonth={value?.from || subMonths(new Date(), 1)}
      />
      <RangeStatus value={draft} />
    </>
  );

  if (isMobile) {
    return (
      <>
        {triggerBtn}
        <Sheet open={open} onOpenChange={handleOpen}>
          <SheetContent side="bottom" className="px-4 pb-6 pt-4 max-h-[85dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-sm">Select Date Range</SheetTitle>
            </SheetHeader>
            <PresetsPanel onSelect={handlePreset} />
            <div className="border-t border-border mt-2 pt-2 flex justify-center">
              {calendarContent}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        {triggerBtn}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r border-border p-2 w-[170px]">
            <PresetsPanel onSelect={handlePreset} />
          </div>
          <div className="p-2">
            {calendarContent}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

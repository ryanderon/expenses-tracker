import { useState, useMemo } from 'react';
import { format, subMonths, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { CalendarRange } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!value?.from) return 'Pick a date range';
    if (!value.to) return format(value.from, 'MMM d, yyyy');
    return `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`;
  }, [value]);

  const handleSelect = (range) => {
    onChange(range);
    if (range?.from && range?.to) setOpen(false);
  };

  const handlePreset = (preset) => {
    const range = preset.getValue();
    onChange(range);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-2 text-xs font-medium justify-start',
            !value?.from && 'text-muted-foreground'
          )}
        >
          <CalendarRange size={14} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          {/* Presets sidebar */}
          <div className="border-b sm:border-b-0 sm:border-r border-border p-2 sm:w-[170px] space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
              Quick Select
            </p>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-secondary transition-colors cursor-pointer text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Calendar */}
          <div className="p-2">
            <Calendar
              mode="range"
              selected={value}
              onSelect={handleSelect}
              numberOfMonths={2}
              defaultMonth={value?.from || subMonths(new Date(), 1)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

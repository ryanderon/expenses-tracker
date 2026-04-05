import { useState, useMemo, useCallback } from 'react';
import { format, subMonths, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { CalendarRange, Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import useIsMobile from '@/hooks/useIsMobile';
import { getSalaryCycleRange, cn } from '@/lib/utils';

const PRESETS = [
  {
    label: 'Salary Cycle (25th–24th)',
    getValue: () => getSalaryCycleRange(),
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

function formatLabel(value) {
  if (!value?.from) return 'Pick a date range';
  if (!value.to) return format(value.from, 'MMM d, yyyy');
  return `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`;
}

function PresetsPanel({ onSelect, active }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
        Quick Select
      </p>
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onSelect(preset.getValue())}
          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-secondary active:bg-secondary transition-colors cursor-pointer text-foreground"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function RangeStatus({ value }) {
  if (!value?.from) return (
    <p className="text-xs text-muted-foreground text-center py-1.5">Tap a start date</p>
  );
  if (!value.to) return (
    <p className="text-xs text-primary text-center py-1.5 font-medium animate-pulse">Now tap end date</p>
  );
  return (
    <p className="text-xs text-center py-1.5 flex items-center justify-center gap-1.5 text-chart-1 font-medium">
      <Check className="size-3" />
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

  const handleCalendarSelect = useCallback((range) => {
    setDraft(range);
  }, []);

  const handlePreset = useCallback((range) => {
    setDraft(range);
    onChange(range);
    setOpen(false);
  }, [onChange]);

  const handleApply = useCallback(() => {
    if (draft?.from && draft?.to) {
      onChange(draft);
      setOpen(false);
    }
  }, [draft, onChange]);

  const triggerButton = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'h-8 gap-2 text-xs font-medium justify-start',
        !value?.from && 'text-muted-foreground'
      )}
    >
      <CalendarRange data-icon="inline-start" />
      <span className="truncate max-w-[160px]">{label}</span>
    </Button>
  );

  const handleDesktopApply = useCallback(() => {
    if (draft?.from && draft?.to) {
      onChange(draft);
      setOpen(false);
    }
  }, [draft, onChange]);

  // ─── Desktop: Popover ───
  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          {triggerButton}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" onInteractOutside={(e) => {
          // Don't close if user is mid-selection (has from but no to)
          if (draft?.from && !draft?.to) {
            e.preventDefault();
          }
        }}>
          <div className="flex">
            <div className="border-r border-border p-2 w-[170px]">
              <PresetsPanel onSelect={handlePreset} />
            </div>
            <div className="flex flex-col gap-2 p-2">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                defaultMonth={value?.from || subMonths(new Date(), 1)}
              />
              <RangeStatus value={draft} />
              <div className="flex justify-end gap-2 px-2 pb-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleDesktopApply} disabled={!draft?.from || !draft?.to}>Apply</Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // ─── Mobile: Vaul Drawer ───
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'h-8 gap-2 text-xs font-medium justify-start',
          !value?.from && 'text-muted-foreground'
        )}
        onClick={() => handleOpen(true)}
      >
      <CalendarRange data-icon="inline-start" />
        <span className="truncate max-w-[160px]">{label}</span>
      </Button>

      <Drawer open={open} onOpenChange={handleOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Select Date Range</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 pb-2 max-h-[calc(85dvh-140px)]">
            {/* Presets as horizontal scroll chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset.getValue())}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-full border border-border bg-secondary/40 hover:bg-secondary active:bg-secondary/80 transition-colors cursor-pointer text-foreground whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendar */}
            <div className="flex justify-center">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={handleCalendarSelect}
                numberOfMonths={1}
                defaultMonth={value?.from || new Date()}
                className="[--cell-size:--spacing(10)]"
              />
            </div>

            <RangeStatus value={draft} />
          </div>

          <DrawerFooter className="pt-2">
            <Button
              onClick={handleApply}
              disabled={!draft?.from || !draft?.to}
              className="w-full"
            >
              Apply Range
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

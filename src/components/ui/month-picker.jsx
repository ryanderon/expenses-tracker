import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MonthPicker({ value, onChange }) {
  const date = new Date(value + '-01');
  const prev = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - 1);
    onChange(format(d, 'yyyy-MM'));
  };
  const next = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    onChange(format(d, 'yyyy-MM'));
  };

  return (
    <div className="flex items-center gap-0.5 sm:gap-2">
      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" onClick={prev}>
        <ChevronLeft size={14} />
      </Button>
      <span className="text-xs sm:text-sm font-semibold min-w-[100px] sm:min-w-[130px] text-center whitespace-nowrap">
        {format(date, 'MMM yyyy')}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" onClick={next}>
        <ChevronRight size={14} />
      </Button>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

/** Digits only, grouped in threes with the Indonesian dot separator. */
function formatDisplay(value) {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseValue(formatted) {
  return formatted.replace(/\./g, '');
}

/**
 * Sizes are defined on the wrapper rather than the input, because the currency
 * prefix is a sibling of the input, not an overlay on top of it. An absolutely
 * positioned prefix has to be dodged with left padding, which only lines up at
 * one font size and drifts at every other.
 */
const SIZES = {
  sm: {
    wrap: 'h-8 gap-1.5 px-2.5 rounded-lg',
    prefix: 'text-[11px]',
    input: 'text-xs font-semibold',
  },
  md: {
    wrap: 'h-11 gap-2 px-3.5 rounded-[10px]',
    prefix: 'text-[13px]',
    input: 'text-sm font-semibold',
  },
  lg: {
    wrap: 'h-14 gap-2.5 px-4 rounded-xl',
    prefix: 'text-[15px]',
    input: 'text-[22px] font-extrabold tracking-[-0.01em]',
  },
};

/**
 * Amount field. The prefix sits in the flex flow so it stays on the input's
 * baseline at any size, and the whole row carries the border and focus ring so
 * prefix and number read as one control.
 */
export default function CurrencyInput({
  value,
  onChange,
  name,
  className,
  size = 'md',
  currency = 'Rp',
  disabled,
  ...props
}) {
  const [display, setDisplay] = useState(() => formatDisplay(value));

  // Re-sync when the parent replaces the value — reopening the modal on a
  // different row, or clearing the form after a save. Adjusted during render
  // rather than in an effect so the field never paints the stale figure first;
  // typing doesn't trigger it, because the digits already agree.
  const digits = String(value ?? '').replace(/\D/g, '');
  if (parseValue(display) !== digits) setDisplay(formatDisplay(digits));

  const handleChange = useCallback((e) => {
    const raw = parseValue(e.target.value);
    if (raw && !/^\d+$/.test(raw)) return;
    setDisplay(formatDisplay(raw));
    onChange?.({ target: { name, value: raw } });
  }, [name, onChange]);

  const s = SIZES[size] ?? SIZES.md;

  return (
    <div
      className={cn(
        'flex w-full items-center border border-input bg-transparent transition-[color,box-shadow]',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        'aria-invalid:border-destructive',
        disabled && 'pointer-events-none opacity-50',
        s.wrap,
        className
      )}
    >
      <span
        aria-hidden
        className={cn('select-none font-semibold text-muted-foreground', s.prefix)}
      >
        {currency}
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name={name}
        value={display}
        onChange={handleChange}
        disabled={disabled}
        placeholder="0"
        className={cn(
          'w-full min-w-0 bg-transparent tabular-nums outline-none',
          'placeholder:font-normal placeholder:text-muted-foreground/45',
          s.input
        )}
        {...props}
      />
    </div>
  );
}

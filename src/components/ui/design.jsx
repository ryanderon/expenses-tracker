import { createContext, useContext, useId } from 'react';
import { m } from 'motion/react';
import { SPRING, SPRING_SNAPPY } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Primitives lifted straight out of "Penny Redesign.dc.html".
 *
 * The design repeats the same handful of shapes on every screen — an elevated
 * card, a tinted icon square, a stacked proportion bar, a conic ring, a
 * segmented tab strip. Keeping them here means a radius or shadow tweak
 * lands everywhere at once instead of being retyped per page.
 */

/** Material Symbols glyph. The design uses these throughout. */
export function Icon({ name, className, style, size }) {
  return (
    <span
      className={cn('material-symbols-outlined select-none', className)}
      style={{ fontSize: size ? `${size}px` : undefined, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** The design's standard surface: elevated bg, hairline border, soft shadow. */
export function Panel({ className, children, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-[20px] border border-border bg-card shadow-[var(--shadow-card)]',
        padded && 'p-[22px]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelTitle({ children, trailing, className }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 mb-4', className)}>
      <h3 className="text-sm font-bold">{children}</h3>
      {trailing && <span className="text-[13px] font-extrabold text-muted-foreground">{trailing}</span>}
    </div>
  );
}

const TONES = {
  primary: 'bg-[var(--primary-soft)] text-primary',
  teal: 'bg-teal-soft text-teal',
  violet: 'bg-violet-soft text-violet',
  amber: 'bg-amber-soft text-amber',
  sky: 'bg-sky-soft text-sky',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-secondary text-muted-foreground',
};

/** Tinted rounded square holding an icon — the design's stat-card motif. */
export function IconBadge({ name, tone = 'primary', size = 40, className }) {
  return (
    <span
      className={cn('flex items-center justify-center rounded-xl shrink-0', TONES[tone], className)}
      style={{ width: size, height: size }}
    >
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Label + value + tinted icon. Used on Dashboard, Analytics and Budget. */
export function StatCard({ label, value, icon, tone = 'primary', valueClass, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      {icon && <IconBadge name={icon} tone={tone} />}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 text-[17px] font-extrabold tabular-nums truncate', valueClass)}>
          {value}
        </p>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Proportion bar — one rounded track, segments sized by share.
 * The design uses this instead of a pie for "breakdown" panels.
 */
export function StackedBar({ segments, height = 14, className }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div
      className={cn('flex overflow-hidden rounded-full bg-border', className)}
      style={{ height }}
    >
      {total > 0 &&
        segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key ?? s.label}
              className="transition-[width] duration-700 ease-fluid"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            />
          ))}
    </div>
  );
}

/** Legend row beneath a StackedBar: dot, label, amount, share. */
export function LegendRow({ color, label, value, pct }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span
        className="size-[9px] shrink-0 rounded-[4px]"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground tabular-nums">{value}</span>
      {pct != null && (
        <span className="w-10 text-right font-bold tabular-nums">{pct}%</span>
      )}
    </div>
  );
}

/** Single-value progress bar with the design's gradient fill. */
export function Meter({ pct, color = 'var(--primary)', height = 7, className }) {
  return (
    <div
      className={cn('overflow-hidden rounded-[5px] bg-border', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-fluid"
        style={{
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          background: `linear-gradient(90deg, color-mix(in oklch, ${color} 70%, white), ${color})`,
        }}
      />
    </div>
  );
}

/**
 * Conic-gradient ring with a value in the middle (Allocation of Income).
 * The fill is a registered CSS property (`--ring-pct`), so a new value sweeps
 * round instead of jumping.
 */
export function Ring({ pct, color, label, size = 68 }) {
  const inner = Math.round(size * 0.765);
  return (
    <div
      className="ring-fill mx-auto flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        '--ring-pct': `${Math.min(Math.max(pct, 0), 100)}%`,
        background: `conic-gradient(${color} var(--ring-pct), var(--border) 0)`,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-card text-[12.5px] font-extrabold"
        style={{ width: inner, height: inner }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Pill tab strip — Budget's Monthly/Recurring, Reports' period switch.
 * One highlight slides between the tabs (a shared `layoutId`, scoped per
 * strip by `useId`), so the eye follows the switch instead of seeing two
 * pills blink.
 */
export function SegmentedTabs({ value, onChange, options, className, id }) {
  const autoId = useId();
  // A fixed `id` lets the highlight slide even when the strip is remounted
  // in a different layout (Insights' two tabs render different pages).
  const strip = id ?? autoId;
  return (
    <div
      className={cn(
        'flex w-fit gap-1.5 rounded-xl border border-border bg-card p-1',
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'press relative rounded-[9px] px-3 py-2 text-[12.5px] font-bold',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <m.span
                layoutId={`${strip}-tab`}
                transition={SPRING}
                className="absolute inset-0 bg-primary"
                style={{ borderRadius: 9 }}
              />
            )}
            <span className="relative flex items-center gap-[inherit]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const ChoiceGroupContext = createContext(null);

/**
 * A row of ChoicePills where one is picked. Inside a group the highlight
 * slides from the old pill to the new one, like SegmentedTabs.
 */
export function ChoiceGroup({ children, className }) {
  const group = useId();
  return (
    <ChoiceGroupContext.Provider value={group}>
      <div className={cn('flex flex-wrap gap-1.5', className)}>{children}</div>
    </ChoiceGroupContext.Provider>
  );
}

/**
 * Selectable chip used in the Add Transaction modal (type / account).
 * `color` tints the active pill (a category's own colour).
 */
export function ChoicePill({ active, color, children, className, ...props }) {
  const group = useContext(ChoiceGroupContext);
  const fill = { borderRadius: 9, ...(color ? { backgroundColor: color } : {}) };
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'press relative rounded-[9px] bg-secondary px-3 py-2 text-[12.5px] font-bold',
        active
          ? color ? 'text-white' : 'text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
      {...props}
    >
      {active && (group ? (
        <m.span
          layoutId={`${group}-choice`}
          transition={SPRING_SNAPPY}
          className="absolute inset-0 bg-primary"
          style={fill}
        />
      ) : (
        <span className="absolute inset-0 bg-primary" style={fill} />
      ))}
      <span className="relative">{children}</span>
    </button>
  );
}

/** Small outline badge next to a transaction's subcategory. */
export function SoftBadge({ children, tone, className }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-[10.5px] font-bold',
        tone ? TONES[tone] : 'border border-border text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Round avatar/initial badge used for accounts and split-bill people. */
export function InitialBadge({ children, color, size = 38, radius = 12, className }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center font-extrabold text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius === 999 ? '9999px' : radius,
        backgroundColor: color,
        fontSize: Math.round(size * 0.34),
      }}
    >
      {children}
    </span>
  );
}

/** Dashed-outline empty state, matching the design's placeholder cards. */
export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border py-10 text-center">
      {icon && <IconBadge name={icon} tone="muted" size={44} />}
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {body && <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}

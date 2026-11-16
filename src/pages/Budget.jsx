import { useState, useMemo, useCallback } from 'react';
import {
  Target, TrendingUp, TrendingDown, Wallet, AlertTriangle, Copy, Receipt,
  RotateCcw, Plus, X, Tags, ChevronDown, CalendarClock, Repeat, Undo2,
  Gauge, CircleAlert, Bell, Settings2, Check,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CurrencyInput from '@/components/ui/currency-input';
import { MonthField } from '@/components/ui/date-fields';
import useStore from '@/store/useStore';
import { getAllCategories, isNeutralType } from '@/lib/constants';
import { formatCurrency, getMonthKey, cn } from '@/lib/utils';
import { useT } from '@/hooks/useT';
import { usePeriodLabel } from '@/hooks/useCycle';
import { StatCard, SegmentedTabs, Icon } from '@/components/ui/design';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import { buildBudgetReport, shiftMonth } from '@/lib/budget';
import PageHeader from '@/components/PageHeader';

/** Choices for when a category counts as nearly used up (`budgetSettings.alertThreshold`). */
const ALERT_THRESHOLDS = [50, 70, 80, 90, 100];

/**
 * Amount field that holds a local draft and commits on blur or Enter, so
 * every keystroke doesn't write to the store (and re-run the budget report).
 */
function BudgetAmountInput({ value, onCommit, placeholder, className, name, size = 'sm' }) {
  const [draft, setDraft] = useState(null);
  const isEditing = draft !== null;

  const commit = () => {
    if (!isEditing) return;
    onCommit(draft === '' ? null : Number(draft));
    setDraft(null);
  };

  return (
    <CurrencyInput
      name={name}
      value={isEditing ? draft : value || ''}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      size={size}
      className={className}
    />
  );
}

/** Progress bar with a tick showing where straight-line pacing says you should be. */
function PacedProgress({ pct, elapsedPct, showMarker, color, className }) {
  const t = useT();
  const tooltipLabel = `${t('budget.expectedToday')} · ${elapsedPct}%`;
  return (
    <div className="relative">
      <Progress
        value={pct}
        className={cn('h-2', className)}
        style={color ? { '--progress-color': color } : undefined}
      />
      {showMarker && elapsedPct > 0 && elapsedPct < 100 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/50"
              style={{ left: `${elapsedPct}%` }}
            />
          </TooltipTrigger>
          <TooltipContent>{tooltipLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function CategoryCard({ cat, monthKey, expanded, onToggleExpand }) {
  const t = useT();
  const {
    setBudget, clearBudget, setSubBudget, clearSubBudget, budgetSettings, toggleRolloverExcluded,
  } = useStore();

  const rolloverExcluded = !!budgetSettings.rolloverExcluded?.[cat.key];
  // Savings and investments are targets: progress toward them, never "over".
  const goal = cat.isGoal;
  let statusColor = cat.hex;
  if (goal && cat.reached) statusColor = 'var(--primary)';
  else if (cat.isOver) statusColor = 'var(--destructive)';
  else if (cat.isNearLimit) statusColor = 'var(--chart-2)';

  return (
    <Card className={cn(cat.isOver && 'border-destructive/40', goal && cat.reached && 'border-primary/40')}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: cat.hex }} />
            <h4 className="text-sm font-semibold truncate">{categoryLabel(cat, t)}</h4>
            {cat.hasOverride && cat.templateAmount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t('budget.custom')}</Badge>
                </TooltipTrigger>
                <TooltipContent>{t('budget.customHint', { amount: formatCurrency(cat.templateAmount) })}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {goal && cat.reached && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary shrink-0">
              <Icon name="check_circle" size={14} /> {t('budget.reached')}
            </span>
          )}
          {cat.isOver && <span className="text-xs text-destructive font-medium shrink-0">{t('budget.overBudget')}</span>}
          {!cat.isOver && cat.isNearLimit && (
            <span className="text-xs text-chart-2 font-medium shrink-0">{t('budget.percentUsed', { percent: cat.pctRaw })}</span>
          )}
        </div>

        <div className="flex justify-between gap-3 text-sm mb-2">
          <span className="text-muted-foreground">
            {goal
              ? t(cat.spent < 0 ? 'budget.drawnDown' : 'budget.collected', { amount: formatCurrency(Math.abs(cat.spent)) })
              : `${formatCurrency(cat.spent)} ${t('common.spent')}`}
          </span>
          <span className="text-muted-foreground text-right">
            {cat.effectiveBudget > 0
              ? (goal
                ? t('budget.ofTarget', { amount: formatCurrency(cat.effectiveBudget) })
                : `${t('common.of')} ${formatCurrency(cat.effectiveBudget)}`)
              : t(goal ? 'budget.noTarget' : 'budget.noBudgetSet')}
          </span>
        </div>

        <PacedProgress
          pct={Math.max(cat.pct, 0)}
          elapsedPct={cat.pacing.elapsedPct}
          showMarker={!goal && cat.pacing.isCurrent && cat.effectiveBudget > 0}
          color={statusColor}
          className="mb-3"
        />

        <div className="flex items-center gap-2">
          <BudgetAmountInput
            name={`budget-${cat.key}`}
            value={cat.usesSubBudgets ? cat.planned : cat.ownAmount}
            placeholder={cat.templateAmount ? String(cat.templateAmount) : '0'}
            onCommit={(amount) => {
              if (amount == null) clearBudget(monthKey, cat.key);
              else setBudget(monthKey, cat.key, amount);
            }}
            className={cn(cat.usesSubBudgets && 'opacity-60 pointer-events-none')}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onToggleExpand(cat.key)}
          >
            <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
            <span className="hidden sm:inline">{t('budget.details')}</span>
          </Button>
        </div>

        {cat.usesSubBudgets && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {t('budget.subTotalHint')}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-1">
          {cat.rollover !== 0 && (
            <p className={cn(
              'text-xs flex items-center gap-1',
              cat.rollover > 0 ? 'text-chart-1' : 'text-destructive'
            )}>
              <RotateCcw className="size-2.5" />
              {cat.rollover > 0 ? '+' : ''}{formatCurrency(cat.rollover)} · {t('budget.rolloverPerCategory')}
            </p>
          )}

          {goal && cat.effectiveBudget > 0 && (
            <p className={cn('text-xs', cat.reached ? 'text-primary' : 'text-muted-foreground')}>
              {cat.reached
                ? (cat.spent > cat.effectiveBudget
                  ? t('budget.beyondTarget', { amount: formatCurrency(cat.spent - cat.effectiveBudget) })
                  : t('budget.reachedBody'))
                : t('budget.toGo', { amount: formatCurrency(cat.remaining) })}
            </p>
          )}

          {!goal && cat.effectiveBudget > 0 && (
            <p className={cn('text-xs', cat.isOver ? 'text-destructive' : 'text-muted-foreground')}>
              {cat.isOver
                ? t('budget.overBy', { amount: formatCurrency(cat.spent - cat.effectiveBudget) })
                : t('budget.remainingAmount', { amount: formatCurrency(cat.remaining) })}
            </p>
          )}

          {!goal && cat.pacing.isCurrent && cat.effectiveBudget > 0 && !cat.isOver && (
            <p className={cn(
              'text-xs flex items-center gap-1',
              cat.pacing.projectedOver ? 'text-chart-2' : 'text-muted-foreground'
            )}>
              <Gauge className="size-2.5" />
              {t('budget.onTrackFor', { amount: formatCurrency(cat.pacing.projected) })}
              {cat.pacing.dailySafe > 0 && (
                <span className="text-muted-foreground">
                  · {formatCurrency(cat.pacing.dailySafe)}{t('common.perDay')}
                </span>
              )}
            </p>
          )}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t('budget.subcategoryLimits')}</Label>
              <Button
                variant={rolloverExcluded ? 'outline' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => toggleRolloverExcluded(cat.key)}
              >
                <RotateCcw data-icon="inline-start" />
                {t('budget.rolloverPerCategory')} · {rolloverExcluded ? t('budget.off') : t('budget.on')}
              </Button>
            </div>

            {cat.subcategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('budget.noSubcategories')}
              </p>
            ) : (
              cat.subcategories.map((sub) => (
                <div key={sub.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{subcategoryLabel(sub.name, t)}</span>
                    <span className={cn(
                      'tabular-nums shrink-0',
                      sub.isOver ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {formatCurrency(sub.spent)}
                      {sub.amount > 0 && ` / ${formatCurrency(sub.amount)}`}
                    </span>
                  </div>
                  {sub.amount > 0 && (
                    <Progress
                      value={Math.min(sub.pct, 100)}
                      className="h-1"
                      style={{ '--progress-color': sub.isOver ? 'var(--destructive)' : cat.hex }}
                    />
                  )}
                  <BudgetAmountInput
                    name={`sub-${cat.key}-${sub.name}`}
                    value={sub.amount}
                    placeholder={t('budget.noLimit')}
                    onCommit={(amount) => {
                      if (amount == null) clearSubBudget(monthKey, cat.key, sub.name);
                      else setSubBudget(monthKey, cat.key, sub.name, amount);
                    }}
                    className="h-7"
                  />
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateTab({ report }) {
  const t = useT();
  const { budgetTemplate, setTemplateBudget, setTemplateSubBudget, clearTemplate } = useStore();

  const templateTotal = Object.values(budgetTemplate.categories || {})
    .reduce((s, v) => s + (v || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Repeat className="size-4 text-chart-1" /> {t('budget.recurringTitle')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('budget.recurringBody')}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('budget.perMonth')}</p>
              <p className="text-sm font-bold tabular-nums">{formatCurrency(templateTotal)}</p>
            </div>
            {templateTotal > 0 && (
              <Button variant="outline" size="sm" onClick={clearTemplate}>
                <X data-icon="inline-start" /> {t('budget.clear')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {report.categories.map((cat) => {
          const subs = cat.subcategories;
          return (
            <Card key={cat.key}>
              <CardContent className="pt-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full" style={{ backgroundColor: cat.hex }} />
                  <h4 className="text-sm font-semibold">{categoryLabel(cat, t)}</h4>
                </div>
                <BudgetAmountInput
                  name={`tpl-${cat.key}`}
                  value={budgetTemplate.categories?.[cat.key] || ''}
                  placeholder="0"
                  onCommit={(amount) => setTemplateBudget(cat.key, amount ?? 0)}
                  className=""
                />
                {subs.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    <Label className="text-[11px] text-muted-foreground">{t('budget.perSubcategory')}</Label>
                    {subs.map((sub) => (
                      <div key={sub.name} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">
                          {subcategoryLabel(sub.name, t)}
                        </span>
                        <BudgetAmountInput
                          name={`tpl-${cat.key}-${sub.name}`}
                          value={budgetTemplate.subcategories?.[`${cat.key}::${sub.name}`] || ''}
                          placeholder="0"
                          onCommit={(amount) => setTemplateSubBudget(cat.key, sub.name, amount ?? 0)}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** One sentence per alert, chosen by severity. */
function alertLine(cat, t) {
  const label = categoryLabel(cat, t);
  if (cat.isOver) {
    return t('today.overspentBody', {
      category: label,
      amount: formatCurrency(cat.spent - cat.effectiveBudget),
    });
  }
  if (cat.isNearLimit) {
    return t('today.nearLimitBody', { category: label, percent: cat.pctRaw });
  }
  return t('today.trendingOverBody', {
    category: label,
    amount: formatCurrency(cat.pacing.projected),
    limit: formatCurrency(cat.effectiveBudget),
  });
}

export default function Budget() {
  const t = useT();
  const {
    transactions, accounts, budgets, subBudgets, budgetTemplate, budgetSettings,
    customSubcategories, customCategories,
    setBudgetSetting, setRolloverEnabled, copyBudgetFromMonth, prefillBudgetFromSpending,
    saveMonthAsTemplate, resetMonthToTemplate,
    addCustomSubcategory, removeCustomSubcategory,
  } = useStore();

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const [currentMonth, setCurrentMonth] = useState(getMonthKey(new Date()));
  const [tab, setTab] = useState('monthly');
  const [expanded, setExpanded] = useState({});
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const periodLabel = usePeriodLabel();
  const prevMonthKey = useMemo(() => shiftMonth(currentMonth, -1), [currentMonth]);
  const prevPeriodLabel = periodLabel(prevMonthKey);

  const report = useMemo(
    () => buildBudgetReport({
      monthKey: currentMonth,
      transactions,
      allCategories,
      customSubcategories,
      customCategories,
      budgets,
      subBudgets,
      budgetTemplate,
      budgetSettings,
      accounts,
    }),
    [
      currentMonth, transactions, allCategories, customSubcategories, customCategories,
      budgets, subBudgets, budgetTemplate, budgetSettings, accounts,
    ]
  );

  const { spending } = report;
  const limitCats = report.categories.filter((c) => !c.isGoal);
  const goalCats = report.categories.filter((c) => c.isGoal);

  const toggleExpand = useCallback((key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const hasPrevMonthBudget = !!budgets[prevMonthKey]
    && Object.keys(budgets[prevMonthKey]).length > 0;
  const hasOverrides = !!budgets[currentMonth] || !!subBudgets[currentMonth];
  const rolloverEnabled = budgetSettings.rolloverEnabled;

  const handleAddSubcategory = () => {
    if (!selectedCategory || !newSubcategory.trim()) return;
    const name = newSubcategory.trim();
    const existing = [
      ...(allCategories[selectedCategory]?.subcategories || []),
      ...(customSubcategories[selectedCategory] || []),
    ];
    if (existing.some((s) => s.toLowerCase() === name.toLowerCase())) return;
    addCustomSubcategory(selectedCategory, name);
    setNewSubcategory('');
  };

  const allCustom = Object.entries(customSubcategories).flatMap(([cat, subs]) =>
    subs.map((s) => ({ category: cat, name: s, label: categoryLabel(allCategories[cat], t) || cat }))
  );

  return (
    <>
      <PageHeader actions={<MonthField value={currentMonth} onChange={setCurrentMonth} />} />
      <div className="flex flex-col gap-5">

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'monthly', label: t('budget.tabMonthly') },
          { value: 'template', label: t('budget.tabRecurring') },
        ]}
      />

      {tab === 'monthly' && (
        <div className="flex flex-col gap-5">
          {/* Actions, kept to three: fill in, keep for every period, settings. */}
          <div data-tour="budget-actions" className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Receipt data-icon="inline-start" /> {t('budget.autofill')}
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuItem onSelect={() => prefillBudgetFromSpending(prevMonthKey, currentMonth)}>
                  <div>
                    <p className="text-sm">{t('budget.useActuals')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('budget.useActualsHint', { month: prevPeriodLabel })}
                    </p>
                  </div>
                </DropdownMenuItem>
                {hasPrevMonthBudget && (
                  <DropdownMenuItem onSelect={() => copyBudgetFromMonth(prevMonthKey, currentMonth)}>
                    <div>
                      <p className="text-sm">{t('budget.copyLastMonth')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('budget.copyLastMonthHint', { month: prevPeriodLabel })}
                      </p>
                    </div>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasOverrides && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => saveMonthAsTemplate(currentMonth)}>
                    <Repeat data-icon="inline-start" /> {t('budget.makeRecurring')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('budget.makeRecurringHint')}</TooltipContent>
              </Tooltip>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 data-icon="inline-start" /> {t('budget.settings')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 gap-4 p-4">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rolloverEnabled}
                    onClick={() => setRolloverEnabled(!rolloverEnabled)}
                    className="flex items-start gap-3 text-left"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border',
                        rolloverEnabled && 'border-primary bg-primary text-primary-foreground'
                      )}
                    >
                      {rolloverEnabled && <Check className="size-3.5" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{t('budget.rolloverLabel')}</span>
                      <span className="block text-xs text-muted-foreground">{t('budget.rolloverHint')}</span>
                    </span>
                  </button>
                  {rolloverEnabled && (
                    <Select
                      value={budgetSettings.rolloverMode || 'surplus'}
                      onValueChange={(v) => setBudgetSetting('rolloverMode', v)}
                    >
                      <SelectTrigger size="sm" className="ml-8 w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="surplus">{t('budget.rolloverSurplus')}</SelectItem>
                          <SelectItem value="full">{t('budget.rolloverFull')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t('budget.alertLabel')}</Label>
                  <Select
                    value={String(budgetSettings.alertThreshold ?? 80)}
                    onValueChange={(v) => setBudgetSetting('alertThreshold', Number(v))}
                  >
                    <SelectTrigger size="sm" className="w-auto gap-1.5">
                      <Bell className="size-3.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ALERT_THRESHOLDS.map((pct) => (
                          <SelectItem key={pct} value={String(pct)}>
                            {t('budget.alertAt', { pct })}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('budget.alertHint')}</p>
                </div>

                <div className="-mx-2 flex flex-col border-t border-border pt-2">
                  {hasOverrides && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => resetMonthToTemplate(currentMonth)}
                    >
                      <Undo2 data-icon="inline-start" /> {t('budget.resetOverridesLong')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setShowCategoryManager(true)}
                  >
                    <Tags data-icon="inline-start" /> {t('budget.manageCategories')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {rolloverEnabled && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <RotateCcw className="size-3" /> {t('budget.rolloverOnShort')}
              </span>
            )}
          </div>

          {/* Alerts: spending only. Savings and investment targets never warn. */}
          {report.alerts.length > 0 && (
            <Card className="border-chart-2/50 bg-chart-2/5">
              <CardContent className="pt-4 pb-4 flex flex-col gap-1.5">
                {report.alerts.slice(0, 4).map((cat) => (
                  <p key={cat.key} className="text-sm flex items-start gap-2">
                    <CircleAlert className={cn(
                      'size-4 mt-0.5 shrink-0',
                      cat.isOver ? 'text-destructive' : 'text-chart-2'
                    )} />
                    <span>
                      {alertLine(cat, t)}
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div data-tour="budget-summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('budget.income')}
              value={formatCurrency(report.income)}
              icon="trending_up"
              tone="primary"
              valueClass="text-primary"
            />
            <StatCard
              label={t('budget.spendLimit')}
              value={formatCurrency(spending.budget)}
              icon="track_changes"
              sub={
                <div className="flex flex-col gap-0.5">
                  {report.income > 0 && spending.budget > 0 && (
                    <span>{t('budget.pctOfIncome', { percent: Math.round((spending.budget / report.income) * 100) })}</span>
                  )}
                  {report.totalRollover !== 0 && (
                    <span className={report.totalRollover > 0 ? 'text-chart-1' : 'text-destructive'}>
                      {t('budget.rolloverAmount', { amount: formatCurrency(report.totalRollover) })}
                    </span>
                  )}
                </div>
              }
            />
            <StatCard
              label={t('transactions.expenses')}
              value={formatCurrency(spending.spent)}
              icon="trending_down"
              tone={spending.isOver ? 'danger' : 'muted'}
              valueClass={spending.isOver ? 'text-danger' : undefined}
            />
            <StatCard
              label={t('budget.unallocated')}
              value={formatCurrency(report.unallocated)}
              icon="account_balance_wallet"
              tone={report.unallocated < 0 ? 'danger' : 'muted'}
              valueClass={report.unallocated < 0 ? 'text-danger' : undefined}
              sub={report.unallocated < 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="size-2.5" /> {t('budget.overAllocated')}
                </span>
              )}
            />
          </div>

          {/* Spending against its limits. Targets have their own section below. */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="text-chart-1" />
                    <h3 className="text-sm font-semibold">{t('budget.spendingTitle')}</h3>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(spending.spent)}{' '}
                    {spending.budget > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {t('common.of')} {formatCurrency(spending.budget)}
                      </span>
                    )}
                  </p>
                  {/* "of Rp 0 · 0% used" reads like a bug; say what's missing instead. */}
                  {spending.budget === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{t('budget.noBudgetHint')}</p>
                  )}
                </div>
                {spending.budget > 0 && (
                  <div className="text-right shrink-0">
                    <p className={cn('text-3xl font-bold', spending.isOver ? 'text-destructive' : 'text-chart-1')}>
                      {spending.pctRaw}%
                    </p>
                    <p className="text-xs text-muted-foreground">{t('budget.used')}</p>
                  </div>
                )}
              </div>

              {spending.budget > 0 && (
                <PacedProgress
                  pct={spending.pct}
                  elapsedPct={spending.pacing.elapsedPct}
                  showMarker={spending.pacing.isCurrent}
                  color={spending.isOver ? 'var(--destructive)' : undefined}
                />
              )}

              {spending.pacing.isCurrent && spending.budget > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('budget.expectedToday')}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {spending.pacing.elapsedPct}%
                      <span className={cn(
                        'ml-1.5 text-xs font-normal',
                        spending.pacing.aheadOfPace ? 'text-destructive' : 'text-chart-1'
                      )}>
                        ({spending.pacing.aheadOfPace ? t('today.paceAhead') : t('today.paceOnTrack')})
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('budget.projectedEnd')}</p>
                    <p className={cn(
                      'text-sm font-semibold tabular-nums',
                      spending.pacing.projectedOver && 'text-destructive'
                    )}>
                      {formatCurrency(spending.pacing.projected)}
                    </p>
                  </div>
                  <div>
                    {/* Over the limit there's nothing "safe" left to spend: say by how much instead. */}
                    {spending.isOver ? (
                      <>
                        <p className="text-xs text-muted-foreground">{t('budget.overBudget')}</p>
                        <p className="text-sm font-semibold tabular-nums text-destructive">
                          {t('budget.overBy', { amount: formatCurrency(-spending.remaining) })}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t('budget.safeToSpend')} · {t('budget.daysLeftShort', { count: spending.pacing.daysLeft })}
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-chart-1">
                          {formatCurrency(spending.pacing.dailySafe)}{t('common.perDay')}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-bold">{t('budget.limitsSection')}</h3>
            <div data-tour="budget-cards" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {limitCats.map((cat) => (
                <CategoryCard
                  key={cat.key}
                  cat={cat}
                  monthKey={currentMonth}
                  expanded={!!expanded[cat.key]}
                  onToggleExpand={toggleExpand}
                />
              ))}
            </div>
          </section>

          {goalCats.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-bold">{t('budget.goalsSection')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('budget.goalsHint')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {goalCats.map((cat) => (
                  <CategoryCard
                    key={cat.key}
                    cat={cat}
                    monthKey={currentMonth}
                    expanded={!!expanded[cat.key]}
                    onToggleExpand={toggleExpand}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'template' && (
        <div>
          <TemplateTab report={report} />
        </div>
      )}

      {/* Custom Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('budget.manageTitle')}</DialogTitle>
            <DialogDescription>{t('budget.manageBody')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('quickAdd.category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(allCategories)
                      .filter(([, cat]) => !isNeutralType(cat.type))
                      .map(([key, cat]) => (
                        <SelectItem key={key} value={key}>{categoryLabel(cat, t)}</SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                placeholder={t('budget.newSubcategory')}
                value={newSubcategory}
                onChange={(e) => setNewSubcategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSubcategory()}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={handleAddSubcategory}
                disabled={!selectedCategory || !newSubcategory.trim()}
              >
                <Plus data-icon />
              </Button>
            </div>

            {allCustom.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">{t('budget.customSubcategories')}</Label>
                <div className="flex flex-wrap gap-2">
                  {allCustom.map((item) => (
                    <Badge key={`${item.category}-${item.name}`} variant="secondary" className="gap-1 pr-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: allCategories[item.category]?.hex }} />
                      {item.name}
                      <span className="text-muted-foreground text-[10px]">({item.label})</span>
                      <button
                        onClick={() => {
                          // In-use names move their transactions to "Other"; say so first.
                          const count = transactions.filter(
                            (x) => x.category === item.category && x.subcategory === item.name
                          ).length;
                          if (count > 0 && !window.confirm(t('categories.removeSubConfirm', {
                            name: item.name, count, target: subcategoryLabel('Other', t),
                          }))) return;
                          removeCustomSubcategory(item.category, item.name);
                        }}
                        className="ml-1 hover:text-destructive rounded-sm p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('budget.noCustomSubcategories')}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}

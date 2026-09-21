import { useState, useMemo, useCallback } from 'react';
import {
  Target, TrendingUp, TrendingDown, Wallet, AlertTriangle, Copy, Receipt,
  RotateCcw, Plus, X, Tags, ChevronDown, CalendarClock, Repeat, Undo2,
  Gauge, CircleAlert,
} from 'lucide-react';
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
import { getAllCategories } from '@/lib/constants';
import { formatCurrency, getMonthKey, cn } from '@/lib/utils';
import { useT, useDateFormat } from '@/hooks/useT';
import { StatCard, SegmentedTabs, Icon } from '@/components/ui/design';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import { buildBudgetReport, shiftMonth } from '@/lib/budget';
import PageHeader from '@/components/PageHeader';

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
  const statusColor = cat.isOver
    ? 'var(--destructive)'
    : cat.isNearLimit ? 'var(--chart-2)' : cat.hex;

  return (
    <Card className={cn(cat.isOver && 'border-destructive/40')}>
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
          {cat.isOver && <span className="text-xs text-destructive font-medium shrink-0">{t('budget.overBudget')}</span>}
          {!cat.isOver && cat.isNearLimit && (
            <span className="text-xs text-chart-2 font-medium shrink-0">{t('budget.percentUsed', { percent: cat.pctRaw })}</span>
          )}
        </div>

        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{formatCurrency(cat.spent)} {t('common.spent')}</span>
          <span className="text-muted-foreground">
            {cat.effectiveBudget > 0
              ? `${t('common.of')} ${formatCurrency(cat.effectiveBudget)}`
              : t('budget.noBudgetSet')}
          </span>
        </div>

        <PacedProgress
          pct={cat.pct}
          elapsedPct={cat.pacing.elapsedPct}
          showMarker={cat.pacing.isCurrent && cat.effectiveBudget > 0}
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

          {cat.effectiveBudget > 0 && (
            <p className={cn('text-xs', cat.isOver ? 'text-destructive' : 'text-muted-foreground')}>
              {cat.isOver
                ? t('budget.overBy', { amount: formatCurrency(cat.spent - cat.effectiveBudget) })
                : t('budget.remainingAmount', { amount: formatCurrency(cat.remaining) })}
            </p>
          )}

          {cat.pacing.isCurrent && cat.effectiveBudget > 0 && !cat.isOver && (
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
  const dates = useDateFormat();
  const {
    transactions, budgets, subBudgets, budgetTemplate, budgetSettings,
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

  const prevMonthKey = useMemo(() => shiftMonth(currentMonth, -1), [currentMonth]);
  const prevMonthLabel = useMemo(() => dates.monthShort(`${prevMonthKey}-01`), [prevMonthKey, dates]);

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
    }),
    [
      currentMonth, transactions, allCategories, customSubcategories, customCategories,
      budgets, subBudgets, budgetTemplate, budgetSettings,
    ]
  );

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
          {/* Quick Actions */}
          <div data-tour="budget-actions" className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rolloverEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRolloverEnabled(!rolloverEnabled)}
                >
                  <RotateCcw data-icon="inline-start" />
                  {rolloverEnabled ? t('budget.rolloverOn') : t('budget.rolloverOff')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('budget.rolloverHint')}</TooltipContent>
            </Tooltip>

            {rolloverEnabled && (
              <Select
                value={budgetSettings.rolloverMode || 'surplus'}
                onValueChange={(v) => setBudgetSetting('rolloverMode', v)}
              >
                <SelectTrigger size="sm" className="w-44">
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

            {hasPrevMonthBudget && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyBudgetFromMonth(prevMonthKey, currentMonth)}
                  >
                    <Copy data-icon="inline-start" /> {t('budget.copyLastMonth')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('budget.copyLastMonthHint', { month: prevMonthLabel })}</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => prefillBudgetFromSpending(prevMonthKey, currentMonth)}
                >
                  <Receipt data-icon="inline-start" /> {t('budget.useActuals')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('budget.useActualsHint', { month: prevMonthLabel })}</TooltipContent>
            </Tooltip>

            {hasOverrides && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => saveMonthAsTemplate(currentMonth)}>
                      <Repeat data-icon="inline-start" /> {t('budget.makeRecurring')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('budget.makeRecurringHint')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => resetMonthToTemplate(currentMonth)}>
                      <Undo2 data-icon="inline-start" /> {t('budget.resetOverrides')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('budget.resetOverridesHint')}</TooltipContent>
                </Tooltip>
              </>
            )}

            <Button variant="outline" size="sm" onClick={() => setShowCategoryManager(true)}>
              <Tags data-icon="inline-start" /> {t('budget.manageCategories')}
            </Button>
          </div>

          {/* Alerts */}
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
              label={t('budget.totalBudget')}
              value={formatCurrency(report.totalBudget)}
              icon="track_changes"
              sub={
                <div className="flex flex-col gap-0.5">
                  {report.income > 0 && <span>{t('budget.pctOfIncome', { percent: report.budgetPctOfIncome })}</span>}
                  {report.totalRollover !== 0 && (
                    <span className={report.totalRollover > 0 ? 'text-chart-1' : 'text-destructive'}>
                      {t('budget.rolloverAmount', { amount: formatCurrency(report.totalRollover) })}
                    </span>
                  )}
                </div>
              }
            />
            <StatCard
              label={t('budget.totalSpent')}
              value={formatCurrency(report.totalSpent)}
              icon="trending_down"
              tone={report.totalSpent > report.totalBudget && report.totalBudget > 0 ? 'negative' : 'default'}
            />
            <StatCard
              label={t('budget.unallocated')}
              value={formatCurrency(report.unallocated)}
              icon="account_balance_wallet"
              tone={report.unallocated < 0 ? 'negative' : 'positive'}
              sub={report.unallocated < 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="size-2.5" /> {t('budget.overAllocated')}
                </span>
              )}
            />
          </div>

          {/* Overall pacing */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="text-chart-1" />
                    <h3 className="text-sm font-semibold">{t('budget.usageTitle')}</h3>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(report.totalSpent)}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      {t('common.of')} {formatCurrency(report.totalBudget)}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    'text-3xl font-bold',
                    report.totalPctRaw > 100 ? 'text-destructive' : 'text-chart-1'
                  )}>
                    {report.totalPctRaw}%
                  </p>
                  <p className="text-xs text-muted-foreground">{t('budget.used')}</p>
                </div>
              </div>

              <PacedProgress
                pct={report.totalPct}
                elapsedPct={report.pacing.elapsedPct}
                showMarker={report.pacing.isCurrent && report.totalBudget > 0}
                color={report.totalPctRaw > 100 ? 'var(--destructive)' : undefined}
              />

              {report.pacing.isCurrent && report.totalBudget > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('budget.expectedToday')}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {report.pacing.elapsedPct}%
                      <span className={cn(
                        'ml-1.5 text-xs font-normal',
                        report.pacing.aheadOfPace ? 'text-destructive' : 'text-chart-1'
                      )}>
                        ({report.pacing.aheadOfPace ? t('today.paceAhead') : t('today.paceOnTrack')})
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('budget.projectedEnd')}</p>
                    <p className={cn(
                      'text-sm font-semibold tabular-nums',
                      report.pacing.projectedOver && 'text-destructive'
                    )}>
                      {formatCurrency(report.pacing.projected)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('budget.safeToSpend')} · {t('budget.daysLeftShort', { count: report.pacing.daysLeft })}
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-chart-1">
                      {formatCurrency(report.pacing.dailySafe)}{t('common.perDay')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div data-tour="budget-cards" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.categories.map((cat) => (
              <CategoryCard
                key={cat.key}
                cat={cat}
                monthKey={currentMonth}
                expanded={!!expanded[cat.key]}
                onToggleExpand={toggleExpand}
              />
            ))}
          </div>
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
                      .filter(([, cat]) => cat.type !== 'transfer')
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
                        onClick={() => removeCustomSubcategory(item.category, item.name)}
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

import { useState, useMemo } from 'react';
import { format, subMonths, parse } from 'date-fns';
import {
  Target, Save, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Copy, Receipt, RotateCcw, Plus, X, Tags,
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
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import CurrencyInput from '@/components/ui/currency-input';
import MonthPicker from '@/components/ui/month-picker';
import useStore from '@/store/useStore';
import { CATEGORIES, getAllCategories } from '@/lib/constants';
import { filterTransactionsByMonth, formatCurrency, cn } from '@/lib/utils';

export default function Budget() {
  const {
    transactions, budgets, setBudget, budgetSettings, setRolloverEnabled,
    copyBudgetFromMonth, prefillBudgetFromSpending,
    customSubcategories, customCategories, addCustomSubcategory, removeCustomSubcategory,
  } = useStore();

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [editingBudgets, setEditingBudgets] = useState({});
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const prevMonthKey = useMemo(() => {
    const d = parse(currentMonth + '-01', 'yyyy-MM-dd', new Date());
    return format(subMonths(d, 1), 'yyyy-MM');
  }, [currentMonth]);

  const prevMonthLabel = useMemo(() => {
    const d = parse(prevMonthKey + '-01', 'yyyy-MM-dd', new Date());
    return format(d, 'MMM yyyy');
  }, [prevMonthKey]);

  const monthTx = useMemo(() => filterTransactionsByMonth(transactions, currentMonth), [transactions, currentMonth]);
  const prevMonthTx = useMemo(() => filterTransactionsByMonth(transactions, prevMonthKey), [transactions, prevMonthKey]);

  const income = useMemo(() =>
    monthTx.filter((t) => t.category === 'income').reduce((s, t) => s + t.amount, 0),
  [monthTx]);

  const rolloverEnabled = budgetSettings?.rolloverEnabled || false;

  const budgetCategories = useMemo(() =>
    Object.entries(allCategories)
      .filter(([, cat]) => cat.type !== 'income' && cat.type !== 'transfer')
      .map(([key, cat]) => {
        const spent = monthTx.filter((t) => t.category === key).reduce((s, t) => s + t.amount, 0);
        const budgetAmt = budgets[currentMonth]?.[key] || 0;

        let rollover = 0;
        if (rolloverEnabled) {
          const prevBudget = budgets[prevMonthKey]?.[key] || 0;
          if (prevBudget > 0) {
            const prevSpent = prevMonthTx
              .filter((t) => t.category === key)
              .reduce((s, t) => s + t.amount, 0);
            rollover = Math.max(0, prevBudget - prevSpent);
          }
        }

        const effectiveBudget = budgetAmt + rollover;
        const pctSpent = effectiveBudget > 0 ? Math.round((spent / effectiveBudget) * 100) : 0;
        return {
          key, label: cat.label, color: cat.color, spent, budget: budgetAmt,
          rollover, effectiveBudget,
          remaining: effectiveBudget - spent,
          pct: Math.min(pctSpent, 100),
          pctRaw: pctSpent,
          isOver: spent > effectiveBudget && effectiveBudget > 0,
        };
      }),
  [monthTx, budgets, currentMonth, rolloverEnabled, prevMonthTx, prevMonthKey]);

  const totalSetBudget = budgetCategories.reduce((s, c) => s + c.budget, 0);
  const totalRollover = budgetCategories.reduce((s, c) => s + c.rollover, 0);
  const totalBudget = budgetCategories.reduce((s, c) => s + c.effectiveBudget, 0);
  const totalSpent = budgetCategories.reduce((s, c) => s + c.spent, 0);
  const totalPct = totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0;
  const unallocated = income - totalSetBudget;
  const budgetPctOfIncome = income > 0 ? Math.round((totalSetBudget / income) * 100) : 0;

  const hasPrevMonthBudget = !!budgets[prevMonthKey] && Object.keys(budgets[prevMonthKey]).length > 0;

  const handleSave = (categoryKey) => {
    setBudget(currentMonth, categoryKey, parseFloat(editingBudgets[categoryKey]) || 0);
    setEditingBudgets((prev) => { const next = { ...prev }; delete next[categoryKey]; return next; });
  };

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
    subs.map((s) => ({ category: cat, name: s, label: allCategories[cat]?.label || cat }))
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Budget</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Set and track your monthly spending limits</p>
        </div>
        <MonthPicker value={currentMonth} onChange={setCurrentMonth} />
      </div>

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
              Rollover {rolloverEnabled ? 'On' : 'Off'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Carry unused budget from previous month</TooltipContent>
        </Tooltip>

        {hasPrevMonthBudget && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => copyBudgetFromMonth(prevMonthKey, currentMonth)}>
                <Copy data-icon="inline-start" /> Copy Last Month
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy budget allocations from {prevMonthLabel}</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => prefillBudgetFromSpending(prevMonthKey, currentMonth)}>
              <Receipt data-icon="inline-start" /> Use Last Month's Actuals
            </Button>
          </TooltipTrigger>
          <TooltipContent>Set budget based on actual spending from {prevMonthLabel}</TooltipContent>
        </Tooltip>

        <Button variant="outline" size="sm" onClick={() => setShowCategoryManager(true)}>
          <Tags data-icon="inline-start" /> Manage Categories
        </Button>
      </div>

      {/* Rollover Banner */}
      {rolloverEnabled && totalRollover > 0 && (
        <Card className="border-dashed border-chart-1/50 bg-chart-1/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="text-chart-1 size-4" />
              <p className="text-sm">
                <span className="font-medium text-chart-1">{formatCurrency(totalRollover)}</span>
                {' '}rolled over from {prevMonthLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Income & Allocation Summary */}
      <div data-tour="budget-summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Income</p>
                <p className="text-xl font-bold tabular-nums text-chart-1">{formatCurrency(income)}</p>
              </div>
              <div className="size-9 rounded-xl bg-chart-1/15 flex items-center justify-center">
                <TrendingUp className="text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Budget</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                <Target className="text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-0.5 mt-1">
              {income > 0 && <p className="text-xs text-muted-foreground">{budgetPctOfIncome}% of income</p>}
              {rolloverEnabled && totalRollover > 0 && (
                <p className="text-xs text-chart-1">+{formatCurrency(totalRollover)} rollover</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Spent</p>
                <p className={cn('text-xl font-bold tabular-nums', totalSpent > totalBudget && totalBudget > 0 && 'text-destructive')}>{formatCurrency(totalSpent)}</p>
              </div>
              <div className={cn('size-9 rounded-xl flex items-center justify-center', totalSpent > totalBudget && totalBudget > 0 ? 'bg-destructive/15' : 'bg-muted')}>
                <TrendingDown className={totalSpent > totalBudget && totalBudget > 0 ? 'text-destructive' : 'text-muted-foreground'} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Unallocated</p>
                <p className={cn('text-xl font-bold tabular-nums', unallocated < 0 ? 'text-destructive' : 'text-chart-1')}>{formatCurrency(unallocated)}</p>
              </div>
              <div className={cn('size-9 rounded-xl flex items-center justify-center', unallocated < 0 ? 'bg-destructive/15' : 'bg-chart-1/15')}>
                <Wallet className={unallocated < 0 ? 'text-destructive' : 'text-chart-1'} />
              </div>
            </div>
            {unallocated < 0 && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="size-2.5" /> Over-allocated</p>}
          </CardContent>
        </Card>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="text-chart-1" />
                <h3 className="text-sm font-semibold">Total Budget Usage</h3>
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(totalSpent)}{' '}
                <span className="text-sm font-normal text-muted-foreground">of {formatCurrency(totalBudget)}</span>
              </p>
            </div>
            <div className={cn('text-right', 'shrink-0')}>
              <p className={cn('text-3xl font-bold', totalSpent > totalBudget && totalBudget > 0 ? 'text-destructive' : 'text-chart-1')}>
                {totalPct}%
              </p>
              <p className="text-xs text-muted-foreground">used</p>
            </div>
          </div>
          <Progress value={totalPct} className="h-2" />
        </CardContent>
      </Card>

      <div data-tour="budget-cards" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {budgetCategories.map((cat) => {
          const isEditing = cat.key in editingBudgets;
          return (
            <Card key={cat.key}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full" style={{ backgroundColor: cat.hex }} />
                    <h4 className="text-sm font-semibold">{cat.label}</h4>
                  </div>
                  {cat.isOver && <span className="text-xs text-destructive font-medium">Over budget!</span>}
                </div>

                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">{formatCurrency(cat.spent)} spent</span>
                  <span className="text-muted-foreground">
                    {cat.effectiveBudget > 0
                      ? cat.pctRaw > 100 ? `${cat.pctRaw}% (over!)` : `${cat.pct}%`
                      : 'No budget set'}
                  </span>
                </div>

                <div className="h-2 rounded-full overflow-hidden mb-3">
                  <Progress value={cat.pct} className="h-2" style={{ '--progress-color': cat.isOver ? 'var(--destructive)' : cat.hex }} />
                </div>

                <div className="flex items-center gap-2">
                  <CurrencyInput
                    name={`budget-${cat.key}`}
                    value={isEditing ? editingBudgets[cat.key] : cat.budget || ''}
                    onChange={(e) => setEditingBudgets((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                    onFocus={() => { if (!isEditing) setEditingBudgets((prev) => ({ ...prev, [cat.key]: cat.budget || '' })); }}
                    className="text-xs h-8"
                  />
                  {isEditing && (
                    <Button size="sm" className="h-8" onClick={() => handleSave(cat.key)}>
                      <Save data-icon="inline-start" /> Save
                    </Button>
                  )}
                </div>

                {cat.rollover > 0 && (
                  <p className="text-xs text-chart-1 mt-2 flex items-center gap-1">
                    <RotateCcw className="size-2.5" />
                    +{formatCurrency(cat.rollover)} rollover
                    <span className="text-muted-foreground">
                      (effective: {formatCurrency(cat.effectiveBudget)})
                    </span>
                  </p>
                )}

                {cat.effectiveBudget > 0 && cat.rollover === 0 && (
                  <p className={cn('text-xs mt-2', cat.isOver ? 'text-destructive' : 'text-muted-foreground')}>
                    {cat.isOver ? `${formatCurrency(cat.spent - cat.effectiveBudget)} over budget` : `${formatCurrency(cat.remaining)} remaining`}
                  </p>
                )}

                {cat.effectiveBudget > 0 && cat.rollover > 0 && (
                  <p className={cn('text-xs mt-1', cat.isOver ? 'text-destructive' : 'text-muted-foreground')}>
                    {cat.isOver ? `${formatCurrency(cat.spent - cat.effectiveBudget)} over budget` : `${formatCurrency(cat.remaining)} remaining`}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Custom Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Custom Categories</DialogTitle>
            <DialogDescription>Add or remove custom subcategories for any category</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                  {Object.entries(allCategories)
                    .filter(([, cat]) => cat.type !== 'transfer')
                    .map(([key, cat]) => (
                      <SelectItem key={key} value={key}>{cat.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                placeholder="New subcategory name"
                value={newSubcategory}
                onChange={(e) => setNewSubcategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSubcategory()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddSubcategory} disabled={!selectedCategory || !newSubcategory.trim()}>
                <Plus data-icon />
              </Button>
            </div>

            {allCustom.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Custom subcategories</Label>
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
                No custom subcategories yet. Add one above!
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

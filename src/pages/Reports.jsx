import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Download, TrendingUp, TrendingDown, Scale, Award, Lightbulb, PiggyBank, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import useStore from '@/store/useStore';
import { CATEGORIES, getAllCategories } from '@/lib/constants';
import {
  filterTransactionsByMonth, filterTransactionsByYear, filterTransactionsByDateRange,
  calculateTotals, formatCurrency, groupByCategory, groupBySubcategory, groupByAccount,
  getMonthsInYear, getSalaryCycleRange,
} from '@/lib/utils';
import { exportToExcel } from '@/lib/excel';
import { cn } from '@/lib/utils';
import DateRangePicker from '@/components/ui/date-range-picker';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Reports() {
  const { transactions, accounts, customCategories } = useStore();
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [dateRange, setDateRange] = useState(getSalaryCycleRange());

  const years = useMemo(() => {
    const yrs = [...new Set(transactions.map((t) => new Date(t.date).getFullYear()))];
    const sy = parseInt(selectedYear);
    if (!yrs.includes(sy)) yrs.push(sy);
    return yrs.sort((a, b) => b - a);
  }, [transactions, selectedYear]);

  const monthOpts = MONTHS.map((m, i) => ({
    value: `${selectedYear}-${String(i + 1).padStart(2, '0')}`,
    label: `${m} ${selectedYear}`,
  }));

  const activeTx = useMemo(
    () => {
      if (reportType === 'range') return filterTransactionsByDateRange(transactions, dateRange?.from, dateRange?.to);
      return reportType === 'monthly' ? filterTransactionsByMonth(transactions, selectedMonth) : filterTransactionsByYear(transactions, parseInt(selectedYear));
    },
    [transactions, reportType, selectedMonth, selectedYear, dateRange]
  );

  const totals = useMemo(() => calculateTotals(activeTx, allCategories), [activeTx, allCategories]);
  const catGroups = useMemo(() => groupByCategory(activeTx), [activeTx]);
  const accGroups = useMemo(() => groupByAccount(activeTx), [activeTx]);

  const savingSummary = useMemo(() => {
    if (totals.income === 0) return null;
    const savingRate = Math.round(((totals.savings + totals.investments) / totals.income) * 100);
    const expenseRate = Math.round((totals.expenses / totals.income) * 100);
    const investmentRate = Math.round((totals.investments / totals.income) * 100);
    const pureRate = Math.round((totals.savings / totals.income) * 100);

    let level, color, emoji, message;
    if (savingRate >= 50) {
      level = 'Master Saver'; color = 'text-chart-1'; emoji = '🏆';
      message = 'Exceptional! You\'re saving more than half your income.';
    } else if (savingRate >= 40) {
      level = 'Super Saver'; color = 'text-chart-1'; emoji = '🌟';
      message = 'Outstanding financial discipline! Keep it up.';
    } else if (savingRate >= 30) {
      level = 'Great Saver'; color = 'text-chart-3'; emoji = '💪';
      message = 'You\'re well above the recommended 20% savings rate.';
    } else if (savingRate >= 20) {
      level = 'Good Saver'; color = 'text-chart-3'; emoji = '👍';
      message = 'Solid savings habit — right at the recommended rate.';
    } else if (savingRate >= 10) {
      level = 'Building Up'; color = 'text-chart-4'; emoji = '📈';
      message = 'A good start. Try to reach 20% for better security.';
    } else if (savingRate > 0) {
      level = 'Starter'; color = 'text-muted-foreground'; emoji = '🌱';
      message = 'Every bit counts. Consider automating savings.';
    } else {
      level = 'Needs Attention'; color = 'text-destructive'; emoji = '⚠️';
      message = 'No savings this period. Review expenses for cuts.';
    }

    const insights = [];
    if (expenseRate > 70) insights.push('Your expenses take over 70% of income — look for areas to reduce.');
    if (expenseRate <= 50) insights.push('Great expense control — under 50% of income goes to expenses.');
    if (investmentRate >= 10) insights.push('Strong investment allocation — your money is working for you.');
    if (investmentRate === 0 && totals.income > 0) insights.push('Consider allocating some funds to investments for growth.');
    if (totals.net < 0) insights.push('You spent more than you earned this period — review your budget.');
    if (pureRate >= 20) insights.push('Excellent cash savings rate — your emergency fund is growing.');

    return { savingRate, expenseRate, investmentRate, pureRate, level, color, emoji, message, insights };
  }, [totals, allCategories]);

  const monthlyBreakdown = useMemo(() => {
    if (reportType !== 'yearly') return [];
    return getMonthsInYear(parseInt(selectedYear)).map((mk) => {
      const mTx = filterTransactionsByMonth(transactions, mk);
      const mt = calculateTotals(mTx, allCategories);
      return { month: MONTHS[parseInt(mk.split('-')[1]) - 1], ...mt, txCount: mTx.length };
    });
  }, [transactions, reportType, selectedYear, allCategories]);

  const handleExport = () => {
    let label;
    if (reportType === 'range' && dateRange?.from) {
      label = `${format(dateRange.from, 'MMM-dd')}-to-${dateRange.to ? format(dateRange.to, 'MMM-dd-yyyy') : 'now'}`;
    } else {
      label = reportType === 'monthly' ? format(new Date(selectedMonth + '-01'), 'MMMM-yyyy') : selectedYear;
    }
    exportToExcel(activeTx, accounts, `penny-report-${label}`);
  };

  const renderCategorySection = (catKey, titleColor) => {
    const catTx = catGroups[catKey] || [];
    const catTotal = catTx.reduce((s, t) => s + t.amount, 0);
    const subs = groupBySubcategory(catTx);
    return (
      <div key={catKey} className="border-b border-border/50">
        <div className="bg-secondary/30 px-4 py-2.5">
          <span className={cn('text-xs font-bold uppercase tracking-wider', titleColor)}>
            {allCategories[catKey]?.label}
          </span>
        </div>
        {catTx.length > 0 ? (
          <>
            {Object.entries(subs).map(([sub, data]) => (
              <div key={sub} className="flex justify-between px-4 py-2 border-b border-border/20">
                <span className="text-sm pl-4">{sub}</span>
                <span className="text-sm tabular-nums">{formatCurrency(data.total)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 bg-secondary/20 font-semibold">
              <span className={cn('text-sm', titleColor)}>Total {allCategories[catKey]?.label}</span>
              <span className={cn('text-sm tabular-nums', titleColor)}>{formatCurrency(catTotal)}</span>
            </div>
          </>
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground">No {allCategories[catKey]?.label.toLowerCase()} recorded</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Reports</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Financial audit and summary reports</p>
        </div>
        <Button onClick={handleExport} size="sm"><Download data-icon="inline-start" /> Export</Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Tabs value={reportType} onValueChange={setReportType}>
              <TabsList>
                <TabsTrigger value="monthly" className="text-xs sm:text-sm">Monthly</TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs sm:text-sm">Yearly</TabsTrigger>
                <TabsTrigger value="range" className="text-xs sm:text-sm">Range</TabsTrigger>
              </TabsList>
            </Tabs>
            {reportType === 'monthly' ? (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{monthOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            ) : reportType === 'yearly' ? (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            ) : (
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="text-chart-1" />
            <CardTitle>Financial Summary</CardTitle>
            <Badge variant="outline">
              {reportType === 'monthly'
                ? format(new Date(selectedMonth + '-01'), 'MMMM yyyy')
                : reportType === 'yearly'
                  ? selectedYear
                  : dateRange?.from
                    ? `${format(dateRange.from, 'MMM d')}${dateRange.to ? ` – ${format(dateRange.to, 'MMM d, yyyy')}` : ''}`
                    : 'Select range'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-border rounded-xl overflow-hidden">
            {renderCategorySection('income', 'text-chart-1')}
            {renderCategorySection('bills', 'text-destructive')}
            {renderCategorySection('expenses', 'text-destructive')}
            {renderCategorySection('savings', 'text-chart-3')}
            {renderCategorySection('investments', 'text-chart-4')}
            {Object.entries(customCategories).map(([key]) =>
              renderCategorySection(key, 'text-muted-foreground')
            )}

            <div className="bg-secondary/40 px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {totals.net >= 0 ? <TrendingUp className="text-chart-1" /> : <TrendingDown className="text-destructive" />}
                  <span className="font-bold">Net Result</span>
                </div>
                <span className={cn('text-lg font-bold tabular-nums', totals.net >= 0 ? 'text-chart-1' : 'text-destructive')}>
                  {formatCurrency(totals.net)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saving Level & Financial Health */}
      {savingSummary && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="text-chart-4" />
              <CardTitle>Financial Health</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Saving Level Badge */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30">
              <div className="text-4xl">{savingSummary.emoji}</div>
              <div>
                <p className={cn('text-xl font-bold', savingSummary.color)}>{savingSummary.level}</p>
                <p className="text-sm text-muted-foreground">{savingSummary.message}</p>
              </div>
            </div>

            {/* Rate Meters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <PiggyBank className="size-4 text-chart-3" />
                    <span className="text-xs font-medium">Saving Rate</span>
                  </div>
                  <span className="text-sm font-bold text-chart-3">{savingSummary.savingRate}%</span>
                </div>
                <Progress value={Math.min(savingSummary.savingRate, 100)} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  {formatCurrency(totals.savings + totals.investments)} of {formatCurrency(totals.income)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="size-4 text-destructive" />
                    <span className="text-xs font-medium">Expense Rate</span>
                  </div>
                  <span className={cn('text-sm font-bold', savingSummary.expenseRate > 70 ? 'text-destructive' : 'text-muted-foreground')}>{savingSummary.expenseRate}%</span>
                </div>
                <Progress value={Math.min(savingSummary.expenseRate, 100)} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  {formatCurrency(totals.expenses)} of {formatCurrency(totals.income)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Landmark className="size-4 text-chart-4" />
                    <span className="text-xs font-medium">Investment Rate</span>
                  </div>
                  <span className="text-sm font-bold text-chart-4">{savingSummary.investmentRate}%</span>
                </div>
                <Progress value={Math.min(savingSummary.investmentRate, 100)} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  {formatCurrency(totals.investments)} of {formatCurrency(totals.income)}
                </p>
              </div>
            </div>

            {/* Insights */}
            {savingSummary.insights.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb className="size-4 text-chart-2" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Insights</span>
                </div>
                {savingSummary.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-chart-2 mt-0.5">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Account Usage</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {accounts.map((acc) => {
              const accTx = accGroups[acc.id] || { items: [], total: 0 };
              const accIncome = (accTx.items || []).filter((t) => t.category === 'income').reduce((s, t) => s + t.amount, 0);
              const accExpense = (accTx.items || []).filter((t) => t.category !== 'income' && t.category !== 'transfer').reduce((s, t) => s + t.amount, 0);
              return (
                <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${acc.color}25`, color: acc.color }}>
                      {acc.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{(accTx.items || []).length} transactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-chart-1">+{formatCurrency(accIncome)}</p>
                    <p className="text-xs text-destructive">-{formatCurrency(accExpense)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {reportType === 'yearly' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Monthly Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Savings</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyBreakdown.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell className="text-right text-chart-1 tabular-nums">{formatCurrency(row.income)}</TableCell>
                      <TableCell className="text-right text-destructive tabular-nums">{formatCurrency(row.expenses)}</TableCell>
                      <TableCell className="text-right text-chart-3 tabular-nums">{formatCurrency(row.savings)}</TableCell>
                      <TableCell className={cn('text-right font-semibold tabular-nums', row.net >= 0 ? 'text-chart-1' : 'text-destructive')}>{formatCurrency(row.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right text-chart-1 tabular-nums font-bold">{formatCurrency(totals.income)}</TableCell>
                    <TableCell className="text-right text-destructive tabular-nums font-bold">{formatCurrency(totals.expenses)}</TableCell>
                    <TableCell className="text-right text-chart-3 tabular-nums font-bold">{formatCurrency(totals.savings)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums font-bold', totals.net >= 0 ? 'text-chart-1' : 'text-destructive')}>{formatCurrency(totals.net)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

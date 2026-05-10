import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, PiggyBank, DollarSign, Landmark, Plus } from 'lucide-react';
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import PeriodFilter, { usePeriodFilter } from '@/components/ui/period-filter';
import useStore from '@/store/useStore';
import { CATEGORIES, getAllCategories } from '@/lib/constants';
import {
  filterTransactionsByMonth, calculateTotals, formatCurrency,
  groupBySubcategory, getMonthsInYear, getAccountBalance, cn,
} from '@/lib/utils';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const { transactions, accounts, customCategories } = useStore();
  const navigate = useNavigate();
  const period = usePeriodFilter(transactions);
  const { filtered: monthTx, currentMonth } = period;
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const totals = useMemo(() => calculateTotals(monthTx, allCategories), [monthTx, allCategories]);

  const categoryData = useMemo(() =>
    Object.entries(allCategories)
      .filter(([, cat]) => cat.type !== 'income' && cat.type !== 'transfer')
      .map(([key, cat]) => ({
        name: cat.label,
        value: monthTx.filter((t) => t.category === key).reduce((s, t) => s + t.amount, 0),
        fill: cat.hex,
      }))
      .filter((d) => d.value > 0),
  [monthTx, allCategories]);

  const accountBalances = useMemo(() =>
    accounts.map((acc) => ({ ...acc, balance: getAccountBalance(transactions, acc.id, allCategories) })),
  [transactions, accounts, allCategories]);

  const year = currentMonth.split('-')[0];
  const trendData = useMemo(() =>
    getMonthsInYear(parseInt(year)).map((mk) => {
      const mTx = filterTransactionsByMonth(transactions, mk);
      const mt = calculateTotals(mTx, allCategories);
      return { month: MONTHS_SHORT[parseInt(mk.split('-')[1]) - 1], Income: mt.income, Expenses: mt.expenses };
    }),
  [transactions, year, allCategories]);

  const topSpending = useMemo(() => {
    const expTx = monthTx.filter((t) => {
      const type = allCategories[t.category]?.type;
      return type === 'expense';
    });
    return Object.entries(groupBySubcategory(expTx))
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
  }, [monthTx, allCategories]);

  const pieConfig = useMemo(() => Object.fromEntries(categoryData.map((d) => [d.name, { label: d.name, color: d.fill }])), [categoryData]);
  const areaConfig = { Income: { color: 'var(--chart-1)' }, Expenses: { color: 'var(--chart-2)' } };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Dashboard</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Your financial overview at a glance</p>
        </div>
        <div data-tour="month-picker" className="self-start sm:self-auto"><PeriodFilter {...period} /></div>
      </div>

      <div data-tour="stat-cards" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Income', value: totals.income, color: 'text-chart-1', icon: TrendingUp, bg: 'bg-chart-1/15' },
          { label: 'Expenses', value: totals.expenses, color: 'text-destructive', icon: TrendingDown, bg: 'bg-destructive/15' },
          { label: 'Savings', value: totals.savings, color: 'text-chart-3', icon: PiggyBank, bg: 'bg-chart-3/15' },
          { label: 'Investments', value: totals.investments, color: 'text-chart-4', icon: Landmark, bg: 'bg-chart-4/15' },
          { label: 'Net Balance', value: totals.net, color: totals.net >= 0 ? 'text-chart-1' : 'text-destructive', icon: DollarSign, bg: 'bg-muted' },
        ].map(({ label, value, color, icon: Icon, bg }) => (
          <Card key={label} className={label === 'Net Balance' ? 'col-span-2 sm:col-span-1' : ''}>
            <CardContent className="p-3 sm:pt-4 sm:pb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn('size-8 sm:size-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0', bg)}>
                  <Icon className={color} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
                  <p className={cn('text-sm sm:text-lg font-bold tabular-nums truncate', color)}>{formatCurrency(value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {monthTx.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Plus className="text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-1">No transactions yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Start tracking your finances by adding your first transaction for this month.
            </p>
            <Button onClick={() => navigate('/transactions')} className="gap-1.5">
              <Plus data-icon="inline-start" /> Add Transaction
            </Button>
          </CardContent>
        </Card>
      )}

      {totals.income > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Allocation of Income</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {[
                { label: 'Expenses', val: totals.expenses, color: 'var(--chart-2)' },
                { label: 'Savings', val: totals.savings, color: 'var(--chart-3)' },
                { label: 'Investments', val: totals.investments, color: 'var(--chart-4)' },
              ].map(({ label, val, color }) => {
                const p = Math.round((val / totals.income) * 100);
                return (
                  <div key={label} className="text-center">
                    <div className="relative size-12 sm:size-16 mx-auto mb-1.5 sm:mb-2">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--secondary)" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${p}, 100`} className="transition-all duration-700 ease-out" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold">{p}%</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
                    <p className="text-[10px] sm:text-xs font-medium mt-0.5">{formatCurrency(val)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div data-tour="charts" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Spending Breakdown</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <>
                <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[200px] sm:max-h-[250px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {categoryData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-2 justify-center">
                  {categoryData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="size-2 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No expenses this month</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Spending</CardTitle></CardHeader>
          <CardContent>
            {topSpending.length > 0 ? (
              <div className="flex flex-col gap-3">
                {topSpending.map(([name, data], i) => {
                  const maxVal = topSpending[0][1].total;
                  const pctVal = Math.round((data.total / maxVal) * 100);
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{name}</span>
                        <span className="text-muted-foreground tabular-nums">{formatCurrency(data.total)}</span>
                      </div>
                      <Progress value={pctVal} className="h-2" style={{ '--progress-color': `var(--chart-${(i % 5) + 1})` }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No spending this month</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Trend ({year})</CardTitle></CardHeader>
        <CardContent className="px-2 sm:px-6">
          <ChartContainer config={areaConfig} className="h-[220px] sm:h-[280px] w-full">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} interval={0} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}k`} width={40} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
              <Area type="monotone" dataKey="Income" stroke="var(--chart-1)" fill="url(#incomeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Expenses" stroke="var(--chart-2)" fill="url(#expenseGrad)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Account Balances</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accountBalances.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <div
                  className="size-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: `${acc.color}25`, color: acc.color }}
                >
                  {acc.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{acc.name}</p>
                  <p className="text-xs text-muted-foreground">{acc.type}</p>
                </div>
                <p className={cn('text-sm font-bold tabular-nums', acc.balance >= 0 ? 'text-chart-1' : 'text-destructive')}>
                  {formatCurrency(acc.balance)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

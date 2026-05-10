import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PeriodFilter, { usePeriodFilter } from '@/components/ui/period-filter';
import useStore from '@/store/useStore';
import { CATEGORIES, getAllCategories } from '@/lib/constants';
import {
  filterTransactionsByMonth, filterTransactionsByYear, calculateTotals,
  formatCurrency, groupBySubcategory, getMonthsInYear, cn,
} from '@/lib/utils';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Analytics() {
  const { transactions, customCategories } = useStore();
  const period = usePeriodFilter(transactions);
  const [view, setView] = useState('monthly');
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const year = parseInt(period.currentMonth.split('-')[0]);
  const activeTx = useMemo(
    () => view === 'yearly' && period.mode === 'month' ? filterTransactionsByYear(transactions, year) : period.filtered,
    [transactions, period.filtered, period.mode, year, view]
  );
  const totals = useMemo(() => calculateTotals(activeTx, allCategories), [activeTx, allCategories]);

  const pieData = useMemo(() =>
    Object.entries(allCategories)
      .filter(([, cat]) => cat.type !== 'transfer')
      .map(([key, cat]) => ({
        name: cat.label,
        value: activeTx.filter((t) => t.category === key).reduce((s, t) => s + t.amount, 0),
        fill: cat.hex,
      }))
      .filter((d) => d.value > 0),
  [activeTx, allCategories]);

  const subData = useMemo(() => {
    const expTx = activeTx.filter((t) => {
      const type = allCategories[t.category]?.type;
      return type === 'expense';
    });
    const chartVars = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-5)', 'var(--chart-3)', 'var(--chart-4)'];
    return Object.entries(groupBySubcategory(expTx))
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data], i) => ({ name, value: data.total, fill: chartVars[i % chartVars.length] }));
  }, [activeTx, allCategories]);

  const monthlyComparison = useMemo(() =>
    getMonthsInYear(year).map((mk) => {
      const mTx = filterTransactionsByMonth(transactions, mk);
      const mt = calculateTotals(mTx, allCategories);
      return {
        month: MONTHS_SHORT[parseInt(mk.split('-')[1]) - 1],
        Income: mt.income,
        Bills: mTx.filter((t) => t.category === 'bills').reduce((s, t) => s + t.amount, 0),
        Expenses: mTx.filter((t) => t.category === 'expenses').reduce((s, t) => s + t.amount, 0),
        Savings: mt.savings,
        Investments: mt.investments,
      };
    }),
  [transactions, year, allCategories]);

  const radarData = useMemo(() =>
    Object.entries(allCategories)
      .filter(([, cat]) => cat.type !== 'income' && cat.type !== 'transfer')
      .map(([key, cat]) => ({
        category: cat.label,
        amount: activeTx.filter((t) => t.category === key).reduce((s, t) => s + t.amount, 0),
      })),
  [activeTx, allCategories]);

  const expenseTx = useMemo(() => activeTx.filter((t) => {
    const type = allCategories[t.category]?.type;
    return type === 'expense';
  }), [activeTx, allCategories]);

  const pieConfig = useMemo(() => Object.fromEntries(pieData.map((d) => [d.name, { label: d.name, color: d.fill }])), [pieData]);
  const barConfig = { Income: { color: 'var(--chart-1)' }, Bills: { color: 'var(--chart-2)' }, Expenses: { color: 'var(--chart-5)' }, Savings: { color: 'var(--chart-3)' }, Investments: { color: 'var(--chart-4)' } };
  const subBarConfig = useMemo(() => Object.fromEntries(subData.map((d) => [d.name, { label: d.name, color: d.fill }])), [subData]);
  const radarConfig = { amount: { label: 'Amount', color: 'var(--chart-1)' } };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Analytics</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Deep dive into your spending patterns</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {period.mode === 'month' && (
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="monthly" className="text-xs sm:text-sm">Monthly</TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs sm:text-sm">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <PeriodFilter {...period} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Income', val: totals.income, color: 'text-chart-1' },
          { label: 'Outflow', val: totals.expenses + totals.savings + totals.investments, color: 'text-destructive' },
          { label: 'Savings Rate', val: totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : 0, isPct: true, color: 'text-chart-3' },
          { label: 'Net', val: totals.net, color: totals.net >= 0 ? 'text-chart-1' : 'text-destructive' },
        ].map(({ label, val, color, isPct }) => (
          <Card key={label}>
            <CardContent className="p-3 sm:pt-5">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 sm:mb-1">{label}</p>
              <p className={cn('text-base sm:text-xl font-bold truncate', color)}>{isPct ? `${val}%` : formatCurrency(val)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Category Distribution</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[200px] sm:max-h-[250px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-2 justify-center">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="size-2 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-xs text-muted-foreground">{d.name}: {formatCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            {subData.length > 0 ? (
              <ChartContainer config={subBarConfig} className="h-[250px] sm:h-[280px] w-full">
                <BarChart data={subData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} width={80} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {subData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No expenses recorded</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Comparison ({year})</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-[250px] sm:h-[280px] w-full">
              <BarChart data={monthlyComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} interval={0} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}k`} width={40} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
                <Bar dataKey="Income" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Bills" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Expenses" fill="var(--chart-5)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Savings" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Investments" fill="var(--chart-4)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Spending Radar</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={radarConfig} className="mx-auto aspect-square max-h-[200px] sm:max-h-[250px]">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="category" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                <Radar name="Amount" dataKey="amount" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.3} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value)} />} />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Quick Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {[
                { label: 'Total Transactions', value: String(activeTx.length) },
                { label: 'Avg. Transaction', value: activeTx.length > 0 ? formatCurrency(activeTx.reduce((s, t) => s + t.amount, 0) / activeTx.length) : formatCurrency(0) },
                { label: 'Largest Expense', value: expenseTx.length > 0 ? formatCurrency(Math.max(...expenseTx.map((t) => t.amount))) : formatCurrency(0), color: 'text-destructive' },
                { label: 'Savings Rate', value: `${totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : 0}%`, color: 'text-chart-3' },
                { label: 'Investment Rate', value: `${totals.income > 0 ? Math.round((totals.investments / totals.income) * 100) : 0}%`, color: 'text-chart-1' },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} className={cn('flex justify-between items-center', i < arr.length - 1 && 'pb-3 border-b border-border/50')}>
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={cn('text-sm font-bold', color)}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

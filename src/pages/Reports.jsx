import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Download, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import useStore from '@/store/useStore';
import { CATEGORIES } from '@/lib/constants';
import {
  filterTransactionsByMonth, filterTransactionsByYear, filterTransactionsByDateRange,
  calculateTotals, formatCurrency, groupByCategory, groupBySubcategory, groupByAccount,
  getMonthsInYear, getSalaryCycleRange,
} from '@/lib/utils';
import { exportToExcel } from '@/lib/excel';
import DateRangePicker from '@/components/ui/date-range-picker';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Reports() {
  const { transactions, accounts } = useStore();
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

  const totals = useMemo(() => calculateTotals(activeTx), [activeTx]);
  const catGroups = useMemo(() => groupByCategory(activeTx), [activeTx]);
  const accGroups = useMemo(() => groupByAccount(activeTx), [activeTx]);

  const monthlyBreakdown = useMemo(() => {
    if (reportType !== 'yearly') return [];
    return getMonthsInYear(parseInt(selectedYear)).map((mk) => {
      const mTx = filterTransactionsByMonth(transactions, mk);
      const mt = calculateTotals(mTx);
      return { month: MONTHS[parseInt(mk.split('-')[1]) - 1], ...mt, txCount: mTx.length };
    });
  }, [transactions, reportType, selectedYear]);

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
          <span className={`text-xs font-bold uppercase tracking-wider ${titleColor}`}>
            {CATEGORIES[catKey].label}
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
              <span className={`text-sm ${titleColor}`}>Total {CATEGORIES[catKey].label}</span>
              <span className={`text-sm tabular-nums ${titleColor}`}>{formatCurrency(catTotal)}</span>
            </div>
          </>
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground">No {CATEGORIES[catKey].label.toLowerCase()} recorded</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Reports</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Financial audit and summary reports</p>
        </div>
        <Button onClick={handleExport} size="sm"><Download size={14} /> Export</Button>
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
                <SelectContent>{monthOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : reportType === 'yearly' ? (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
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
            <Scale size={18} className="text-chart-1" />
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

            <div className="bg-secondary/40 px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {totals.net >= 0 ? <TrendingUp size={18} className="text-chart-1" /> : <TrendingDown size={18} className="text-destructive" />}
                  <span className="font-bold">Net Result</span>
                </div>
                <span className={`text-lg font-bold tabular-nums ${totals.net >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                  {formatCurrency(totals.net)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Account Usage</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {accounts.map((acc) => {
              const accTx = accGroups[acc.id] || { items: [], total: 0 };
              const accIncome = (accTx.items || []).filter((t) => t.category === 'income').reduce((s, t) => s + t.amount, 0);
              const accExpense = (accTx.items || []).filter((t) => t.category !== 'income' && t.category !== 'transfer').reduce((s, t) => s + t.amount, 0);
              return (
                <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${acc.color}25`, color: acc.color }}>
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
                      <TableCell className={`text-right font-semibold tabular-nums ${row.net >= 0 ? 'text-chart-1' : 'text-destructive'}`}>{formatCurrency(row.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right text-chart-1 tabular-nums font-bold">{formatCurrency(totals.income)}</TableCell>
                    <TableCell className="text-right text-destructive tabular-nums font-bold">{formatCurrency(totals.expenses)}</TableCell>
                    <TableCell className="text-right text-chart-3 tabular-nums font-bold">{formatCurrency(totals.savings)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-bold ${totals.net >= 0 ? 'text-chart-1' : 'text-destructive'}`}>{formatCurrency(totals.net)}</TableCell>
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

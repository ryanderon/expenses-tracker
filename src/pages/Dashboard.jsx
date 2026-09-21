import { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
// Recharts is ~400 kB; the dashboard paints without waiting for it.
const TrendChart = lazy(() => import('@/components/TrendChart'));
import {
  Panel, PanelTitle, StatCard, StackedBar, LegendRow, Meter, Ring,
  InitialBadge, Icon, EmptyState,
} from '@/components/ui/design';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { MonthField } from '@/components/ui/date-fields';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import { useMonthFilter } from '@/hooks/useCycle';
import { getAllCategories } from '@/lib/constants';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import {
  calculateTotals, formatCurrency,
  groupBySubcategory, getMonthsInYear, getAccountBalance, cn,
  getMonthKey,
} from '@/lib/utils';

import QuickAdd from '@/components/QuickAdd';

export default function Dashboard() {
  const t = useT();
  const dates = useDateFormat();
  const [month, setMonth] = useState(() => getMonthKey(new Date()));
  // Month keys are derived from the cycle start day, so a change to it has to
  // invalidate every memo that filters by month.
  const filterByMonth = useMonthFilter();
  const [addOpen, setAddOpen] = useState(false);

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const customCategories = useStore((s) => s.customCategories);

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const monthTx = useMemo(
    () => filterByMonth(transactions, month),
    [filterByMonth, transactions, month]
  );
  const totals = useMemo(() => calculateTotals(monthTx, allCategories), [monthTx, allCategories]);

  const outflow = totals.expenses + totals.savings + totals.investments;

  // --- Spending breakdown: every non-income category with a value ----------
  const breakdown = useMemo(() => {
    const rows = Object.entries(allCategories)
      .filter(([, c]) => c.type !== 'income' && c.type !== 'transfer')
      .map(([key, c]) => ({
        key,
        label: categoryLabel(c, t),
        color: c.hex,
        value: monthTx.filter((x) => x.category === key).reduce((s, x) => s + x.amount, 0),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { rows, total };
  }, [monthTx, allCategories, t]);

  // --- Top spending subcategories ----------------------------------------
  const topSpending = useMemo(() => {
    const expTx = monthTx.filter((x) => allCategories[x.category]?.type === 'expense');
    const rows = Object.entries(groupBySubcategory(expTx))
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
    const max = rows[0]?.[1].total || 1;
    const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
    return rows.map(([name, data], i) => ({
      label: subcategoryLabel(name, t),
      value: data.total,
      pct: Math.round((data.total / max) * 100),
      color: palette[i % palette.length],
    }));
  }, [monthTx, allCategories, t]);

  // --- Allocation rings ---------------------------------------------------
  const allocation = useMemo(() => ([
    { key: 'expenses', label: t('transactions.expenses'), value: totals.expenses, color: 'var(--danger)' },
    { key: 'savings', label: t('categoriesData.savings'), value: totals.savings, color: 'var(--teal)' },
    { key: 'investments', label: t('categoriesData.investments'), value: totals.investments, color: 'var(--violet)' },
  ].map((a) => ({
    ...a,
    pct: totals.income > 0 ? Math.round((a.value / totals.income) * 100) : 0,
  }))), [totals, t]);

  // --- Year trend ---------------------------------------------------------
  const year = Number(month.slice(0, 4));
  const trend = useMemo(
    () => getMonthsInYear(year).map((mk) => {
      const mt = calculateTotals(filterByMonth(transactions, mk), allCategories);
      return {
        month: dates.monthShort(`${mk}-01`).split(' ')[0],
        income: mt.income,
        expenses: mt.expenses + mt.savings + mt.investments,
      };
    }),
    [filterByMonth, transactions, year, allCategories, dates]
  );

  const balances = useMemo(
    () => accounts.map((a) => ({
      ...a,
      balance: getAccountBalance(transactions, a.id, allCategories, a.openingBalance),
    })),
    [accounts, transactions, allCategories]
  );

  const hasData = transactions.length > 0;
  const chartConfig = {
    income: { label: t('transactions.income'), color: 'var(--chart-1)' },
    expenses: { label: t('reports.outflow'), color: 'var(--chart-2)' },
  };

  return (
    <>
      <PageHeader actions={<MonthField value={month} onChange={setMonth} />} />

      <div className="flex flex-col gap-5">
        {/* Hero */}
        <div
          data-tour="stat-cards"
          className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-br from-primary to-[var(--teal)] px-6 py-7 text-primary-foreground shadow-[0_12px_28px_var(--primary-soft)] sm:px-8"
        >
          <div>
            <div className="text-[13px] tracking-[0.03em] opacity-85">
              {t('dashboard.netBalance')}
            </div>
            <div className="mt-1 text-[32px] font-extrabold tracking-[-0.02em] tabular-nums sm:text-[38px]">
              {formatCurrency(totals.net)}
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-xs opacity-80">{t('transactions.income')}</div>
              <div className="text-[17px] font-bold tabular-nums">{formatCurrency(totals.income)}</div>
            </div>
            <div>
              <div className="text-xs opacity-80">{t('reports.outflow')}</div>
              <div className="text-[17px] font-bold tabular-nums">{formatCurrency(outflow)}</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('transactions.income')} value={formatCurrency(totals.income)}
            icon="trending_up" tone="primary" valueClass="text-primary"
          />
          <StatCard
            label={t('transactions.expenses')} value={formatCurrency(totals.expenses)}
            icon="trending_down" tone="danger" valueClass="text-danger"
          />
          <StatCard
            label={t('categoriesData.savings')} value={formatCurrency(totals.savings)}
            icon="savings" tone="teal" valueClass="text-teal"
          />
          <StatCard
            label={t('categoriesData.investments')} value={formatCurrency(totals.investments)}
            icon="account_balance" tone="violet" valueClass="text-violet"
          />
        </div>

        {!hasData && (
          <EmptyState
            icon="receipt_long"
            title={t('transactions.emptyTitle')}
            body={t('transactions.emptyBody')}
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Icon name="add" size={18} /> {t('transactions.add')}
              </Button>
            }
          />
        )}

        {/* Allocation */}
        {totals.income > 0 && (
          <Panel>
            <PanelTitle>{t('reports.allocation')}</PanelTitle>
            <div className="grid grid-cols-3 gap-4 text-center">
              {allocation.map((a) => (
                <div key={a.key}>
                  <Ring pct={a.pct} color={a.color} label={`${a.pct}%`} />
                  <div className="mt-2 text-xs text-muted-foreground">{a.label}</div>
                  <div className="mt-px text-xs font-semibold tabular-nums">{formatCurrency(a.value)}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Breakdown + top spending */}
        <div data-tour="charts" className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelTitle trailing={formatCurrency(breakdown.total)}>
              {t('reports.breakdown')}
            </PanelTitle>
            {breakdown.rows.length > 0 ? (
              <>
                <StackedBar segments={breakdown.rows} />
                <div className="mt-4 flex flex-col gap-2.5">
                  {breakdown.rows.map((r) => (
                    <LegendRow
                      key={r.key}
                      color={r.color}
                      label={r.label}
                      value={formatCurrency(r.value)}
                      pct={Math.round((r.value / breakdown.total) * 100)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noExpenses')}</p>
            )}
          </Panel>

          <Panel>
            <PanelTitle>{t('reports.topSpending')}</PanelTitle>
            {topSpending.length > 0 ? (
              <div className="flex flex-col gap-3.5">
                {topSpending.map((s) => (
                  <div key={s.label}>
                    <div className="mb-1.5 flex justify-between text-[13px]">
                      <span>{s.label}</span>
                      <span className="font-semibold text-muted-foreground tabular-nums">
                        {formatCurrency(s.value)}
                      </span>
                    </div>
                    <Meter pct={s.pct} color={s.color} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noSpending')}</p>
            )}
          </Panel>
        </div>

        {/* Trend */}
        <Panel>
          <PanelTitle>{t('reports.monthlyTrend', { year })}</PanelTitle>
          <Suspense fallback={<div className="h-[210px] sm:h-[240px]" />}>
            <TrendChart data={trend} config={chartConfig} />
          </Suspense>
        </Panel>

        {/* Account balances */}
        <Panel>
          <PanelTitle
            trailing={
              <Link
                to="/accounts"
                className="flex items-center gap-0.5 text-[13px] font-bold text-primary hover:underline"
              >
                {t('dashboard.manageAccounts')}
                <Icon name="chevron_right" size={16} />
              </Link>
            }
          >
            {t('reports.accountBalances')}
          </PanelTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {balances.map((acc) => (
              <Link
                key={acc.id}
                to="/accounts"
                className="flex items-center gap-3 rounded-[14px] bg-background p-3 transition-colors hover:bg-secondary/60"
              >
                <InitialBadge color={acc.color}>{acc.name.charAt(0)}</InitialBadge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{acc.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{acc.type}</div>
                </div>
                <div className={cn(
                  'text-[13px] font-bold tabular-nums',
                  acc.balance >= 0 ? 'text-primary' : 'text-danger'
                )}>
                  {formatCurrency(acc.balance)}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <QuickAdd open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

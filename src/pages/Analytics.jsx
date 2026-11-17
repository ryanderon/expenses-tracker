import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Panel, PanelTitle, StackedBar, LegendRow, Meter,
} from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import { ReportPeriodControls } from '@/components/ui/date-fields';
import useReportPeriod from '@/hooks/useReportPeriod';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import { useMonthFilter } from '@/hooks/useCycle';
import { getAllCategories, isNeutralType } from '@/lib/constants';
import { categoryLabel, topSubcategoryRows } from '@/lib/i18n';
import {
  calculateTotals, formatCurrency, getMonthsInYear, cn,
} from '@/lib/utils';

/** Grouped vertical bars — the design's "Monthly Comparison" panel. */
function ComparisonBars({ months, t }) {
  const max = Math.max(...months.flatMap((m) => [m.income, m.expenses, m.savings]), 1);
  const scroller = useRef(null);
  const latest = months.reduce((at, m, i) => (m.income || m.expenses || m.savings ? i : at), months.length - 1);

  // Start scrolled so the latest month with data sits at the right edge.
  // scrollLeft, not scrollIntoView: that would scroll the page too.
  useLayoutEffect(() => {
    const el = scroller.current;
    const target = el?.querySelector('[data-latest]');
    if (!el || !target || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = target.offsetLeft + target.offsetWidth - el.clientWidth + 12;
  }, [latest, months.length]);
  const series = [
    { key: 'income', color: 'var(--chart-1)', label: t('transactions.income') },
    { key: 'expenses', color: 'var(--chart-2)', label: t('transactions.expenses') },
    { key: 'savings', color: 'var(--chart-4)', label: t('categoriesData.savings') },
  ];

  return (
    <>
      {/* A year of grouped bars needs ~560px. On a phone it scrolls inside the
          card (opening on the latest month with data) instead of spilling out. */}
      <div ref={scroller} className="-mx-1 overflow-x-auto overscroll-x-contain pb-1">
        <div className="flex h-[150px] w-full min-w-max items-end gap-3 px-3 sm:gap-5">
          {months.map((m, i) => (
          <div
            key={m.label}
            data-latest={i === latest || undefined}
            className="flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-full items-end gap-[3px]">
              {series.map((s) => (
                <div
                  key={s.key}
                  title={`${s.label}: ${formatCurrency(m[s.key])}`}
                  style={{
                    width: 10,
                    height: `${Math.max((m[s.key] / max) * 100, 2)}%`,
                    borderRadius: '5px 5px 2px 2px',
                    background: `linear-gradient(180deg, color-mix(in oklch, ${s.color} 80%, white), ${s.color})`,
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
          </div>
          ))}
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}

export default function Analytics() {
  const t = useT();
  const dates = useDateFormat();
  const period = useReportPeriod();
  const { activeTx, chartYear: year } = period;
  const filterByMonth = useMonthFilter();

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const customCategories = useStore((s) => s.customCategories);
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const totals = useMemo(
    () => calculateTotals(activeTx, allCategories, accounts),
    [activeTx, allCategories, accounts]
  );
  const outflow = totals.expenses + totals.savings + totals.investments;

  const distribution = useMemo(() => {
    // Where the money went: income isn't a share of that, so it stays out.
    const rows = Object.entries(allCategories)
      .filter(([, c]) => c.type !== 'income' && !isNeutralType(c.type))
      .map(([key, c]) => ({
        key,
        label: categoryLabel(c, t),
        color: c.hex,
        // Savings includes what the savings accounts grew by, as in the totals.
        value: activeTx.filter((x) => x.category === key).reduce((s, x) => s + x.amount, 0)
          + (key === 'savings' ? totals.savedInAccounts : 0),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
  }, [activeTx, allCategories, totals.savedInAccounts, t]);

  const expenseBars = useMemo(() => {
    const expTx = activeTx.filter((x) => allCategories[x.category]?.type === 'expense');
    const rows = topSubcategoryRows(expTx, allCategories, t, 6);
    const max = rows[0]?.total || 1;
    const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
    return rows.map((r, i) => ({
      label: r.label,
      value: r.total,
      pct: Math.round((r.total / max) * 100),
      color: palette[i % palette.length],
    }));
  }, [activeTx, allCategories, t]);

  const comparison = useMemo(
    () => getMonthsInYear(year).map((mk) => {
      const mt = calculateTotals(filterByMonth(transactions, mk), allCategories, accounts);
      return {
        label: dates.monthShort(`${mk}-01`).split(' ')[0],
        income: mt.income,
        expenses: mt.expenses,
        savings: mt.savings,
      };
    }).filter((m) => m.income + m.expenses + m.savings > 0),
    [filterByMonth, transactions, year, allCategories, accounts, dates]
  );

  const categoryMix = useMemo(() => {
    if (totals.income <= 0) return [];
    // Bills are expense-type too, so they come out of the expense total here
    // rather than being counted in both rows.
    const bills = activeTx.filter((x) => x.category === 'bills').reduce((s, x) => s + x.amount, 0);
    return [
      { label: t('categoriesData.bills'), value: bills, color: 'var(--amber)' },
      { label: t('categoriesData.expenses'), value: totals.expenses - bills, color: 'var(--danger)' },
      { label: t('categoriesData.savings'), value: totals.savings, color: 'var(--teal)' },
      { label: t('categoriesData.investments'), value: totals.investments, color: 'var(--violet)' },
    ].map((c) => ({ ...c, pct: Math.round((c.value / totals.income) * 100) }));
  }, [activeTx, totals, t]);

  const expenseTx = activeTx.filter((x) => allCategories[x.category]?.type === 'expense');
  const savingsRate = totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : 0;
  const investmentRate = totals.income > 0 ? Math.round((totals.investments / totals.income) * 100) : 0;

  const quickStats = [
    { label: t('analytics.totalTransactions'), value: String(activeTx.length) },
    {
      // Spending only: averaging in salaries and transfers says nothing.
      label: t('analytics.avgExpense'),
      value: formatCurrency(expenseTx.length ? expenseTx.reduce((s, x) => s + x.amount, 0) / expenseTx.length : 0),
    },
    {
      label: t('analytics.largestExpense'),
      value: formatCurrency(expenseTx.length ? Math.max(...expenseTx.map((x) => x.amount)) : 0),
      className: 'text-danger',
    },
    { label: t('reports.savingsRate'), value: `${savingsRate}%`, className: 'text-teal' },
    { label: t('analytics.investmentRate'), value: `${investmentRate}%`, className: 'text-violet' },
  ];

  const stats = [
    { label: t('transactions.income'), value: formatCurrency(totals.income), className: 'text-primary' },
    { label: t('reports.outflow'), value: formatCurrency(outflow), className: 'text-danger' },
    { label: t('reports.savingsRate'), value: `${savingsRate}%`, className: 'text-teal' },
    { label: t('reports.net'), value: formatCurrency(totals.net), className: totals.net >= 0 ? 'text-primary' : 'text-danger' },
  ];

  return (
    <>
      <PageHeader
        actions={
          <ReportPeriodControls period={period} />
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{s.label}</div>
              <div className={cn('mt-1 text-[19px] font-extrabold tabular-nums truncate', s.className)}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelTitle trailing={formatCurrency(distribution.total)}>
              {t('analytics.distribution')}
            </PanelTitle>
            {distribution.rows.length > 0 ? (
              <>
                <StackedBar segments={distribution.rows} />
                <div className="mt-4 flex flex-col gap-2.5">
                  {distribution.rows.map((r) => (
                    <LegendRow
                      key={r.key} color={r.color} label={r.label}
                      value={formatCurrency(r.value)}
                      pct={Math.round((r.value / distribution.total) * 100)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noExpenses')}</p>
            )}
          </Panel>

          <Panel>
            <PanelTitle>{t('analytics.expenseBreakdown')}</PanelTitle>
            {expenseBars.length > 0 ? (
              <div className="flex flex-col gap-3">
                {expenseBars.map((b) => (
                  <div key={b.label}>
                    <div className="mb-1 flex justify-between text-[12.5px]">
                      <span>{b.label}</span>
                      <span className="text-muted-foreground tabular-nums">{formatCurrency(b.value)}</span>
                    </div>
                    <Meter pct={b.pct} color={b.color} height={8} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noSpending')}</p>
            )}
          </Panel>

          {/* min-w-0: a grid item otherwise widens to fit the chart and spills
              off a phone screen, instead of letting the chart scroll inside. */}
          <Panel className="min-w-0 xl:col-span-2">
            <PanelTitle>{t('analytics.monthlyComparison')}</PanelTitle>
            {comparison.length > 0 ? (
              <ComparisonBars months={comparison} t={t} />
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noExpenses')}</p>
            )}
          </Panel>

          <Panel>
            <PanelTitle>{t('analytics.categoryMix')}</PanelTitle>
            {categoryMix.length > 0 ? (
              <div className="flex flex-col gap-3">
                {categoryMix.map((c) => (
                  <div key={c.label}>
                    <div className="mb-1 flex justify-between text-[12.5px]">
                      <span>{c.label}</span>
                      <span className="text-muted-foreground tabular-nums">{c.pct}%</span>
                    </div>
                    <Meter pct={c.pct} color={c.color} height={8} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">{t('reports.noExpenses')}</p>
            )}
          </Panel>

          <Panel>
            <PanelTitle>{t('analytics.quickStats')}</PanelTitle>
            <div className="flex flex-col gap-2.5">
              {quickStats.map((q, i) => (
                <div
                  key={q.label}
                  className={cn(
                    'flex justify-between pb-2.5 text-[13px]',
                    i < quickStats.length - 1 && 'border-b border-border'
                  )}
                >
                  <span className="text-muted-foreground">{q.label}</span>
                  <span className={cn('font-bold tabular-nums', q.className)}>{q.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

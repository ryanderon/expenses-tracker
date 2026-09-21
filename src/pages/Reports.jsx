import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Panel, PanelTitle, SegmentedTabs, Meter, IconBadge, InitialBadge, Icon,
} from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import { MonthField } from '@/components/ui/date-fields';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import { useMonthFilter } from '@/hooks/useCycle';
import { getAllCategories } from '@/lib/constants';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import {
  filterTransactionsByYear, calculateTotals,
  formatCurrency, groupBySubcategory, cn,
  getMonthKey,
} from '@/lib/utils';
import { exportToExcel } from '@/lib/excel';

/** Accent per report group, following the design's coloured group headers. */
const GROUP_TONE = {
  income: 'var(--primary)',
  bills: 'var(--amber)',
  expenses: 'var(--danger)',
  savings: 'var(--teal)',
  investments: 'var(--violet)',
};

const GRADE_TEXT = {
  teal: 'text-teal',
  primary: 'text-primary',
  amber: 'text-amber',
  danger: 'text-danger',
};

/**
 * Savings rate drives the headline grade, as the design's "Great Saver" badge
 * does. Thresholds follow the 20% rule its copy cites.
 */
function gradeFor(savingsRate, expenseRate) {
  if (expenseRate >= 95) return { key: 'Risky', tone: 'danger', icon: 'warning' };
  if (savingsRate >= 30) return { key: 'Great', tone: 'teal', icon: 'military_tech' };
  if (savingsRate >= 20) return { key: 'Good', tone: 'primary', icon: 'trending_up' };
  return { key: 'Okay', tone: 'amber', icon: 'info' };
}

export default function Reports() {
  const t = useT();
  const dates = useDateFormat();

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const customCategories = useStore((s) => s.customCategories);

  const [period, setPeriod] = useState('monthly');
  const [month, setMonth] = useState(() => getMonthKey(new Date()));
  const filterByMonth = useMonthFilter();

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const year = Number(month.slice(0, 4));

  const activeTx = useMemo(
    () => (period === 'yearly'
      ? filterTransactionsByYear(transactions, year)
      : filterByMonth(transactions, month)),
    [filterByMonth, transactions, period, year, month]
  );

  const totals = useMemo(() => calculateTotals(activeTx, allCategories), [activeTx, allCategories]);

  const groups = useMemo(() => Object.entries(allCategories)
    .filter(([, c]) => c.type !== 'transfer')
    .map(([key, c]) => {
      const catTx = activeTx.filter((x) => x.category === key);
      const subs = Object.entries(groupBySubcategory(catTx))
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data]) => ({ name: subcategoryLabel(name, t), value: data.total }));
      return {
        key,
        label: categoryLabel(c, t),
        color: GROUP_TONE[key] || c.hex,
        subs,
        total: catTx.reduce((s, x) => s + x.amount, 0),
      };
    })
    .filter((g) => g.subs.length > 0),
  [activeTx, allCategories, t]);

  const savingsRate = totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : 0;
  const investmentRate = totals.income > 0 ? Math.round((totals.investments / totals.income) * 100) : 0;
  const expenseRate = totals.income > 0 ? Math.round((totals.expenses / totals.income) * 100) : 0;
  const grade = gradeFor(savingsRate, expenseRate);

  const meters = [
    { label: t('health.savingsRate'), icon: 'savings', color: 'var(--teal)', pct: savingsRate, amount: totals.savings },
    { label: t('health.investmentRate'), icon: 'account_balance', color: 'var(--violet)', pct: investmentRate, amount: totals.investments },
    { label: t('health.expenseRate'), icon: 'trending_down', color: 'var(--danger)', pct: expenseRate, amount: totals.expenses },
  ];

  const insights = [];
  if (expenseRate > 70) insights.push(t('reports.insightExpenseHigh'));
  else if (expenseRate > 0) insights.push(t('reports.insightExpenseLow'));
  if (savingsRate > 0 && savingsRate < 20) insights.push(t('health.gradeOkayBody'));
  else if (savingsRate >= 20) insights.push(t('health.gradeGoodBody'));

  const usage = useMemo(() => accounts.map((a) => {
    const rows = activeTx.filter((x) => x.account === a.id || x.toAccount === a.id);
    return {
      ...a,
      txCount: rows.length,
      income: rows
        .filter((x) => allCategories[x.category]?.type === 'income')
        .reduce((s, x) => s + x.amount, 0),
      expense: rows
        .filter((x) => {
          const type = allCategories[x.category]?.type;
          return type !== 'income' && type !== 'transfer';
        })
        .reduce((s, x) => s + x.amount, 0),
    };
  }).filter((a) => a.txCount > 0), [accounts, activeTx, allCategories]);

  const periodLabel = period === 'yearly' ? String(year) : dates.month(`${month}-01`);

  return (
    <>
      <PageHeader
        actions={
          <>
            <SegmentedTabs
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'monthly', label: t('reports.monthly') },
                { value: 'yearly', label: t('reports.yearly') },
              ]}
            />
            <MonthField value={month} onChange={setMonth} />
            <Button
              variant="outline"
              onClick={() => exportToExcel(activeTx, accounts, `penny-${period}-${month}`)}
              className="rounded-xl px-4 py-2.5 font-semibold"
            >
              <Icon name="download" size={17} /> {t('reports.export')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-(--shadow-card)">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-bold">{t('reports.summaryTitle')}</h3>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>

          {groups.length > 0 ? (
            <>
              {groups.map((g) => (
                <div key={g.key} className="border-b border-border">
                  <div
                    className="bg-background px-5 py-2.5 text-xs font-bold uppercase tracking-[0.05em]"
                    style={{ color: g.color }}
                  >
                    {g.label}
                  </div>
                  {g.subs.map((s) => (
                    <div
                      key={s.name}
                      className="flex justify-between border-b border-border px-5 py-2.5 text-[13px]"
                    >
                      <span className="pl-3 text-muted-foreground">{s.name}</span>
                      <span className="tabular-nums">{formatCurrency(s.value)}</span>
                    </div>
                  ))}
                  <div
                    className="flex justify-between bg-background px-5 py-3 text-[13px] font-bold"
                    style={{ color: g.color }}
                  >
                    <span>{t('reports.totalLabel', { name: g.label })}</span>
                    <span className="tabular-nums">{formatCurrency(g.total)}</span>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between bg-[var(--primary-soft)] px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Icon name="trending_up" size={20} className="text-primary" />
                  {t('reports.netResult')}
                </div>
                <span className={cn(
                  'text-[17px] font-extrabold tabular-nums',
                  totals.net >= 0 ? 'text-primary' : 'text-danger'
                )}>
                  {formatCurrency(totals.net)}
                </span>
              </div>
            </>
          ) : (
            <p className="px-5 py-14 text-center text-sm text-muted-foreground">
              {t('reports.noExpenses')}
            </p>
          )}
        </div>

        <Panel>
          <div className="mb-4 flex items-center gap-2 text-sm font-bold">
            <Icon name="military_tech" size={20} className="text-violet" />
            {t('health.title')}
          </div>

          <div className="mb-5 flex items-center gap-4 rounded-2xl bg-background p-4">
            <IconBadge name={grade.icon} tone={grade.tone} size={52} />
            <div>
              <div className={cn('text-lg font-extrabold', GRADE_TEXT[grade.tone])}>
                {t(`health.grade${grade.key}`)}
              </div>
              <div className="text-[13px] text-muted-foreground">
                {t(`health.grade${grade.key}Body`)}
              </div>
            </div>
          </div>

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            {meters.map((m) => (
              <div key={m.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <Icon name={m.icon} size={15} style={{ color: m.color }} />
                    {m.label}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: m.color }}>
                    {m.pct}%
                  </span>
                </div>
                <Meter pct={m.pct} color={m.color} />
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {t('health.ofIncome', {
                    amount: formatCurrency(m.amount),
                    income: formatCurrency(totals.income),
                  })}
                </div>
              </div>
            ))}
          </div>

          {insights.length > 0 && (
            <div className="flex flex-col gap-2">
              {insights.map((line) => (
                <div key={line} className="flex gap-2 text-[13px] text-muted-foreground">
                  <span className="shrink-0 text-amber">•</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle>{t('reports.accountUsage')}</PanelTitle>
          {usage.length > 0 ? (
            <div className="flex flex-col gap-2">
              {usage.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-[14px] bg-background p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <InitialBadge color={a.color} size={32} radius={10}>
                      {a.name.charAt(0)}
                    </InitialBadge>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('accounts.transactionsCount', { count: a.txCount })}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs tabular-nums text-primary">
                      +{formatCurrency(a.income)}
                    </div>
                    <div className="text-xs tabular-nums text-danger">
                      −{formatCurrency(a.expense)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('reports.noExpenses')}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

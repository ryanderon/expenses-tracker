import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, ArrowRight, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import { getAllCategories } from '@/lib/constants';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import { formatCurrency, getMonthKey, cn } from '@/lib/utils';
import { buildBudgetReport, getDailyAllowance } from '@/lib/budget';
import QuickAdd from '@/components/QuickAdd';
import PageHeader from '@/components/PageHeader';

/**
 * The number you came for, drawn as a ring.
 *
 * `pct` is how much of today's allowance is already spent, so the ring fills
 * as the day goes on rather than draining.
 */
function AllowanceRing({ pct, tone, children }) {
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(pct, 100) / 100) * circumference;

  return (
    <div className="relative mx-auto size-56 sm:size-64">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle
          cx="100" cy="100" r={radius}
          fill="none" stroke="var(--secondary)" strokeWidth="6"
        />
        <circle
          cx="100" cy="100" r={radius}
          fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {children}
      </div>
    </div>
  );
}

function Alerts({ report, t }) {
  const alerts = report.alerts.slice(0, 3);
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((cat) => {
        const over = cat.isOver;
        const label = categoryLabel({ label: cat.label, labelKey: cat.labelKey }, t);

        let body;
        if (over) {
          body = t('today.overspentBody', {
            category: label,
            amount: formatCurrency(cat.spent - cat.effectiveBudget),
          });
        } else if (cat.isNearLimit) {
          body = t('today.nearLimitBody', { category: label, percent: cat.pctRaw });
        } else {
          body = t('today.trendingOverBody', {
            category: label,
            amount: formatCurrency(cat.pacing.projected),
            limit: formatCurrency(cat.effectiveBudget),
          });
        }

        return (
          <div key={cat.key} className="flex items-start gap-3">
            <span
              className="mt-1.5 size-1.5 rounded-full shrink-0"
              style={{ backgroundColor: over ? 'var(--destructive)' : 'var(--chart-2)' }}
            />
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        );
      })}
    </div>
  );
}

function EntryRow({ tx, allCategories, accounts, t, dates }) {
  const cat = allCategories[tx.category];
  const isIncome = cat?.type === 'income';
  const account = accounts.find((a) => a.id === tx.account);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className="size-8 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-semibold"
        style={{ backgroundColor: `${cat?.hex || '#999'}1f`, color: cat?.hex || '#999' }}
      >
        {(categoryLabel(cat, t) || '?').charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{subcategoryLabel(tx.subcategory, t) || categoryLabel(cat, t)}</p>
        <p className="text-xs text-muted-foreground truncate">
          {dates.short(tx.date)}
          {account && ` · ${account.name}`}
          {tx.note && ` · ${tx.note}`}
        </p>
      </div>
      <p className={cn(
        'text-sm font-medium tabular-nums shrink-0',
        isIncome ? 'text-chart-1' : 'text-foreground'
      )}>
        {isIncome ? '+' : '−'}{formatCurrency(tx.amount)}
      </p>
    </div>
  );
}

export default function Today() {
  const t = useT();
  const dates = useDateFormat();
  const [addOpen, setAddOpen] = useState(false);

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const budgets = useStore((s) => s.budgets);
  const subBudgets = useStore((s) => s.subBudgets);
  const budgetTemplate = useStore((s) => s.budgetTemplate);
  const budgetSettings = useStore((s) => s.budgetSettings);
  const customCategories = useStore((s) => s.customCategories);
  const customSubcategories = useStore((s) => s.customSubcategories);

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const monthKey = getMonthKey(new Date());
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const report = useMemo(
    () => buildBudgetReport({
      monthKey, transactions, allCategories, customSubcategories, customCategories,
      budgets, subBudgets, budgetTemplate, budgetSettings,
    }),
    [monthKey, transactions, allCategories, customSubcategories, customCategories,
      budgets, subBudgets, budgetTemplate, budgetSettings]
  );

  const daily = useMemo(
    () => getDailyAllowance(monthKey, report.totalBudget, transactions, allCategories),
    [monthKey, report.totalBudget, transactions, allCategories]
  );

  const todayEntries = useMemo(
    () => transactions
      .filter((tx) => String(tx.date).slice(0, 10) === todayKey)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [transactions, todayKey]
  );

  const recentEntries = useMemo(
    () => [...transactions]
      .filter((tx) => String(tx.date).slice(0, 10) !== todayKey)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5),
    [transactions, todayKey]
  );

  const hasData = transactions.length > 0;
  const hasBudget = report.totalBudget > 0;

  const tone = daily.isOver
    ? 'var(--destructive)'
    : daily.pctUsed >= 80 ? 'var(--chart-2)' : 'var(--chart-1)';

  return (
    <>
      <PageHeader subtitle={dates.dayLong(new Date())} />
      <div className="flex flex-col gap-8">

      {/* Hero */}
      {hasBudget && daily.applicable ? (
        <div data-tour="today-hero" className="flex flex-col items-center gap-6">
          <AllowanceRing pct={daily.pctUsed} tone={tone}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              {daily.left >= 0 ? t('today.leftToday') : t('today.overToday')}
            </p>
            <p
              className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight"
              style={{ color: daily.left >= 0 ? undefined : 'var(--destructive)' }}
            >
              {formatCurrency(Math.abs(daily.left))}
            </p>
          </AllowanceRing>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('today.allowanceLine', { amount: formatCurrency(daily.allowance) })}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {daily.daysLeft <= 1
                ? t('today.lastDay')
                : t('today.daysLeft', { count: daily.daysLeft })}
            </p>
          </div>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Target className="text-primary size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">
                {hasData ? t('today.noBudgetTitle') : t('today.noDataTitle')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                {hasData ? t('today.noBudgetBody') : t('today.noDataBody')}
              </p>
            </div>
            {hasData ? (
              <Button asChild size="sm">
                <Link to="/budget">{t('today.noBudgetAction')}</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus data-icon="inline-start" /> {t('today.addExpense')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Button data-tour="today-add" size="lg" className="w-full" onClick={() => setAddOpen(true)}>
        <Plus data-icon="inline-start" /> {t('today.addExpense')}
      </Button>

      {report.alerts.length > 0 && (
        <>
          <Separator />
          <Alerts report={report} t={t} />
        </>
      )}

      {/* Month context */}
      {hasBudget && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{t('today.monthSoFar')}</h3>
              <Link
                to="/budget"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {t('nav.budget')} <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('today.monthSpent')}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatCurrency(report.totalSpent)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t('today.monthRemaining')}</p>
                <p className={cn(
                  'text-lg font-semibold tabular-nums',
                  report.totalRemaining < 0 && 'text-destructive'
                )}>
                  {formatCurrency(report.totalRemaining)}
                </p>
              </div>
            </div>

            <div className="relative">
              <Progress
                value={report.totalPct}
                className="h-1.5"
                style={{ '--progress-color': report.totalPctRaw > 100 ? 'var(--destructive)' : undefined }}
              />
              {report.pacing.isCurrent && report.pacing.elapsedPct < 100 && (
                <div
                  className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground/40"
                  style={{ left: `${report.pacing.elapsedPct}%` }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Today's entries */}
      <Separator />
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-sm font-semibold">{t('today.spentToday')}</h3>
          {daily.spentToday > 0 && (
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(daily.spentToday)}
            </p>
          )}
        </div>

        {todayEntries.length > 0 ? (
          <div className="divide-y divide-border/60">
            {todayEntries.map((tx) => (
              <EntryRow
                key={tx.id} tx={tx} allCategories={allCategories}
                accounts={accounts} t={t} dates={dates}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">{t('today.noSpendToday')}</p>
        )}
      </div>

      {/* Recent */}
      {recentEntries.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-sm font-semibold">{t('today.recentTitle')}</h3>
              <Link
                to="/transactions"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {t('today.seeAll')} <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/60">
              {recentEntries.map((tx) => (
                <EntryRow
                  key={tx.id} tx={tx} allCategories={allCategories}
                  accounts={accounts} t={t} dates={dates}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <QuickAdd open={addOpen} onOpenChange={setAddOpen} />
      </div>
    </>
  );
}

function Separator() {
  return <hr className="border-border" />;
}

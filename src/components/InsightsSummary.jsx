import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useStore from '@/store/useStore';
import { buildInsights } from '@/lib/insights';
import { useT } from '@/hooks/useT';
import { cn } from '@/lib/utils';
import { Panel, PanelTitle, IconBadge, Meter, Ring, EmptyState } from '@/components/ui/design';

const TONE_BADGE = { good: 'primary', warn: 'amber', bad: 'danger', info: 'teal' };

const GRADE_COLOR = {
  great: 'var(--primary)',
  good: 'var(--teal)',
  fair: 'var(--amber)',
  weak: 'var(--danger)',
};

const scoreColor = (score) =>
  score >= 0.75 ? 'var(--primary)' : score >= 0.4 ? 'var(--amber)' : 'var(--danger)';

function HealthPanel({ health }) {
  const t = useT();

  if (health.score == null) {
    return (
      <Panel>
        <PanelTitle>{t('insights.health.title')}</PanelTitle>
        <p className="text-sm text-muted-foreground">{t('insights.health.notEnough')}</p>
      </Panel>
    );
  }

  const basis = health.basis === 'trailing'
    ? t('insights.health.basisTrailing', { count: health.basisMonths })
    : t(health.basis === 'partial' ? 'insights.health.basisPartial' : 'insights.health.basisPeriod');

  return (
    <Panel>
      <div className="flex items-center gap-4">
        <Ring pct={health.score} color={GRADE_COLOR[health.grade]} label={health.score} size={76} />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
            {t('insights.health.title')}
          </p>
          <p className="text-lg font-extrabold" style={{ color: GRADE_COLOR[health.grade] }}>
            {t(`insights.health.grades.${health.grade}`)}
          </p>
          <p className="text-xs text-muted-foreground">{basis}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {health.components.map((c) => (
          <div key={c.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-bold">{t(`insights.health.components.${c.id}.label`)}</span>
              <span className="text-[13px] font-extrabold tabular-nums">{c.value}</span>
            </div>
            <Meter pct={c.score * 100} color={scoreColor(c.score)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(`insights.health.components.${c.id}.hint`)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function InsightCard({ item }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]',
        item.tone === 'bad' && 'border-danger/40'
      )}
    >
      <IconBadge name={item.icon} tone={TONE_BADGE[item.tone]} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{item.title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
        {item.items && (
          <div className="mt-3 flex flex-col divide-y divide-border/60 rounded-xl border border-border">
            {item.items.map((row) => (
              <div key={row.label} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{row.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{row.value}</p>
                </div>
                <span className="shrink-0 text-[13px] font-extrabold text-primary tabular-nums">
                  {row.trailing}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InsightsSummary({ monthKey }) {
  const t = useT();
  const data = useStore(useShallow((s) => ({
    transactions: s.transactions,
    accounts: s.accounts,
    customCategories: s.customCategories,
    customSubcategories: s.customSubcategories,
    budgets: s.budgets,
    subBudgets: s.subBudgets,
    budgetTemplate: s.budgetTemplate,
    // Listed so a change to the cycle start day recomputes the periods.
    budgetSettings: s.budgetSettings,
  })));

  const result = useMemo(() => buildInsights(data, { monthKey, t }), [data, monthKey, t]);

  if (!data.transactions.length) {
    return <EmptyState icon="insights" title={t('insights.noDataTitle')} body={t('insights.noDataBody')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <HealthPanel health={result.health} />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">{t('insights.insightsHeading')}</h3>
        {result.insights.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {result.insights.map((item) => <InsightCard key={item.id} item={item} />)}
          </div>
        ) : (
          <p className="rounded-[18px] border border-dashed border-border p-4 text-sm text-muted-foreground">
            {result.period.expense > 0 ? t('insights.nothingToFlag') : t('insights.summaryEmpty')}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">{t('insights.howItWorks')}</p>
      </div>
    </div>
  );
}

import { startOfDay, subDays } from 'date-fns';
import { getAllCategories } from '@/lib/constants';
import {
  formatCurrency, getMonthKey, getMonthRange, getPeriodDays, getPeriodDayIndex,
  isCurrentPeriod, getAccountBalance,
} from '@/lib/utils';
import { buildBudgetReport, shiftMonth, subKey } from '@/lib/budget';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';

/**
 * Rule-based insights — the same questions the AI tab answers, worked out
 * locally from the user's own history so they cost nothing and need no key.
 *
 * Every threshold is relative to the user's own past where possible: "high"
 * means high *for you*, not against some national average. Comparisons for the
 * current period are made against the same number of days into previous
 * periods, so a rent payment on the 1st doesn't read as a spending spike on
 * the 2nd.
 */

const LOOKBACK = 6;
const DAY_MS = 86_400_000;
const SMALL_TX = 50_000;
const WEEKEND_WINDOW_DAYS = 56;

/** Account types that hold money you can't spend tomorrow. */
const ILLIQUID_ACCOUNT = /invest|saham|stock|reksa|crypto|kripto|bibit|pension|pensiun/i;

const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function quantile(xs, q) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const splitKey = (key) => key.split('::');

/** 1-based day of `date` inside the period that starts at `start`. */
function dayInPeriod(date, start) {
  return Math.floor((startOfDay(new Date(date)) - start) / DAY_MS) + 1;
}

/**
 * Totals for one period. `cutoff` limits it to the first N days, which is how
 * "so far this month" gets compared like for like with earlier months.
 */
function summarise(txs, monthKey, allCategories, cutoff = Infinity) {
  const { start } = getMonthRange(monthKey);
  const out = {
    income: 0, expense: 0, saved: 0, count: 0,
    smallCount: 0, smallSum: 0,
    bySub: {}, subCount: {}, spendDays: new Set(), items: [],
  };

  for (const t of txs) {
    const day = dayInPeriod(t.date, start);
    if (day > cutoff) continue;
    const type = allCategories[t.category]?.type;

    if (type === 'income') out.income += t.amount;
    else if (type === 'savings' || type === 'investment') out.saved += t.amount;
    else if (type === 'expense') {
      const key = subKey(t.category, t.subcategory || 'Other');
      out.expense += t.amount;
      out.count += 1;
      out.bySub[key] = (out.bySub[key] || 0) + t.amount;
      out.subCount[key] = (out.subCount[key] || 0) + 1;
      out.spendDays.add(day);
      out.items.push({ ...t, key });
      if (t.amount < SMALL_TX) {
        out.smallCount += 1;
        out.smallSum += t.amount;
      }
    }
  }
  return out;
}

/**
 * Subcategories paid once or twice a month at nearly the same amount — rent,
 * subscriptions, insurance. They're excluded from "where to cut" because
 * they can't be trimmed by spending less on a Tuesday. The payment count is
 * what keeps a steady daily coffee habit from passing as a bill.
 */
function detectFixed(priorsFull) {
  if (priorsFull.length < 3) return {};
  const minMonths = Math.ceil(priorsFull.length * 0.6);
  const keys = new Set(priorsFull.flatMap((p) => Object.keys(p.bySub)));
  const fixed = {};

  for (const key of keys) {
    const amounts = priorsFull.map((p) => p.bySub[key]).filter(Boolean);
    if (amounts.length < minMonths) continue;
    const perMonth = mean(priorsFull.filter((p) => p.subCount[key]).map((p) => p.subCount[key]));
    if (perMonth > 2) continue;
    const avg = mean(amounts);
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (avg > 0 && spread / avg < 0.25) fixed[key] = avg;
  }
  return fixed;
}

export function buildInsights(state, { monthKey, t, now = new Date() }) {
  const {
    transactions, accounts, customCategories, customSubcategories,
    budgets, subBudgets, budgetTemplate, budgetSettings,
  } = state;

  const allCategories = getAllCategories(customCategories);
  const fmt = formatCurrency;

  /** "Other" alone is meaningless, so it borrows its category's name. */
  const nameOf = (key) => {
    const [cat, sub] = splitKey(key);
    return sub && sub !== 'Other'
      ? subcategoryLabel(sub, t)
      : categoryLabel(allCategories[cat], t) || cat;
  };

  const byMonth = {};
  for (const tx of transactions) (byMonth[getMonthKey(tx.date)] ??= []).push(tx);

  const isCurrent = isCurrentPeriod(monthKey, now);
  const totalDays = getPeriodDays(monthKey);
  const dayIndex = isCurrent ? getPeriodDayIndex(monthKey, now) : totalDays;
  const cutoff = isCurrent ? dayIndex : Infinity;

  const priorKeys = Array.from({ length: LOOKBACK }, (_, i) => shiftMonth(monthKey, -(i + 1)))
    .filter((m) => byMonth[m]?.length);

  const cur = summarise(byMonth[monthKey] || [], monthKey, allCategories, cutoff);
  const priorsToDate = priorKeys.map((m) => summarise(byMonth[m], m, allCategories, cutoff));
  const priorsFull = priorKeys.map((m) => summarise(byMonth[m], m, allCategories));

  const avgMonthlyExpense = mean(priorsFull.map((p) => p.expense));
  const avgMonthlyIncome = mean(priorsFull.filter((p) => p.income > 0).map((p) => p.income));
  // Anything smaller than this is noise, not an insight.
  const minAbs = Math.max(50_000, avgMonthlyExpense * 0.05);

  const fixed = detectFixed(priorsFull);
  const fixedTotal = sum(Object.values(fixed));

  const insights = [];
  const add = (item) => insights.push(item);

  // --- Projection ----------------------------------------------------------
  // What the rest of the month usually costs you, added to what you've spent.
  // Beats a straight line because it knows bills land early and weekends run
  // hot.
  let projected = null;
  if (isCurrent && dayIndex < totalDays && cur.expense > 0) {
    if (priorKeys.length >= 2) {
      projected = cur.expense + mean(priorsFull.map((p, i) => p.expense - priorsToDate[i].expense));
    } else if (dayIndex >= 7) {
      projected = (cur.expense / dayIndex) * totalDays;
    }
  }

  // --- Pace vs your own usual ---------------------------------------------
  if (priorKeys.length >= 2 && cur.expense > 0) {
    const usual = mean(priorsToDate.map((p) => p.expense));
    const diff = usual > 0 ? (cur.expense - usual) / usual : 0;
    const dir = diff >= 0.15 ? 'Up' : diff <= -0.15 ? 'Down' : 'Steady';
    const vars = { amount: fmt(cur.expense), usual: fmt(usual), pct: Math.abs(Math.round(diff * 100)) };
    let body = t(`insights.rules.pace${dir}${isCurrent ? 'ToDate' : ''}`, vars);
    if (projected != null) body += ` ${t('insights.rules.projection', { amount: fmt(projected) })}`;

    add({
      id: 'pace',
      tone: dir === 'Up' ? 'warn' : dir === 'Down' ? 'good' : 'info',
      icon: dir === 'Up' ? 'trending_up' : dir === 'Down' ? 'trending_down' : 'speed',
      title: t(`insights.rules.pace${dir}Title`),
      body,
      priority: dir === 'Up' ? 80 : 40,
    });
  }

  // --- Budget --------------------------------------------------------------
  const report = buildBudgetReport({
    monthKey, transactions, allCategories, customSubcategories, customCategories,
    budgets, subBudgets, budgetTemplate, budgetSettings, now,
  });
  const budgeted = report.categories.filter((c) => c.effectiveBudget > 0);
  const labelOf = (c) => (c.labelKey ? t(c.labelKey) : c.label);

  const over = budgeted.filter((c) => c.isOver).sort((a, b) => a.remaining - b.remaining);
  for (const c of over.slice(0, 2)) {
    add({
      id: `budgetOver-${c.key}`,
      tone: 'bad',
      icon: 'error',
      title: t('insights.rules.budgetOverTitle', { category: labelOf(c) }),
      body: t('insights.rules.budgetOver', {
        category: labelOf(c), amount: fmt(-c.remaining), limit: fmt(c.effectiveBudget),
      }),
      priority: 100,
    });
  }

  const trending = budgeted.filter((c) => !c.isOver && c.pacing.isCurrent && c.pacing.projectedOver);
  for (const c of trending.slice(0, 2)) {
    add({
      id: `budgetTrending-${c.key}`,
      tone: 'warn',
      icon: 'warning',
      title: t('insights.rules.budgetTrendingTitle', { category: labelOf(c) }),
      body: t('insights.rules.budgetTrending', {
        category: labelOf(c),
        projected: fmt(c.pacing.projected),
        limit: fmt(c.effectiveBudget),
        daily: fmt(Math.max(c.remaining, 0) / Math.max(c.pacing.daysLeft, 1)),
      }),
      priority: 85,
    });
  }

  if (budgeted.length && !over.length && !trending.length) {
    add({
      id: 'budgetOk',
      tone: 'good',
      icon: 'verified',
      title: t('insights.rules.budgetOkTitle'),
      body: isCurrent
        ? t('insights.rules.budgetOkToDate', { daily: fmt(report.pacing.dailySafe) })
        : t('insights.rules.budgetOk', { amount: fmt(report.totalRemaining) }),
      priority: 20,
    });
  }

  // --- Biggest movers, by subcategory --------------------------------------
  if (priorKeys.length >= 2) {
    const keys = new Set([...Object.keys(cur.bySub), ...priorsToDate.flatMap((p) => Object.keys(p.bySub))]);
    const movers = [...keys]
      .map((key) => {
        const amount = cur.bySub[key] || 0;
        const usual = mean(priorsToDate.map((p) => p.bySub[key] || 0));
        return { key, amount, usual, delta: amount - usual };
      })
      .filter((m) => Math.abs(m.delta) >= minAbs && (m.usual === 0 || Math.abs(m.delta) / m.usual >= 0.3));

    const ups = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
    const down = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta)[0];

    for (const m of ups) {
      const isNew = m.usual < minAbs / 5;
      add({
        id: `up-${m.key}`,
        tone: 'warn',
        icon: 'arrow_upward',
        title: t(isNew ? 'insights.rules.subNewTitle' : 'insights.rules.subUpTitle', { name: nameOf(m.key) }),
        body: t(isNew ? 'insights.rules.subNew' : 'insights.rules.subUp', {
          name: nameOf(m.key),
          amount: fmt(m.amount),
          usual: fmt(m.usual),
          pct: pct(m.delta, m.usual),
          delta: fmt(m.delta),
        }),
        priority: 70,
      });
    }
    if (down) {
      add({
        id: `down-${down.key}`,
        tone: 'good',
        icon: 'arrow_downward',
        title: t('insights.rules.subDownTitle', { name: nameOf(down.key) }),
        body: t('insights.rules.subDown', {
          name: nameOf(down.key),
          amount: fmt(down.amount),
          usual: fmt(down.usual),
          delta: fmt(-down.delta),
        }),
        priority: 30,
      });
    }
  }

  // --- Savings rate and deficit --------------------------------------------
  if (cur.income > 0) {
    const rate = cur.saved / cur.income;
    const priorRates = priorsFull.filter((p) => p.income > 0).map((p) => p.saved / p.income);
    const avgRate = mean(priorRates);
    let body = t('insights.rules.savingsRate', { pct: Math.round(rate * 100), amount: fmt(cur.saved) });
    if (priorRates.length >= 2 && Math.abs(rate - avgRate) >= 0.05) {
      body += ` ${t(rate > avgRate ? 'insights.rules.savingsRateUp' : 'insights.rules.savingsRateDown', {
        pct: Math.round(avgRate * 100),
      })}`;
    }
    const tone = rate >= 0.2 ? 'good' : rate < 0.1 ? 'warn' : 'info';
    add({
      id: 'savingsRate',
      tone,
      icon: 'savings',
      title: t('insights.rules.savingsRateTitle', { pct: Math.round(rate * 100) }),
      body,
      priority: tone === 'warn' ? 60 : tone === 'good' ? 25 : 35,
    });

    if (cur.expense > cur.income) {
      add({
        id: 'deficit',
        tone: 'bad',
        icon: 'money_off',
        title: t('insights.rules.deficitTitle'),
        body: t('insights.rules.deficit', {
          expense: fmt(cur.expense), income: fmt(cur.income), gap: fmt(cur.expense - cur.income),
        }),
        priority: 95,
      });
    }
  } else if (!isCurrent && cur.expense > 0) {
    add({
      id: 'noIncome',
      tone: 'info',
      icon: 'help',
      title: t('insights.rules.noIncomeTitle'),
      body: t('insights.rules.noIncome'),
      priority: 10,
    });
  }

  // --- Fixed costs ---------------------------------------------------------
  if (fixedTotal > 0) {
    const names = Object.entries(fixed)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => nameOf(key))
      .join(', ');
    const share = pct(fixedTotal, avgMonthlyIncome);
    add({
      id: 'fixed',
      tone: share > 50 ? 'warn' : 'info',
      icon: 'event_repeat',
      title: t('insights.rules.fixedTitle', { amount: fmt(fixedTotal) }),
      body: avgMonthlyIncome > 0
        ? t('insights.rules.fixed', { pct: share, names })
        : t('insights.rules.fixedNoIncome', { names }),
      priority: share > 50 ? 65 : 45,
    });
  }

  // --- Where to cut --------------------------------------------------------
  // Your own cheaper months (25th percentile) are the target — a level you've
  // already proven you can live at, not an arbitrary cut.
  if (priorsFull.length >= 3) {
    const keys = new Set(priorsFull.flatMap((p) => Object.keys(p.bySub)));
    const ideas = [...keys]
      .filter((key) => !fixed[key])
      .map((key) => {
        const series = priorsFull.map((p) => p.bySub[key] || 0);
        const avg = mean(series);
        const target = quantile(series, 0.25);
        return { key, avg, target, potential: avg - target, seen: series.filter(Boolean).length };
      })
      .filter((x) => x.seen >= 3 && x.potential >= minAbs)
      .sort((a, b) => b.potential - a.potential)
      .slice(0, 3);

    if (ideas.length) {
      add({
        id: 'cut',
        tone: 'info',
        icon: 'content_cut',
        title: t('insights.rules.cutTitle', { amount: fmt(sum(ideas.map((x) => x.potential))) }),
        body: t('insights.rules.cut'),
        items: ideas.map((x) => ({
          label: nameOf(x.key),
          value: t('insights.rules.cutItem', { target: fmt(x.target), avg: fmt(x.avg) }),
          trailing: `−${fmt(x.potential)}`,
        })),
        priority: 50,
      });
    }
  }

  // --- Small leaks ---------------------------------------------------------
  if (cur.smallCount >= 8 && cur.smallSum >= cur.expense * 0.1) {
    add({
      id: 'small',
      tone: 'info',
      icon: 'local_cafe',
      title: t('insights.rules.smallTitle', { count: cur.smallCount }),
      body: t('insights.rules.small', {
        count: cur.smallCount,
        limit: fmt(SMALL_TX),
        amount: fmt(cur.smallSum),
        pct: pct(cur.smallSum, cur.expense),
      }),
      priority: 40,
    });
  }

  // --- Weekend vs weekday --------------------------------------------------
  {
    const end = isCurrent ? startOfDay(now) : startOfDay(getMonthRange(monthKey).end);
    const start = subDays(end, WEEKEND_WINDOW_DAYS - 1);
    const earliest = transactions.reduce((m, tx) => (tx.date < m ? tx.date : m), '9999');
    if (new Date(earliest) <= start) {
      let we = 0, wd = 0, weDays = 0, wdDays = 0;
      for (let d = 0; d < WEEKEND_WINDOW_DAYS; d++) {
        const dow = new Date(start.getTime() + d * DAY_MS).getDay();
        if (dow === 0 || dow === 6) weDays++; else wdDays++;
      }
      for (const tx of transactions) {
        if (allCategories[tx.category]?.type !== 'expense') continue;
        if (fixed[subKey(tx.category, tx.subcategory || 'Other')]) continue;
        const d = startOfDay(new Date(tx.date));
        if (d < start || d > end) continue;
        if (d.getDay() === 0 || d.getDay() === 6) we += tx.amount; else wd += tx.amount;
      }
      const weAvg = we / weDays;
      const wdAvg = wd / wdDays;
      if (wdAvg > 0 && weAvg / wdAvg >= 1.5) {
        add({
          id: 'weekend',
          tone: 'info',
          icon: 'weekend',
          title: t('insights.rules.weekendTitle', { ratio: (weAvg / wdAvg).toFixed(1) }),
          body: t('insights.rules.weekend', { weekend: fmt(weAvg), weekday: fmt(wdAvg) }),
          priority: 35,
        });
      }
    }
  }

  // --- Unusually large transaction -----------------------------------------
  if (priorKeys.length) {
    const history = {};
    for (const p of priorsFull) {
      for (const it of p.items) (history[it.key] ??= []).push(it.amount);
    }
    const outlier = cur.items
      .map((it) => {
        const past = history[it.key] || [];
        const usual = quantile(past, 0.5);
        return { it, usual, ratio: past.length >= 5 && usual > 0 ? it.amount / usual : 0 };
      })
      .filter((x) => x.ratio >= 3 && x.it.amount >= minAbs && !fixed[x.it.key])
      .sort((a, b) => b.ratio - a.ratio)[0];

    if (outlier) {
      add({
        id: 'outlier',
        tone: 'info',
        icon: 'priority_high',
        title: t('insights.rules.outlierTitle', { ratio: Math.round(outlier.ratio) }),
        body: t('insights.rules.outlier', {
          name: outlier.it.description || nameOf(outlier.it.key),
          amount: fmt(outlier.it.amount),
          usual: fmt(outlier.usual),
          category: nameOf(outlier.it.key),
        }),
        priority: 55,
      });
    }
  }

  // --- Concentration -------------------------------------------------------
  if (cur.count >= 5) {
    const [topKey, topAmt] = Object.entries(cur.bySub)
      .filter(([key]) => !fixed[key])
      .sort((a, b) => b[1] - a[1])[0] || [];
    if (topKey && topAmt / cur.expense >= 0.35) {
      add({
        id: 'concentration',
        tone: 'info',
        icon: 'donut_large',
        title: t('insights.rules.concentrationTitle', { name: nameOf(topKey), pct: pct(topAmt, cur.expense) }),
        body: t('insights.rules.concentration', { name: nameOf(topKey), amount: fmt(topAmt) }),
        priority: 30,
      });
    }
  }

  // --- No-spend days -------------------------------------------------------
  const noSpend = dayIndex - cur.spendDays.size;
  if (cur.count > 0 && noSpend >= 3) {
    add({
      id: 'noSpend',
      tone: 'good',
      icon: 'event_available',
      title: t('insights.rules.noSpendTitle', { count: noSpend }),
      body: t('insights.rules.noSpend', { count: noSpend, days: dayIndex }),
      priority: 15,
    });
  }

  insights.sort((a, b) => b.priority - a.priority);

  // --- Health score --------------------------------------------------------
  // A complete month speaks for itself; a month in progress is too partial,
  // so the score leans on the last three full months instead.
  const basis = !isCurrent ? [cur] : priorsFull.slice(0, 3).length ? priorsFull.slice(0, 3) : [cur];
  const bIncome = sum(basis.map((b) => b.income));
  const bExpense = sum(basis.map((b) => b.expense));
  const bSaved = sum(basis.map((b) => b.saved));
  const monthlyIncome = bIncome / basis.length;

  const liquid = sum(
    accounts
      .filter((a) => !ILLIQUID_ACCOUNT.test(`${a.type} ${a.name}`))
      .map((a) => Math.max(getAccountBalance(transactions, a.id, allCategories, a.openingBalance), 0))
  );
  const monthlySpend = avgMonthlyExpense || bExpense / basis.length;

  const components = [];
  if (bIncome > 0) {
    const rate = bSaved / bIncome;
    components.push({
      id: 'savings', weight: 30, score: clamp01(rate / 0.2),
      value: `${Math.round(rate * 100)}%`,
    });
    const ratio = bExpense / bIncome;
    components.push({
      id: 'spending', weight: 25, score: clamp01((1 - ratio) / 0.5),
      value: `${Math.round(ratio * 100)}%`,
    });
    if (priorsFull.length >= 3) {
      const r = fixedTotal / monthlyIncome;
      components.push({
        id: 'fixed', weight: 15, score: clamp01((0.6 - r) / 0.3),
        value: `${Math.round(r * 100)}%`,
      });
    }
  }
  if (budgeted.length) {
    const ok = budgeted.filter((c) => !c.isOver && !(c.pacing.isCurrent && c.pacing.projectedOver)).length;
    components.push({
      id: 'budget', weight: 15, score: ok / budgeted.length,
      value: `${ok}/${budgeted.length}`,
    });
  }
  if (monthlySpend > 0) {
    const months = liquid / monthlySpend;
    components.push({
      id: 'runway', weight: 15, score: clamp01(months / 6),
      value: t('insights.health.months', { count: months >= 10 ? Math.round(months) : months.toFixed(1) }),
    });
  }

  const totalWeight = sum(components.map((c) => c.weight));
  // One signal on its own isn't a health score.
  const score = components.length >= 2
    ? Math.round((sum(components.map((c) => c.weight * c.score)) / totalWeight) * 100)
    : null;
  const grade = score == null ? null : score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'weak';

  return {
    insights,
    health: {
      score,
      grade,
      components,
      // 'period' = the selected month itself, 'trailing' = recent full months,
      // 'partial' = only this unfinished month to go on.
      basis: !isCurrent ? 'period' : basis[0] === cur ? 'partial' : 'trailing',
      basisMonths: basis.length,
    },
    period: { isCurrent, dayIndex, totalDays, expense: cur.expense, income: cur.income, projected },
  };
}

import { format } from 'date-fns';
import { getAllCategories } from '@/lib/constants';
import {
  getAccountBalance, calculateTotals, filterTransactionsByMonth,
  filterTransactionsByYear, getMonthKey, getPeriodDays, getPeriodDayIndex,
  isCurrentPeriod,
} from '@/lib/utils';
import { buildBudgetReport, shiftMonth, monthLabel } from '@/lib/budget';

/**
 * Builds the JSON snapshot handed to Claude.
 *
 * Raw transactions are deliberately left out — a few thousand rows would blow
 * the context budget and cost the user real money per question. Aggregates
 * plus a short list of standout transactions carry the same signal.
 */

const TREND_MONTHS = 12;
const TOP_TRANSACTIONS = 12;
const RECURRING_WINDOW = 6;

function round(n) {
  return Math.round(n || 0);
}

function monthTotals(transactions, monthKey, allCategories) {
  const tx = filterTransactionsByMonth(transactions, monthKey);
  const t = calculateTotals(tx, allCategories);
  return {
    month: monthKey,
    income: round(t.income),
    expenses: round(t.expenses),
    savings: round(t.savings),
    investments: round(t.investments),
    net: round(t.net),
    transactionCount: tx.length,
  };
}

function categorySpendMap(transactions, monthKey) {
  const map = {};
  for (const t of filterTransactionsByMonth(transactions, monthKey)) {
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, round(v)]));
}

/** Subcategories seen in most of the recent months at a stable amount. */
function detectRecurring(transactions, anchorMonth, allCategories) {
  const months = Array.from({ length: RECURRING_WINDOW }, (_, i) =>
    shiftMonth(anchorMonth, -(i + 1))
  );
  const seen = {};

  for (const month of months) {
    const perKey = {};
    for (const t of filterTransactionsByMonth(transactions, month)) {
      const type = allCategories[t.category]?.type;
      if (type === 'income' || type === 'transfer') continue;
      const key = `${t.category}::${t.subcategory || 'Uncategorized'}`;
      perKey[key] = (perKey[key] || 0) + t.amount;
    }
    for (const [key, amount] of Object.entries(perKey)) {
      if (!seen[key]) seen[key] = [];
      seen[key].push(amount);
    }
  }

  return Object.entries(seen)
    .filter(([, amounts]) => amounts.length >= Math.min(3, RECURRING_WINDOW))
    .map(([key, amounts]) => {
      const [category, sub] = key.split('::');
      const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const spread = Math.max(...amounts) - Math.min(...amounts);
      return {
        category: allCategories[category]?.label || category,
        subcategory: sub,
        monthsSeen: amounts.length,
        avgAmount: round(avg),
        // Low variance relative to size reads as a fixed commitment
        // (rent, subscription) rather than lumpy discretionary spend.
        stable: avg > 0 && spread / avg < 0.25,
      };
    })
    .sort((a, b) => b.avgAmount - a.avgAmount)
    .slice(0, 15);
}

export function buildFinancialSnapshot(state, { scope = 'month', monthKey, year } = {}) {
  const {
    transactions, accounts, customCategories, customSubcategories,
    budgets, subBudgets, budgetTemplate, budgetSettings, userName,
  } = state;

  const allCategories = getAllCategories(customCategories);
  const now = new Date();
  const anchorMonth = monthKey || getMonthKey(now);
  const anchorYear = year || anchorMonth.slice(0, 4);

  // --- Scope description -------------------------------------------------
  const isCurrentMonth = isCurrentPeriod(anchorMonth, now);
  const daysTotal = getPeriodDays(anchorMonth);
  const daysElapsed = isCurrentMonth ? getPeriodDayIndex(anchorMonth, now) : daysTotal;

  const scopeInfo = scope === 'year'
    ? {
        type: 'year',
        key: anchorYear,
        label: anchorYear,
        complete: Number(anchorYear) < now.getFullYear(),
      }
    : {
        type: 'month',
        key: anchorMonth,
        label: monthLabel(anchorMonth),
        complete: !isCurrentMonth,
        daysElapsed,
        daysTotal,
        note: isCurrentMonth
          ? `This month is only ${daysElapsed} of ${daysTotal} days in — totals are partial.`
          : undefined,
      };

  // --- Trend -------------------------------------------------------------
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) =>
    shiftMonth(anchorMonth, -(TREND_MONTHS - 1 - i))
  );
  const monthlyTrend = trendMonths
    .map((m) => monthTotals(transactions, m, allCategories))
    .filter((m) => m.transactionCount > 0);

  // --- Focus period ------------------------------------------------------
  const report = buildBudgetReport({
    monthKey: anchorMonth,
    transactions,
    allCategories,
    customSubcategories,
    customCategories,
    budgets,
    subBudgets,
    budgetTemplate,
    budgetSettings,
    now,
  });

  const focusCategories = report.categories
    .filter((c) => c.spent > 0 || c.effectiveBudget > 0)
    .map((c) => ({
      category: c.label,
      spent: round(c.spent),
      budget: round(c.effectiveBudget),
      remaining: round(c.remaining),
      pctUsed: c.pctRaw,
      projectedMonthEnd: c.pacing.isCurrent ? round(c.pacing.projected) : undefined,
      overBudget: c.isOver || undefined,
      subcategories: c.subcategories
        .filter((s) => s.spent > 0 || s.amount > 0)
        .map((s) => ({
          name: s.name,
          spent: round(s.spent),
          budget: s.amount > 0 ? round(s.amount) : undefined,
        }))
        .sort((a, b) => b.spent - a.spent),
    }));

  // --- Comparison --------------------------------------------------------
  const prevMonth = shiftMonth(anchorMonth, -1);
  const priorMonths = [1, 2, 3].map((i) => shiftMonth(anchorMonth, -i));
  const priorTotals = priorMonths.map((m) => monthTotals(transactions, m, allCategories));
  const withData = priorTotals.filter((m) => m.transactionCount > 0);

  const average = (key) =>
    withData.length ? round(withData.reduce((s, m) => s + m[key], 0) / withData.length) : 0;

  // --- Accounts ----------------------------------------------------------
  const accountBalances = accounts.map((a) => ({
    name: a.name,
    type: a.type,
    balance: round(getAccountBalance(transactions, a.id, allCategories, a.openingBalance)),
  }));

  // --- Notable transactions ---------------------------------------------
  const scopeTx = scope === 'year'
    ? filterTransactionsByYear(transactions, Number(anchorYear))
    : filterTransactionsByMonth(transactions, anchorMonth);

  const accountName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const topTransactions = [...scopeTx]
    .filter((t) => {
      const type = allCategories[t.category]?.type;
      return type !== 'income' && type !== 'transfer';
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_TRANSACTIONS)
    .map((t) => ({
      date: t.date,
      category: allCategories[t.category]?.label || t.category,
      subcategory: t.subcategory || undefined,
      description: t.description || undefined,
      amount: round(t.amount),
      account: accountName[t.account] || t.account,
    }));

  return {
    generatedAt: format(now, 'yyyy-MM-dd'),
    currency: 'IDR',
    user: userName || undefined,
    scope: scopeInfo,

    focusPeriod: {
      totals: {
        income: round(report.income),
        spent: round(report.totalSpent),
        budgeted: round(report.totalBudget),
        unallocatedIncome: round(report.unallocated),
        budgetPctUsed: report.totalPctRaw,
      },
      pacing: report.pacing.isCurrent
        ? {
            daysElapsed: report.pacing.elapsedDays,
            daysTotal: report.pacing.totalDays,
            expectedPctByToday: report.pacing.elapsedPct,
            projectedTotalSpend: round(report.pacing.projected),
            safeToSpendPerDay: round(report.pacing.dailySafe),
            aheadOfPace: report.pacing.aheadOfPace,
          }
        : undefined,
      categories: focusCategories,
    },

    comparison: {
      previousMonth: monthTotals(transactions, prevMonth, allCategories),
      previousMonthByCategory: categorySpendMap(transactions, prevMonth),
      trailing3MonthAverage: {
        income: average('income'),
        expenses: average('expenses'),
        savings: average('savings'),
        investments: average('investments'),
        monthsUsed: withData.length,
      },
    },

    monthlyTrend,
    accounts: accountBalances,
    recurringCommitments: detectRecurring(transactions, anchorMonth, allCategories),
    topTransactions,
  };
}

/** Frames the snapshot for the model without burying the user's question. */
export function buildContextMessage(snapshot, question) {
  return [
    'Here is my current financial data snapshot:',
    '',
    '```json',
    JSON.stringify(snapshot, null, 1),
    '```',
    '',
    question,
  ].join('\n');
}

/**
 * Quick prompts are translated before being sent, so the model sees the
 * user's own language and the system prompt's "reply in kind" rule does the
 * rest.
 */
export const QUICK_PROMPTS = [
  { id: 'overview', icon: 'chart', labelKey: 'insights.promptOverview', promptKey: 'insights.prompts.overview' },
  { id: 'budget', icon: 'target', labelKey: 'insights.promptBudget', promptKey: 'insights.prompts.budget' },
  { id: 'savings', icon: 'piggy', labelKey: 'insights.promptSavings', promptKey: 'insights.prompts.savings' },
  { id: 'trend', icon: 'trend', labelKey: 'insights.promptTrend', promptKey: 'insights.prompts.trend' },
  { id: 'health', icon: 'heart', labelKey: 'insights.promptHealth', promptKey: 'insights.prompts.health' },
];

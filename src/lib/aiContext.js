import { format, addDays, startOfDay } from 'date-fns';
import { accountRole, getAllCategories, isNeutralType } from '@/lib/constants';
import {
  getAccountBalance, calculateTotals, filterTransactionsByDateRange, filterTransactionsByMonth,
  filterTransactionsByYear, getMonthKey, getMonthRange, getPeriodDays,
  getPeriodDayIndex, getReceivables, isCurrentPeriod,
} from '@/lib/utils';
import { buildBudgetReport, getDailyAllowance, shiftMonth, monthLabel } from '@/lib/budget';

/**
 * Builds the JSON snapshot handed to the model.
 *
 * Aggregates carry most of the signal, but questions like "what were my
 * biggest purchases" or "how much did I spend on the 3rd" need the rows
 * themselves. So the scope's own transactions ride along as one compact line
 * each, capped per model: the free Groq tier counts every token against a small
 * per-minute budget, while Gemini and Claude take a full month without
 * noticing. When the cap bites, the largest rows are kept.
 */

const TREND_MONTHS = 12;
const RECURRING_WINDOW = 6;
const DEFAULT_MAX_TRANSACTIONS = 400;

function round(n) {
  return Math.round(n || 0);
}

function isoDay(date) {
  return format(date, 'yyyy-MM-dd');
}

/** A budget period's real span — "2026-10" can mean 25 Oct–24 Nov. */
function periodRange(monthKey) {
  const { start, end } = getMonthRange(monthKey);
  return { start: isoDay(start), end: isoDay(end) };
}

/** Keeps the delimiter out of free text so every row splits the same way. */
function cell(value) {
  return String(value ?? '').replace(/[|\n\r]+/g, ' ').trim();
}

/**
 * One period's totals. `partial` marks a period that began before the user
 * started tracking: its totals cover only part of it, so it mustn't be
 * compared with or averaged into full periods.
 */
function monthTotals(transactions, monthKey, allCategories, accounts, trackedFrom) {
  const tx = filterTransactionsByMonth(transactions, monthKey);
  const t = calculateTotals(tx, allCategories, accounts);
  return {
    month: monthKey,
    ...periodRange(monthKey),
    ...(trackedFrom && getMonthRange(monthKey).start < trackedFrom ? { partial: true } : {}),
    income: round(t.income),
    expenses: round(t.expenses),
    savings: round(t.savings),
    investments: round(t.investments),
    net: round(t.net),
    transactionCount: tx.length,
  };
}


/**
 * The first `days` days of a period. Set beside an unfinished current period,
 * it answers "am I spending more than last time?" like for like, instead of
 * comparing a part period with a whole one.
 */
function totalsThroughDay(transactions, monthKey, days, allCategories, accounts, names) {
  const { start, end } = getMonthRange(monthKey);
  const last = addDays(startOfDay(start), days - 1);
  const until = last < end ? last : end;
  const tx = filterTransactionsByDateRange(filterTransactionsByMonth(transactions, monthKey), start, until);
  const t = calculateTotals(tx, allCategories, accounts);
  return {
    start: isoDay(start),
    end: isoDay(until),
    days: Math.min(days, getPeriodDays(monthKey)),
    income: round(t.income),
    expenses: round(t.expenses),
    savings: round(t.savings),
    investments: round(t.investments),
    byCategory: breakdownByCategory(tx, allCategories, names),
  };
}

/** Subcategories seen in most of the recent months at a stable amount. */
function detectRecurring(transactions, anchorMonth, allCategories, names) {
  const months = Array.from({ length: RECURRING_WINDOW }, (_, i) =>
    shiftMonth(anchorMonth, -(i + 1))
  );
  const seen = {};

  for (const month of months) {
    const perKey = {};
    for (const t of filterTransactionsByMonth(transactions, month)) {
      const type = allCategories[t.category]?.type;
      if (type === 'income' || isNeutralType(type)) continue;
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
        category: names.category(category),
        subcategory: names.subcategory(sub),
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

/**
 * Every transaction in scope as `date | category | subcategory | amount |
 * account | note`, oldest first. Transfers are included (the account column
 * reads "from → to") because they explain where savings came from. When the
 * cap bites, the largest rows are kept, spending before transfers.
 */
function transactionRows(scopeTx, allCategories, accountName, max, names) {
  const rows = scopeTx;
  const isTransfer = (t) => (allCategories[t.category]?.type === 'transfer' ? 1 : 0);
  const kept = rows.length > max
    ? [...rows].sort((a, b) => (isTransfer(a) - isTransfer(b)) || (b.amount - a.amount)).slice(0, max)
    : rows;
  const acct = (id) => cell(accountName[id] || id);

  return {
    total: rows.length,
    included: kept.length,
    rows: [...kept]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((t) => [
        isoDay(new Date(t.date)),
        cell(names.category(t.category)),
        // Receivables move both ways, so say which on every row.
        cell(`${names.subcategory(t.subcategory || '-')}${receivableTag(t, allCategories)}`),
        round(t.amount),
        t.toAccount ? `${acct(t.account)} → ${acct(t.toAccount)}` : acct(t.account),
        cell(t.note || t.description || ''),
      ].join(' | ')),
  };
}

function receivableTag(t, allCategories) {
  if (allCategories[t.category]?.type !== 'receivable') return '';
  return t.flow === 'in' ? ' (paid back)' : ' (paid out, owed back)';
}

/**
 * Where the savings figure for a set of transactions comes from, split the
 * same way it's computed, so the model can explain it exactly:
 * net = movedIn − movedOut + incomeIn − paidFrom − investedFrom.
 */
function savingsFlow(scopeTx, accounts, allCategories) {
  const ids = new Set(accounts.filter((a) => accountRole(a) === 'savings').map((a) => a.id));
  if (!ids.size) return undefined;
  const out = { accounts: accounts.filter((a) => ids.has(a.id)).map((a) => a.name), movedIn: 0, movedOut: 0, incomeIn: 0, paidFrom: 0, investedFrom: 0 };
  for (const t of scopeTx) {
    const type = allCategories[t.category]?.type;
    if (type === 'receivable') continue;
    const fromSavings = ids.has(t.account);
    const toSavings = ids.has(t.toAccount);
    if (type === 'transfer') {
      if (toSavings && !fromSavings) out.movedIn += t.amount;
      else if (fromSavings && !toSavings) out.movedOut += t.amount;
    } else if (type === 'income') {
      if (fromSavings) out.incomeIn += t.amount;
    } else if (type === 'investment') {
      if (fromSavings) out.investedFrom += t.amount;
    } else if (fromSavings) {
      out.paidFrom += t.amount;
    }
  }
  for (const k of ['movedIn', 'movedOut', 'incomeIn', 'paidFrom', 'investedFrom']) out[k] = round(out[k]);
  out.net = out.movedIn - out.movedOut + out.incomeIn - out.paidFrom - out.investedFrom;
  return out;
}

/** Expense-type spending per calendar day, so "which day was worst" needs no arithmetic. */
function dailySpending(scopeTx, allCategories) {
  const days = {};
  for (const t of scopeTx) {
    if (allCategories[t.category]?.type !== 'expense') continue;
    const day = isoDay(new Date(t.date));
    days[day] = (days[day] || 0) + t.amount;
  }
  return Object.fromEntries(
    Object.keys(days).sort().map((day) => [day, round(days[day])])
  );
}

/** Category → subcategory totals over a set of transactions (a year, or a past period). */
function breakdownByCategory(scopeTx, allCategories, names) {
  const map = {};
  for (const t of scopeTx) {
    const info = allCategories[t.category];
    if (!info || isNeutralType(info.type)) continue;
    const label = names.category(t.category);
    map[label] ||= { type: info.type, total: 0, subcategories: {} };
    map[label].total += t.amount;
    const sub = names.subcategory(t.subcategory || 'Other');
    map[label].subcategories[sub] = (map[label].subcategories[sub] || 0) + t.amount;
  }
  return Object.entries(map)
    .map(([category, v]) => ({
      category,
      type: v.type,
      total: round(v.total),
      subcategories: Object.fromEntries(
        Object.entries(v.subcategories)
          .sort((a, b) => b[1] - a[1])
          .map(([k, amount]) => [k, round(amount)])
      ),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * `names` translates category ids and subcategory names into what the app
 * shows (`{ category(id), subcategory(name) }`), so the model's answer uses
 * the same words as the screens. Without it, the stored English names are used.
 */
export function buildFinancialSnapshot(state, {
  scope = 'month', monthKey, year, maxTransactions = DEFAULT_MAX_TRANSACTIONS, names: given = {},
} = {}) {
  const {
    transactions, accounts, customCategories, customSubcategories,
    budgets, subBudgets, budgetTemplate, budgetSettings, userName,
  } = state;

  const allCategories = getAllCategories(customCategories);
  const names = {
    category: (id) => given.category?.(allCategories[id], id) || allCategories[id]?.label || id,
    subcategory: (name) => given.subcategory?.(name) || name,
  };
  // Periods that began before the first entry (with a few days' grace) are
  // only partly tracked.
  const firstLogged = transactions.reduce(
    (min, t) => (String(t.date) < min ? String(t.date) : min),
    '9999-12-31'
  );
  const trackedFrom = transactions.length ? addDays(startOfDay(new Date(firstLogged)), -3) : null;
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
        ...periodRange(anchorMonth),
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
    .map((m) => monthTotals(transactions, m, allCategories, accounts, trackedFrom))
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
    accounts,
    now,
  });

  const focusCategories = report.categories
    .filter((c) => c.spent > 0 || c.effectiveBudget > 0)
    .map((c) => ({
      category: names.category(c.key),
      spent: round(c.spent),
      budget: round(c.effectiveBudget),
      remaining: round(c.remaining),
      pctUsed: c.pctRaw,
      projectedMonthEnd: c.pacing.isCurrent ? round(c.pacing.projected) : undefined,
      // Savings and investment budgets are targets to reach, not limits.
      goal: c.isGoal || undefined,
      goalReached: c.isGoal && c.reached ? true : undefined,
      overBudget: c.isOver || undefined,
      subcategories: c.subcategories
        .filter((s) => s.spent > 0 || s.amount > 0)
        .map((s) => ({
          name: names.subcategory(s.name),
          spent: round(s.spent),
          budget: s.amount > 0 ? round(s.amount) : undefined,
        }))
        .sort((a, b) => b.spent - a.spent),
    }));

  // --- Comparison --------------------------------------------------------
  const prevMonth = shiftMonth(anchorMonth, -1);
  const priorMonths = [1, 2, 3].map((i) => shiftMonth(anchorMonth, -i));
  const priorTotals = priorMonths.map((m) => monthTotals(transactions, m, allCategories, accounts, trackedFrom));
  // Only fully tracked periods: a part-tracked one would drag the average down.
  const withData = priorTotals.filter((m) => m.transactionCount > 0 && !m.partial);

  const average = (key) =>
    withData.length ? round(withData.reduce((s, m) => s + m[key], 0) / withData.length) : 0;

  // --- Accounts ----------------------------------------------------------
  const accountBalances = accounts.map((a) => ({
    name: a.name,
    type: a.type,
    role: accountRole(a),
    balance: round(getAccountBalance(transactions, a.id, allCategories, a.openingBalance)),
  }));

  // --- Transactions ----------------------------------------------------
  const scopeTx = scope === 'year'
    ? filterTransactionsByYear(transactions, Number(anchorYear))
    : filterTransactionsByMonth(transactions, anchorMonth);

  const accountName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const txList = transactionRows(scopeTx, allCategories, accountName, maxTransactions, names);

  return {
    generatedAt: format(now, 'yyyy-MM-dd'),
    currency: 'IDR',
    user: userName || undefined,
    scope: scopeInfo,

    // Budgets are monthly, so even a year question gets the anchor period's
    // budget picture — labelled, so the model doesn't mistake it for the year.
    focusPeriod: {
      period: { key: anchorMonth, ...periodRange(anchorMonth) },
      totals: {
        income: round(report.income),
        // Expense-type categories only, against their limits: the Budget
        // page's spending card. Goals are reported per category.
        spending: report.spending.budget > 0
          ? {
              spent: round(report.spending.spent),
              limit: round(report.spending.budget),
              remaining: round(report.spending.remaining),
              pctUsed: report.spending.pctRaw,
            }
          : { spent: round(report.spending.spent), limit: 'none set' },
        budgetedInclGoals: round(report.totalBudget),
        unallocatedIncome: round(report.unallocated),
      },
      pacing: report.spending.pacing.isCurrent
        ? {
            daysElapsed: report.spending.pacing.elapsedDays,
            daysTotal: report.spending.pacing.totalDays,
            expectedPctByToday: report.spending.pacing.elapsedPct,
            // From how the last full periods went after this point; the same
            // projection the app shows.
            projectedSpending: round(report.spending.pacing.projected),
            projectedOverLimit: report.spending.pacing.projectedOver || undefined,
            // The Today screen's number for today.
            todayAllowance: report.spendBudget > 0
              ? round(getDailyAllowance(anchorMonth, report.spendBudget, transactions, allCategories, now).allowance)
              : undefined,
            aheadOfPace: report.spending.pacing.aheadOfPace,
          }
        : undefined,
      categories: focusCategories,
    },

    comparison: {
      previousMonth: monthTotals(transactions, prevMonth, allCategories, accounts, trackedFrom),
      // Category → subcategory, so this period can be compared line by line.
      previousMonthByCategory: breakdownByCategory(
        filterTransactionsByMonth(transactions, prevMonth), allCategories, names
      ),
      // Same number of days into the previous period, while this one is unfinished.
      previousMonthSameDays: scope === 'month' && isCurrentMonth
        ? totalsThroughDay(transactions, prevMonth, daysElapsed, allCategories, accounts, names)
        : undefined,
      trailing3MonthAverage: {
        income: average('income'),
        expenses: average('expenses'),
        savings: average('savings'),
        investments: average('investments'),
        monthsUsed: withData.length,
      },
    },

    yearBreakdown: scope === 'year' ? breakdownByCategory(scopeTx, allCategories, names) : undefined,
    dailySpending: scope === 'month' ? dailySpending(scopeTx, allCategories) : undefined,
    savingsFlow: savingsFlow(scopeTx, accounts, allCategories),

    monthlyTrend,
    accounts: accountBalances,
    // All-time, not just this scope: what's still owed back to the user.
    receivablesOutstanding: (() => {
      const r = getReceivables(transactions, allCategories);
      return r.count
        ? {
            total: round(r.outstanding),
            bySubcategory: Object.fromEntries(r.bySubcategory.map((x) => [names.subcategory(x.name), round(x.amount)])),
          }
        : undefined;
    })(),
    recurringCommitments: detectRecurring(transactions, anchorMonth, allCategories, names),
    trackingSince: transactions.length ? isoDay(new Date(firstLogged)) : undefined,
    categoryTypes: Object.fromEntries(
      Object.keys(allCategories).map((id) => [names.category(id), allCategories[id].type])
    ),

    transactions: {
      columns: 'date | category | subcategory | amount | account | note',
      count: txList.total,
      note: txList.included < txList.total
        ? `Only the ${txList.included} largest of ${txList.total} transactions are listed (spending first, transfers last); smaller ones are left out but are included in every total above.`
        : `All ${txList.total} transactions in scope, oldest first. Transfers and investments show "from → to" in the account column.`,
      rows: txList.rows,
    },
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

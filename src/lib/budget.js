import { format, parse, subMonths, addMonths, startOfDay } from 'date-fns';
import { getSubcategories, isNeutralType } from '@/lib/constants';
import {
  getMonthKey, getMonthRange, getPeriodDays, getPeriodDayIndex, isCurrentPeriod,
  savingsAccountIds, savingsEffect,
} from '@/lib/utils';

/** Composite key for a subcategory budget, e.g. `expenses::Dining Out`. */
export const subKey = (category, sub) => `${category}::${sub}`;

/** How many months back rollover is allowed to accumulate. */
const ROLLOVER_LOOKBACK = 24;

function monthKeyToDate(monthKey) {
  return parse(`${monthKey}-01`, 'yyyy-MM-dd', new Date());
}

export function shiftMonth(monthKey, delta) {
  const d = monthKeyToDate(monthKey);
  return format(delta < 0 ? subMonths(d, -delta) : addMonths(d, delta), 'yyyy-MM');
}

export function monthLabel(monthKey) {
  return format(monthKeyToDate(monthKey), 'MMM yyyy');
}

/** Month-specific override first, then the recurring template, then nothing. */
function resolveCategoryAmount(monthKey, category, { budgets, budgetTemplate }) {
  const override = budgets?.[monthKey]?.[category];
  if (override != null) return override;
  return budgetTemplate?.categories?.[category] ?? 0;
}

function resolveSubAmount(monthKey, category, sub, { subBudgets, budgetTemplate }) {
  const key = subKey(category, sub);
  const override = subBudgets?.[monthKey]?.[key];
  if (override != null) return override;
  return budgetTemplate?.subcategories?.[key] ?? 0;
}

/**
 * Planned budget for one category in one month.
 *
 * When any subcategory has a budget, the parent's number is derived from the
 * sum of its children — otherwise the two would disagree and there'd be no
 * obvious winner.
 */
function getPlannedBudget(monthKey, category, config, subNames = []) {
  const subs = subNames.map((name) => ({
    name,
    amount: resolveSubAmount(monthKey, category, name, config),
  }));
  const subTotal = subs.reduce((s, x) => s + x.amount, 0);
  const usesSubBudgets = subs.some((s) => s.amount > 0);
  const own = resolveCategoryAmount(monthKey, category, config);

  return {
    planned: usesSubBudgets ? subTotal : own,
    ownAmount: own,
    subs,
    usesSubBudgets,
  };
}

/**
 * What a category used in a month. For the built-in Savings category that
 * includes the net growth of the savings accounts (`savings.ids`), since a
 * transfer into one is how most saving actually happens.
 */
function spentIn(transactions, monthKey, category, savings) {
  let total = 0;
  const countGrowth = category === 'savings' && savings?.ids.length;
  for (const t of transactions) {
    if (getMonthKey(t.date) !== monthKey) continue;
    if (t.category === category) total += t.amount;
    if (countGrowth) total += savingsEffect(t, savings.ids, savings.allCategories);
  }
  return total;
}

function spentInSub(transactions, monthKey, category, sub) {
  let total = 0;
  for (const t of transactions) {
    if (t.category === category && t.subcategory === sub && getMonthKey(t.date) === monthKey) {
      total += t.amount;
    }
  }
  return total;
}

/** Earliest month with any transaction, or null when there's no history. */
/**
 * The first period the data fully covers, or null when there's no history.
 * The period someone started logging in usually has only a few days in it;
 * counting it would make an untouched budget look like a huge surplus.
 * A first entry within 3 days of a period's start still counts as covering it.
 */
function getEarliestMonth(transactions) {
  let first = null;
  for (const t of transactions) {
    const day = String(t.date).slice(0, 10);
    if (first === null || day < first) first = day;
  }
  if (!first) return null;
  const month = getMonthKey(first);
  const { start } = getMonthRange(month);
  const covered = startOfDay(new Date(first)) - start <= 3 * 86_400_000;
  return covered ? month : shiftMonth(month, 1);
}

/**
 * Accumulated rollover carried into `monthKey`.
 *
 * Walks forward month by month so a surplus left over three months ago is
 * still available today. `carryDeficit` lets an overspend follow you forward
 * instead of being forgiven silently.
 *
 * Accumulation starts at the first month the user actually has data for. A
 * recurring template technically applies to every month ever, so without that
 * floor every month before they started using the app would contribute a full
 * untouched budget and invent an enormous surplus.
 */
function computeRollover(
  monthKey, category, config, subNames, transactions, settings, earliestMonth, savings
) {
  if (!settings?.rolloverEnabled) return 0;
  if (settings?.rolloverExcluded?.[category]) return 0;

  const first = earliestMonth ?? getEarliestMonth(transactions);
  if (!first || first >= monthKey) return 0;

  const carryDeficit = settings?.rolloverMode === 'full';
  const lookbackFloor = shiftMonth(monthKey, -ROLLOVER_LOOKBACK);
  let month = first > lookbackFloor ? first : lookbackFloor;

  let carry = 0;
  while (month < monthKey) {
    const { planned } = getPlannedBudget(month, category, config, subNames);
    // A month with no budget set can't generate surplus.
    if (planned > 0) {
      carry += planned - spentIn(transactions, month, category, savings);
      if (!carryDeficit && carry < 0) carry = 0;
    }
    month = shiftMonth(month, 1);
  }
  return Math.round(carry);
}

/**
 * Where you *should* be in the month, and where you're heading.
 *
 * `expectedPct` is straight-line pacing against elapsed days; `projected` is
 * the current burn rate extrapolated to month end.
 */
const PROJECTION_HISTORY = 3;
const DAY_MS = 86_400_000;

/**
 * Where spending is heading by the end of the current period, using the
 * user's own pattern: in up to three earlier, fully tracked periods, how much
 * was spent after the same share of the period had passed. That knows bills
 * and big transfers land early; a straight line would multiply them across
 * the whole period. With no such history, it falls back to the straight line.
 *
 * `include(t)` picks the transactions being projected (one category, or all
 * expense-type spending).
 */
function projectSpend(transactions, monthKey, spentSoFar, include, earliestMonth, now) {
  if (!isCurrentPeriod(monthKey, now)) return spentSoFar;
  const totalDays = getPeriodDays(monthKey);
  const elapsed = getPeriodDayIndex(monthKey, now);
  const share = elapsed / totalDays;

  const rests = [];
  for (let i = 1; i <= PROJECTION_HISTORY; i++) {
    const month = shiftMonth(monthKey, -i);
    if (!earliestMonth || month < earliestMonth) break;
    const start = getMonthRange(month).start;
    const cutoff = share * getPeriodDays(month);
    let rest = 0;
    let tracked = false;
    for (const t of transactions) {
      if (getMonthKey(t.date) !== month) continue;
      tracked = true;
      const day = Math.floor((startOfDay(new Date(t.date)) - start) / DAY_MS) + 1;
      if (day > cutoff && include(t)) rest += t.amount;
    }
    if (tracked) rests.push(rest);
  }
  if (rests.length) return Math.round(spentSoFar + rests.reduce((a, b) => a + b, 0) / rests.length);
  return elapsed > 0 ? Math.round((spentSoFar / elapsed) * totalDays) : 0;
}

function getPacing(monthKey, spent, effectiveBudget, now = new Date(), projectedOverride) {
  const totalDays = getPeriodDays(monthKey);
  const isCurrent = isCurrentPeriod(monthKey, now);
  const isFuture = monthKey > getMonthKey(now);

  const elapsedDays = isCurrent ? getPeriodDayIndex(monthKey, now) : isFuture ? 0 : totalDays;
  const daysLeft = Math.max(totalDays - elapsedDays, 0);
  const elapsedPct = Math.round((elapsedDays / totalDays) * 100);

  const projected = projectedOverride
    ?? (elapsedDays > 0 ? Math.round((spent / elapsedDays) * totalDays) : 0);
  const remaining = effectiveBudget - spent;
  const dailySafe = daysLeft > 0 && remaining > 0 ? Math.floor(remaining / daysLeft) : 0;

  const spentPct = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;
  // Only meaningful mid-month, and only once there's a budget to pace against.
  const aheadOfPace = isCurrent && effectiveBudget > 0 && spentPct > elapsedPct + 5;

  return {
    isCurrent,
    isFuture,
    totalDays,
    elapsedDays,
    daysLeft,
    elapsedPct,
    projected,
    projectedOver: effectiveBudget > 0 && projected > effectiveBudget,
    dailySafe,
    aheadOfPace,
  };
}

/**
 * The single number the Today screen is built around.
 *
 * Today's allowance is fixed at the start of the day — it's the budget still
 * unspent *before today*, divided over the days still to come. Spending today
 * eats into `left` but doesn't move `allowance`, so the target you woke up to
 * doesn't shift under you every time you buy coffee.
 *
 * Underspending yesterday therefore raises today's allowance on its own; there
 * is no separate carry-over to track.
 */
export function getDailyAllowance(monthKey, spendBudget, transactions, allCategories, now = new Date()) {
  // Day-to-day money only: the budgets and spending of expense-type
  // categories. Savings and investment targets aren't something to spend, and
  // saving more than planned mustn't shrink what's left for today.
  const totalBudget = spendBudget;
  const totalDays = getPeriodDays(monthKey);
  const isCurrent = isCurrentPeriod(monthKey, now);

  const todayKey = format(now, 'yyyy-MM-dd');
  let spentBeforeToday = 0;
  let spentToday = 0;

  for (const t of transactions) {
    if (allCategories[t.category]?.type !== 'expense') continue;
    if (getMonthKey(t.date) !== monthKey) continue;

    const day = String(t.date).slice(0, 10);
    if (isCurrent && day === todayKey) spentToday += t.amount;
    else if (!isCurrent || day < todayKey) spentBeforeToday += t.amount;
  }

  // Outside the current month there is no "today" to budget for.
  if (!isCurrent) {
    return {
      applicable: false,
      allowance: 0, left: 0, spentToday: 0,
      daysLeft: 0, totalDays, budgetLeft: totalBudget - spentBeforeToday,
    };
  }

  const daysLeft = totalDays - getPeriodDayIndex(monthKey, now) + 1;
  const budgetLeft = totalBudget - spentBeforeToday;
  const allowance = daysLeft > 0 ? Math.max(0, Math.floor(budgetLeft / daysLeft)) : 0;

  return {
    applicable: totalBudget > 0,
    allowance,
    left: allowance - spentToday,
    spentToday,
    daysLeft,
    totalDays,
    budgetLeft: budgetLeft - spentToday,
    pctUsed: allowance > 0 ? Math.min(Math.round((spentToday / allowance) * 100), 100) : 0,
    isOver: spentToday > allowance,
  };
}

/**
 * Everything the Budget page needs for one month, in one pass.
 */
export function buildBudgetReport({
  monthKey,
  transactions,
  allCategories,
  customSubcategories = {},
  customCategories = {},
  budgets = {},
  subBudgets = {},
  budgetTemplate = { categories: {}, subcategories: {} },
  budgetSettings = {},
  accounts = [],
  now = new Date(),
}) {
  const config = { budgets, subBudgets, budgetTemplate };
  const savings = { ids: savingsAccountIds(accounts), allCategories };
  const alertThreshold = budgetSettings.alertThreshold ?? 80;
  // Computed once and shared — every category would otherwise rescan the
  // whole transaction list to find it.
  const earliestMonth = getEarliestMonth(transactions);

  const categories = Object.entries(allCategories)
    .filter(([, cat]) => cat.type !== 'income' && !isNeutralType(cat.type))
    .map(([key, cat]) => {
      const subNames = getSubcategories(key, customSubcategories, customCategories);
      const plan = getPlannedBudget(monthKey, key, config, subNames);
      const rollover = computeRollover(
        monthKey, key, config, subNames, transactions, budgetSettings, earliestMonth, savings
      );

      const spent = spentIn(transactions, monthKey, key, savings);
      const effectiveBudget = plan.planned + rollover;
      const remaining = effectiveBudget - spent;
      const pctRaw = effectiveBudget > 0 ? Math.round((spent / effectiveBudget) * 100) : 0;
      // Savings and investments are targets, not limits: reaching or passing
      // one is good news, and a lump sum moved on payday isn't a daily pace.
      const isGoal = cat.type === 'savings' || cat.type === 'investment';
      const projectedSpend = isGoal
        ? undefined
        : projectSpend(transactions, monthKey, spent, (t) => t.category === key, earliestMonth, now);
      const rawPacing = getPacing(monthKey, spent, effectiveBudget, now, projectedSpend);
      const pacing = isGoal ? { ...rawPacing, projectedOver: false, aheadOfPace: false } : rawPacing;

      const subcategories = plan.subs
        .map((s) => {
          const subSpent = spentInSub(transactions, monthKey, key, s.name);
          return {
            ...s,
            spent: subSpent,
            remaining: s.amount - subSpent,
            pct: s.amount > 0 ? Math.round((subSpent / s.amount) * 100) : 0,
            isOver: s.amount > 0 && subSpent > s.amount,
          };
        })
        // Hide subcategories that are neither budgeted nor used — the list
        // would otherwise be mostly empty rows.
        .filter((s) => s.amount > 0 || s.spent > 0);

      const isOver = !isGoal && effectiveBudget > 0 && spent > effectiveBudget;
      const isNearLimit = !isGoal && !isOver && effectiveBudget > 0 && pctRaw >= alertThreshold;
      const reached = isGoal && effectiveBudget > 0 && spent >= effectiveBudget;

      return {
        key,
        label: cat.label,
        // Carried through so callers can translate built-in category names.
        labelKey: cat.labelKey,
        type: cat.type,
        isGoal,
        reached,
        color: cat.color,
        hex: cat.hex,
        planned: plan.planned,
        ownAmount: plan.ownAmount,
        usesSubBudgets: plan.usesSubBudgets,
        templateAmount: budgetTemplate?.categories?.[key] ?? 0,
        hasOverride: budgets?.[monthKey]?.[key] != null,
        rollover,
        effectiveBudget,
        spent,
        remaining,
        pct: Math.min(pctRaw, 100),
        pctRaw,
        isOver,
        isNearLimit,
        subcategories,
        pacing,
      };
    });

  const income = transactions
    .filter((t) => allCategories[t.category]?.type === 'income' && getMonthKey(t.date) === monthKey)
    .reduce((s, t) => s + t.amount, 0);

  const totalPlanned = categories.reduce((s, c) => s + c.planned, 0);
  const totalRollover = categories.reduce((s, c) => s + c.rollover, 0);
  const totalBudget = totalPlanned + totalRollover;
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);
  // Spending on its own: limits and use of expense-type categories. This is
  // what the overall gauge and the daily allowance are about; savings and
  // investment targets are reported separately as goals.
  const spendCats = categories.filter((c) => c.type === 'expense');
  const spendBudget = spendCats.reduce((s, c) => s + c.effectiveBudget, 0);
  const spendSpent = spendCats.reduce((s, c) => s + c.spent, 0);
  const spendPctRaw = spendBudget > 0 ? Math.round((spendSpent / spendBudget) * 100) : 0;
  const spending = {
    budget: spendBudget,
    spent: spendSpent,
    remaining: spendBudget - spendSpent,
    pctRaw: spendPctRaw,
    pct: Math.min(spendPctRaw, 100),
    isOver: spendBudget > 0 && spendSpent > spendBudget,
    pacing: getPacing(
      monthKey, spendSpent, spendBudget, now,
      projectSpend(
        transactions, monthKey, spendSpent,
        (t) => allCategories[t.category]?.type === 'expense', earliestMonth, now
      )
    ),
  };

  return {
    monthKey,
    categories,
    income,
    totalPlanned,
    totalRollover,
    totalBudget,
    totalSpent,
    spendBudget,
    spending,
    totalRemaining: totalBudget - totalSpent,
    totalPct: totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0,
    totalPctRaw: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    unallocated: income - totalPlanned,
    budgetPctOfIncome: income > 0 ? Math.round((totalPlanned / income) * 100) : 0,
    pacing: getPacing(monthKey, totalSpent, totalBudget, now),
    alerts: categories.filter((c) => c.isOver || c.isNearLimit || c.pacing.projectedOver),
  };
}

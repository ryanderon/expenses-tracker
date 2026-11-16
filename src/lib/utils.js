import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format, parse, startOfMonth, endOfMonth, eachMonthOfInterval,
  startOfYear, endOfYear, startOfDay, endOfDay, subDays,
} from 'date-fns';
import { CATEGORIES, isSavingsAccount } from '@/lib/constants';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr) {
  return format(new Date(dateStr), 'dd MMM yyyy');
}

const DAY_MS = 86_400_000;

/**
 * The budget cycle: when a period starts.
 *
 * With the default start day of 1 a period is a calendar month. Set it to 25
 * and the period runs the 25th to the 24th, so a salary that lands on the 25th
 * opens the period it is meant to cover instead of arriving three quarters of
 * the way through one.
 *
 * `followPaycheck` handles salaries paid early (a weekend or a holiday on the
 * 25th means payday is the working day before). Each period then starts on the
 * day its Paycheck transaction landed; a period whose salary isn't logged yet
 * (the next one, mostly) is assumed to start on the start day, moved back to
 * Friday when that falls on a weekend.
 *
 * It is module state because every date helper here needs it and none of them
 * are React. The store is its only writer (`syncCycle`, from
 * `useStore.subscribe`), and the helpers that depend on it take the start day
 * as a defaulted argument, so a caller that needs to be explicit (see
 * `useMonthFilter`) can be.
 */
let cycleStartDay = 1;
let followPaycheck = false;
/** 'yyyy-MM' → the day that period's salary landed. Empty unless `followPaycheck`. */
let paycheckStarts = new Map();
let lastTransactions = null;

/** A salary this far from its scheduled day is taken as that month's; further off, it's ignored. */
const PAYCHECK_WINDOW_DAYS = 10;

export function isPaycheck(t) {
  return t?.category === 'income' && t.subcategory === 'Paycheck';
}

function clampDay(day) {
  const n = Math.trunc(Number(day));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 28) : 1;
}

function monthKeyOf(y, m) {
  return format(new Date(y, m, 1), 'yyyy-MM');
}

/** The start day in month `m`, optionally pulled back to Friday off a weekend. */
function scheduledStart(y, m, startDay, shiftWeekend) {
  const d = new Date(y, m, startDay);
  if (shiftWeekend) {
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() - 1);
    else if (dow === 0) d.setDate(d.getDate() - 2);
  }
  return startOfDay(d);
}

function periodStart(y, m, startDay) {
  if (!followPaycheck) return scheduledStart(y, m, startDay, false);
  return paycheckStarts.get(monthKeyOf(y, m)) || scheduledStart(y, m, startDay, true);
}

/** Matches each logged salary to the period it opens. The earliest one in a period wins. */
function buildPaycheckStarts(transactions, startDay) {
  const starts = new Map();
  for (const t of transactions || []) {
    if (!isPaycheck(t)) continue;
    const day = startOfDay(new Date(t.date));
    let best = null;
    for (const offset of [-1, 0, 1]) {
      const y = day.getFullYear();
      const m = day.getMonth() + offset;
      const diff = Math.abs(day - scheduledStart(y, m, startDay, true)) / DAY_MS;
      if (diff <= PAYCHECK_WINDOW_DAYS && (!best || diff < best.diff)) best = { diff, key: monthKeyOf(y, m) };
    }
    if (!best) continue;
    const prev = starts.get(best.key);
    if (!prev || day < prev) starts.set(best.key, day);
  }
  return starts;
}

/**
 * Brings the helpers in line with the store. Cheap to call on every store
 * change: paydays are only re-read when the transactions or settings moved.
 */
export function syncCycle({ startDay, followPaycheck: follow, transactions } = {}) {
  const day = clampDay(startDay);
  const changed = day !== cycleStartDay || !!follow !== followPaycheck || transactions !== lastTransactions;
  cycleStartDay = day;
  followPaycheck = !!follow;
  if (changed) {
    lastTransactions = transactions;
    paycheckStarts = followPaycheck ? buildPaycheckStarts(transactions, cycleStartDay) : new Map();
  }
}

/** Logged paydays as one string, for React deps that must change when they do. */
export function paycheckSignature(transactions) {
  return (transactions || []).filter(isPaycheck).map((t) => t.date).sort().join(',');
}

/**
 * Which period a date falls in, labelled by the month the period *starts* in:
 * with a start day of 25, everything from 25 Sep to 24 Oct is `2026-09`.
 */
export function getMonthKey(date, startDay = cycleStartDay) {
  const d = new Date(date);
  if (!followPaycheck) {
    // A fixed boundary is the same date number every month, so shifting back
    // by `startDay - 1` days works for every month length (hence the cap at 28).
    if (startDay > 1) d.setDate(d.getDate() - (startDay - 1));
    return format(d, 'yyyy-MM');
  }
  // Boundaries move with paydays: the period is the latest one starting on or before the date.
  const day = startOfDay(d);
  const y = day.getFullYear();
  const m = day.getMonth();
  for (const offset of [1, 0, -1]) {
    if (day >= periodStart(y, m + offset, startDay)) return monthKeyOf(y, m + offset);
  }
  return monthKeyOf(y, m - 2);
}

export function getMonthRange(monthKey) {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  if (cycleStartDay === 1 && !followPaycheck) {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    start: periodStart(y, m, cycleStartDay),
    end: endOfDay(subDays(periodStart(y, m + 1, cycleStartDay), 1)),
  };
}

/** How many days the period covers: about a month, a few days either way when paydays move. */
export function getPeriodDays(monthKey) {
  const { start, end } = getMonthRange(monthKey);
  return Math.round((startOfDay(end) - start) / DAY_MS) + 1;
}

/** 1-based position of `now` inside the period; clamped to the period itself. */
export function getPeriodDayIndex(monthKey, now = new Date()) {
  const { start } = getMonthRange(monthKey);
  const index = Math.floor((startOfDay(now) - start) / DAY_MS) + 1;
  return Math.min(Math.max(index, 1), getPeriodDays(monthKey));
}

export function isCurrentPeriod(monthKey, now = new Date()) {
  return getMonthKey(now) === monthKey;
}

export function getMonthsInYear(year) {
  const start = startOfYear(new Date(year, 0));
  const end = endOfYear(start);
  return eachMonthOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM'));
}

export function filterTransactionsByMonth(transactions, monthKey, startDay = cycleStartDay) {
  return transactions.filter((t) => getMonthKey(t.date, startDay) === monthKey);
}

export function filterTransactionsByDateRange(transactions, from, to) {
  if (!from) return transactions;
  const start = startOfDay(new Date(from));
  const end = to ? endOfDay(new Date(to)) : endOfDay(new Date(from));
  return transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });
}

/**
 * A year is the twelve budget periods that start in it, the same way a month
 * key names the period that starts in that month. With a start day of 25,
 * 2026 runs 25 Jan 2026 – 24 Jan 2027; with a start day of 1 it's the
 * calendar year.
 */
export function filterTransactionsByYear(transactions, year, startDay = cycleStartDay) {
  const key = String(year);
  return transactions.filter((t) => getMonthKey(t.date, startDay).slice(0, 4) === key);
}

/**
 * How a transaction moves one account's balance: + in, − out, 0 if it doesn't
 * touch it. The single source of truth for balances and savings.
 */
export function balanceEffect(t, accountId, allCategories = CATEGORIES) {
  const type = allCategories[t.category]?.type;
  if (t.toAccount) {
    // Transfers and investments move money between two accounts.
    if (t.account === accountId && t.toAccount === accountId) return 0;
    if (t.account === accountId) return -t.amount;
    if (t.toAccount === accountId) return t.amount;
    return 0;
  }
  if (t.account !== accountId) return 0;
  const incoming = type === 'income' || (type === 'receivable' && t.flow === 'in');
  return incoming ? t.amount : -t.amount;
}

/** Ids of the accounts whose growth counts as saving. */
export function savingsAccountIds(accounts = []) {
  return accounts.filter(isSavingsAccount).map((a) => a.id);
}

/**
 * How much a transaction grows (or shrinks) the savings accounts. Salary
 * moved into savings is saving; moving it back out to spend, or paying a bill
 * straight from savings, is drawing on it. Receivables don't count: that
 * money is out, not spent, and it's coming back.
 */
export function savingsEffect(t, savingsIds, allCategories = CATEGORIES) {
  if (!savingsIds.length || allCategories[t.category]?.type === 'receivable') return 0;
  let delta = 0;
  for (const id of savingsIds) delta += balanceEffect(t, id, allCategories);
  return delta;
}

/**
 * Totals for a set of transactions.
 *
 * `savings` is what was set aside: transactions in a savings-type category,
 * plus the net growth of the savings accounts (`accounts` with the savings
 * role) over the same transactions. It can be negative when more came out of
 * savings than went in. With that, `net` is what's left in everyday accounts.
 */
export function calculateTotals(transactions, allCategories = CATEGORIES, accounts = []) {
  let income = 0, expenses = 0, savings = 0, investments = 0, transfers = 0;
  let lent = 0, returned = 0, savedInAccounts = 0;
  const savingsIds = savingsAccountIds(accounts);

  for (const t of transactions) {
    const type = allCategories[t.category]?.type;
    if (type === 'income') income += t.amount;
    else if (type === 'expense') expenses += t.amount;
    else if (type === 'savings') savings += t.amount;
    else if (type === 'investment') investments += t.amount;
    else if (type === 'transfer') transfers += t.amount;
    else if (type === 'receivable') {
      if (t.flow === 'in') returned += t.amount;
      else lent += t.amount;
    }
    savedInAccounts += savingsEffect(t, savingsIds, allCategories);
  }
  savings += savedInAccounts;

  // Receivables are reported (`lent` out, `returned` back) but never enter
  // `net`: fronting money that comes back isn't spending or earning.
  return {
    income, expenses, savings, savedInAccounts, investments, transfers, lent, returned,
    net: income - expenses - savings - investments,
  };
}

/**
 * What's still owed back across all time: money paid out under a receivable
 * category minus what has come back, overall and per subcategory.
 */
export function getReceivables(transactions, allCategories = CATEGORIES) {
  const bySub = {};
  let outstanding = 0;
  let count = 0;

  for (const t of transactions) {
    if (allCategories[t.category]?.type !== 'receivable') continue;
    const sign = t.flow === 'in' ? -1 : 1;
    const key = t.subcategory || 'Other';
    bySub[key] = (bySub[key] || 0) + sign * t.amount;
    outstanding += sign * t.amount;
    count += 1;
  }

  return {
    outstanding,
    count,
    bySubcategory: Object.entries(bySub)
      .map(([name, amount]) => ({ name, amount }))
      .filter((r) => r.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}

export function groupBySubcategory(transactions) {
  return transactions.reduce((acc, t) => {
    const key = t.subcategory || 'Uncategorized';
    if (!acc[key]) acc[key] = { items: [], total: 0 };
    acc[key].items.push(t);
    acc[key].total += t.amount;
    return acc;
  }, {});
}

/**
 * An account's balance is its opening balance plus everything that has moved
 * through it since. The opening balance is what the account already held on the
 * day it was added — without it the only way to start from a real figure is to
 * invent an income transaction, which would then distort that month's totals.
 */
export function getAccountBalance(
  transactions,
  accountId,
  allCategories = CATEGORIES,
  openingBalance = 0
) {
  let balance = Number(openingBalance) || 0;
  for (const t of transactions) balance += balanceEffect(t, accountId, allCategories);
  return balance;
}

export function calculatePercentages(totals) {
  const totalOut = totals.expenses + totals.savings + totals.investments;
  if (totalOut === 0) return { expenses: 0, savings: 0, investments: 0 };
  return {
    expenses: Math.round((totals.expenses / totalOut) * 100),
    savings: Math.round((totals.savings / totalOut) * 100),
    investments: Math.round((totals.investments / totalOut) * 100),
  };
}

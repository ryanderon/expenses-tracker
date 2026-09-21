import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format, parse, startOfMonth, endOfMonth, eachMonthOfInterval,
  startOfYear, endOfYear, startOfDay, endOfDay,
} from 'date-fns';
import { CATEGORIES } from '@/lib/constants';

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

/**
 * The day of the month a budget period starts on.
 *
 * With the default of 1 a period is a calendar month. Set it to 25 and the
 * period runs the 25th to the 24th, so a salary that lands on the 25th opens
 * the period it is meant to cover instead of arriving three quarters of the way
 * through one.
 *
 * It is module state because every date helper here needs it and none of them
 * are React. The store is its only writer — `useStore.subscribe` keeps it in
 * step — and the helpers that depend on it take it as a defaulted argument, so
 * a caller that needs to be explicit (see `useMonthFilter`) can be.
 */
let cycleStartDay = 1;

/** Clamped to 1–28 so every month actually has the day. */
export function setCycleStartDay(day) {
  const n = Math.trunc(Number(day));
  cycleStartDay = Number.isFinite(n) ? Math.min(Math.max(n, 1), 28) : 1;
  return cycleStartDay;
}

/**
 * Which period a date falls in, labelled by the month the period *starts* in:
 * with a start day of 25, everything from 25 Sep to 24 Oct is `2026-09`.
 *
 * Shifting back by a constant `startDay - 1` days works for every month length
 * because the boundary is the same date number each month — which is also why
 * the start day is capped at 28.
 */
export function getMonthKey(date, startDay = cycleStartDay) {
  const d = new Date(date);
  if (startDay > 1) d.setDate(d.getDate() - (startDay - 1));
  return format(d, 'yyyy-MM');
}

function getYearKey(date) {
  return format(new Date(date), 'yyyy');
}

export function getMonthRange(monthKey) {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  if (cycleStartDay === 1) {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    start: startOfDay(new Date(y, m, cycleStartDay)),
    end: endOfDay(new Date(y, m + 1, cycleStartDay - 1)),
  };
}

const DAY_MS = 86_400_000;

/** How many days the period covers — 28 to 31, depending on the months it spans. */
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

export function filterTransactionsByYear(transactions, year) {
  return transactions.filter((t) => getYearKey(t.date) === String(year));
}

export function calculateTotals(transactions, allCategories = CATEGORIES) {
  let income = 0, expenses = 0, savings = 0, investments = 0, transfers = 0;

  for (const t of transactions) {
    const type = allCategories[t.category]?.type;
    if (type === 'income') income += t.amount;
    else if (type === 'expense') expenses += t.amount;
    else if (type === 'savings') savings += t.amount;
    else if (type === 'investment') investments += t.amount;
    else if (type === 'transfer') transfers += t.amount;
  }

  return { income, expenses, savings, investments, transfers, net: income - expenses - savings - investments };
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
  for (const t of transactions) {
    const type = allCategories[t.category]?.type;
    if (type === 'transfer') {
      if (t.account === accountId) balance -= t.amount;
      if (t.toAccount === accountId) balance += t.amount;
    } else if (t.toAccount && t.account === accountId) {
      balance -= t.amount;
    } else if (t.toAccount && t.toAccount === accountId) {
      balance += t.amount;
    } else if (t.account === accountId) {
      balance += type === 'income' ? t.amount : -t.amount;
    }
  }
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

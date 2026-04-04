import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parse, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear, endOfYear, subMonths, startOfDay, endOfDay } from 'date-fns';

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

export function getMonthKey(date) {
  return format(new Date(date), 'yyyy-MM');
}

export function getYearKey(date) {
  return format(new Date(date), 'yyyy');
}

export function getMonthRange(monthKey) {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export function getMonthsInYear(year) {
  const start = startOfYear(new Date(year, 0));
  const end = endOfYear(start);
  return eachMonthOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM'));
}

export function filterTransactionsByMonth(transactions, monthKey) {
  return transactions.filter((t) => getMonthKey(t.date) === monthKey);
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

export function getSalaryCycleRange(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDate();
  let from, to;
  if (day >= 25) {
    from = new Date(d.getFullYear(), d.getMonth(), 25);
    to = new Date(d.getFullYear(), d.getMonth() + 1, 24);
  } else {
    const prev = subMonths(d, 1);
    from = new Date(prev.getFullYear(), prev.getMonth(), 25);
    to = new Date(d.getFullYear(), d.getMonth(), 24);
  }
  return { from, to };
}

export function filterTransactionsByYear(transactions, year) {
  return transactions.filter((t) => getYearKey(t.date) === String(year));
}

export function calculateTotals(transactions) {
  const income = transactions
    .filter((t) => t.category === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = transactions
    .filter((t) => ['bills', 'expenses'].includes(t.category))
    .reduce((sum, t) => sum + t.amount, 0);

  const savings = transactions
    .filter((t) => t.category === 'savings')
    .reduce((sum, t) => sum + t.amount, 0);

  const investments = transactions
    .filter((t) => t.category === 'investments')
    .reduce((sum, t) => sum + t.amount, 0);

  const transfers = transactions
    .filter((t) => t.category === 'transfer')
    .reduce((sum, t) => sum + t.amount, 0);

  return { income, expenses, savings, investments, transfers, net: income - expenses - savings - investments };
}

export function groupByCategory(transactions) {
  return transactions.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});
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

export function groupByAccount(transactions) {
  return transactions.reduce((acc, t) => {
    if (!acc[t.account]) acc[t.account] = { items: [], total: 0 };
    acc[t.account].items.push(t);
    acc[t.account].total += t.amount;
    return acc;
  }, {});
}

export function getAccountBalance(transactions, accountId) {
  let balance = 0;
  for (const t of transactions) {
    if (t.category === 'transfer') {
      if (t.account === accountId) balance -= t.amount;
      if (t.toAccount === accountId) balance += t.amount;
    } else if (t.toAccount && t.account === accountId) {
      // Investment (or any category) with toAccount: money leaves source
      balance -= t.amount;
    } else if (t.toAccount && t.toAccount === accountId) {
      // Investment (or any category) with toAccount: money enters destination
      balance += t.amount;
    } else if (t.account === accountId) {
      balance += t.category === 'income' ? t.amount : -t.amount;
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

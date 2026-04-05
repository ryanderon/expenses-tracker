export const CATEGORIES = {
  income: {
    label: 'Income',
    color: 'var(--chart-1)',
    hex: '#6b7d4a',
    subcategories: ['Freelance', 'Paycheck', 'Dividends', 'Other'],
  },
  bills: {
    label: 'Bills',
    color: 'var(--chart-2)',
    hex: '#d47d52',
    subcategories: ['Kos', 'Insurance', 'Subscriptions', 'Phones & Internet', 'Other'],
  },
  expenses: {
    label: 'Expenses',
    color: 'var(--chart-5)',
    hex: '#bf6438',
    subcategories: [
      'Groceries',
      'Transportation',
      'Dining Out',
      'Self Care',
      'Shopping',
      'Dating',
      'Gift',
      'Foods & Beverages',
      'Other',
    ],
  },
  savings: {
    label: 'Savings',
    color: 'var(--chart-3)',
    hex: '#506180',
    subcategories: ['Emergency Fund', 'Goal Savings', 'General Savings', 'Other'],
  },
  investments: {
    label: 'Investments',
    color: 'var(--chart-4)',
    hex: '#9070ad',
    subcategories: ['Reksa Dana', 'Stock', 'Cryptocurrency', 'Other'],
  },
  transfer: {
    label: 'Transfer',
    color: 'var(--muted-foreground)',
    hex: '#9c8c74',
    subcategories: ['Account Transfer'],
  },
};

export const CATEGORY_LIST = Object.entries(CATEGORIES).map(([key, val]) => ({
  id: key,
  ...val,
}));

export const ACCOUNT_COLORS = [
  '#6b7d4a', '#d47d52', '#506180', '#9070ad', '#bf6438',
  '#8a9f62', '#9c8c74', '#755691', '#687a9a', '#b8a992',
];

export function getSubcategories(categoryKey, customSubcategories = {}) {
  const defaults = CATEGORIES[categoryKey]?.subcategories || [];
  const custom = customSubcategories[categoryKey] || [];
  const withoutOther = defaults.filter((s) => s !== 'Other');
  const hasOther = defaults.includes('Other');
  return [...withoutOther, ...custom, ...(hasOther ? ['Other'] : [])];
}

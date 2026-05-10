export const CATEGORY_TYPES = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
  investment: 'Investment',
  transfer: 'Transfer',
};

export const CATEGORIES = {
  income: {
    label: 'Income',
    type: 'income',
    color: 'var(--chart-1)',
    hex: '#6b7d4a',
    subcategories: ['Freelance', 'Paycheck', 'Dividends', 'Other'],
  },
  bills: {
    label: 'Bills',
    type: 'expense',
    color: 'var(--chart-2)',
    hex: '#d47d52',
    subcategories: ['Kos', 'Insurance', 'Subscriptions', 'Phones & Internet', 'Other'],
  },
  expenses: {
    label: 'Expenses',
    type: 'expense',
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
    type: 'savings',
    color: 'var(--chart-3)',
    hex: '#506180',
    subcategories: ['Emergency Fund', 'Goal Savings', 'General Savings', 'Other'],
  },
  investments: {
    label: 'Investments',
    type: 'investment',
    color: 'var(--chart-4)',
    hex: '#9070ad',
    subcategories: ['Reksa Dana', 'Stock', 'Cryptocurrency', 'Other'],
  },
  transfer: {
    label: 'Transfer',
    type: 'transfer',
    color: 'var(--muted-foreground)',
    hex: '#9c8c74',
    subcategories: ['Account Transfer'],
  },
};

export const CATEGORY_LIST = Object.entries(CATEGORIES).map(([key, val]) => ({
  id: key,
  ...val,
}));

export function getAllCategories(customCategories = {}) {
  return { ...CATEGORIES, ...customCategories };
}

export function getAllCategoryList(customCategories = {}) {
  return Object.entries(getAllCategories(customCategories)).map(([key, val]) => ({
    id: key,
    ...val,
  }));
}

export const ACCOUNT_COLORS = [
  '#6b7d4a', '#d47d52', '#506180', '#9070ad', '#bf6438',
  '#8a9f62', '#9c8c74', '#755691', '#687a9a', '#b8a992',
];

export const CATEGORY_COLORS = [
  '#6b7d4a', '#d47d52', '#bf6438', '#506180', '#9070ad',
  '#9c8c74', '#8a9f62', '#755691', '#687a9a', '#b8a992',
  '#e07c5a', '#5a8f7b', '#7c6ea0', '#a89060', '#6a8cad',
];

export function getSubcategories(categoryKey, customSubcategories = {}, customCategories = {}) {
  if (CATEGORIES[categoryKey]) {
    const defaults = CATEGORIES[categoryKey].subcategories || [];
    const custom = customSubcategories[categoryKey] || [];
    const withoutOther = defaults.filter((s) => s !== 'Other');
    const hasOther = defaults.includes('Other');
    return [...withoutOther, ...custom, ...(hasOther ? ['Other'] : [])];
  }
  if (customCategories[categoryKey]) {
    return customCategories[categoryKey].subcategories || [];
  }
  return [];
}

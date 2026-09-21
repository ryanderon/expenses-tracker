export const CATEGORY_TYPES = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
  investment: 'Investment',
  transfer: 'Transfer',
};

// `labelKey` resolves through i18n; `label` is the untranslated fallback and
// the value user-created categories carry instead. See `categoryLabel()`.
export const CATEGORIES = {
  income: {
    label: 'Income',
    labelKey: 'categoriesData.income',
    type: 'income',
    color: 'var(--primary)',
    hex: '#00863b',
    subcategories: ['Freelance', 'Paycheck', 'Dividends', 'Other'],
  },
  bills: {
    labelKey: 'categoriesData.bills',
    label: 'Bills',
    type: 'expense',
    color: 'var(--amber)',
    hex: '#bc5800',
    subcategories: ['Kos', 'Insurance', 'Subscriptions', 'Phones & Internet', 'Other'],
  },
  expenses: {
    labelKey: 'categoriesData.expenses',
    label: 'Expenses',
    type: 'expense',
    color: 'var(--danger)',
    hex: '#cc2635',
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
    labelKey: 'categoriesData.savings',
    label: 'Savings',
    type: 'savings',
    color: 'var(--teal)',
    hex: '#007b7e',
    subcategories: ['Emergency Fund', 'Goal Savings', 'General Savings', 'Other'],
  },
  investments: {
    labelKey: 'categoriesData.investments',
    label: 'Investments',
    type: 'investment',
    color: 'var(--violet)',
    hex: '#8347cf',
    subcategories: ['Reksa Dana', 'Stock', 'Cryptocurrency', 'Other'],
  },
  transfer: {
    labelKey: 'categoriesData.transfer',
    label: 'Transfer',
    type: 'transfer',
    color: 'var(--muted-foreground)',
    hex: '#5f656c',
    subcategories: ['Account Transfer'],
  },
};

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
  '#00863b', '#007b7e', '#8347cf', '#bc5800', '#cc2635',
  '#2f9e6b', '#3f9ca0', '#9b6fdb', '#d07a2e', '#5f656c',
];

export const CATEGORY_COLORS = [
  '#00863b', '#cc2635', '#bc5800', '#007b7e', '#8347cf',
  '#2f9e6b', '#d4484f', '#d07a2e', '#3f9ca0', '#9b6fdb',
  '#5f656c', '#1f7a5c', '#a8323e', '#8a5a18', '#6a4fa8',
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

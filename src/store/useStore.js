import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';

const DEFAULT_ACCOUNTS = [
  { id: 'nobu', name: 'Nobu', type: 'Salary', color: '#6b7d4a' },
  { id: 'bca', name: 'BCA', type: 'Spending', color: '#d47d52' },
  { id: 'jenius', name: 'Jenius', type: 'Savings', color: '#506180' },
  { id: 'mandiri', name: 'Mandiri', type: 'Insurance & E-Money', color: '#8a9f62' },
  { id: 'bibit', name: 'Bibit', type: 'Investment', color: '#9070ad' },
];

const useStore = create(
  persist(
    (set, get) => ({
      transactions: [],
      budgets: {},
      accounts: DEFAULT_ACCOUNTS,
      customSubcategories: {},
      customCategories: {},
      budgetSettings: { rolloverEnabled: false },
      tourCompleted: false,
      userName: '',

      setUserName: (name) => set({ userName: name }),

      setTourCompleted: (completed) => set({ tourCompleted: completed }),

      // Account CRUD
      addAccount: (account) =>
        set((state) => ({
          accounts: [...state.accounts, { ...account, id: generateId() }],
        })),

      updateAccount: (id, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      deleteAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
        })),

      // Transaction CRUD
      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [
            ...state.transactions,
            { ...transaction, id: generateId(), createdAt: new Date().toISOString() },
          ],
        })),

      updateTransaction: (id, updates) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),

      // Budget
      setBudget: (monthKey, category, amount) =>
        set((state) => ({
          budgets: {
            ...state.budgets,
            [monthKey]: {
              ...state.budgets[monthKey],
              [category]: amount,
            },
          },
        })),

      getBudget: (monthKey, category) => {
        return get().budgets[monthKey]?.[category] || 0;
      },

      // Custom subcategories
      addCustomSubcategory: (category, name) =>
        set((state) => {
          const existing = state.customSubcategories[category] || [];
          if (existing.includes(name)) return state;
          return {
            customSubcategories: {
              ...state.customSubcategories,
              [category]: [...existing, name],
            },
          };
        }),

      removeCustomSubcategory: (category, name) =>
        set((state) => ({
          customSubcategories: {
            ...state.customSubcategories,
            [category]: (state.customSubcategories[category] || []).filter((s) => s !== name),
          },
        })),

      // Custom categories CRUD
      addCustomCategory: (id, category) =>
        set((state) => ({
          customCategories: { ...state.customCategories, [id]: category },
        })),

      updateCustomCategory: (id, updates) =>
        set((state) => ({
          customCategories: {
            ...state.customCategories,
            [id]: { ...state.customCategories[id], ...updates },
          },
        })),

      deleteCustomCategory: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.customCategories;
          return { customCategories: rest };
        }),

      addSubcategoryToCustomCategory: (categoryKey, name) =>
        set((state) => {
          const cat = state.customCategories[categoryKey];
          if (!cat || cat.subcategories.includes(name)) return state;
          return {
            customCategories: {
              ...state.customCategories,
              [categoryKey]: { ...cat, subcategories: [...cat.subcategories, name] },
            },
          };
        }),

      removeSubcategoryFromCustomCategory: (categoryKey, name) =>
        set((state) => {
          const cat = state.customCategories[categoryKey];
          if (!cat) return state;
          return {
            customCategories: {
              ...state.customCategories,
              [categoryKey]: { ...cat, subcategories: cat.subcategories.filter((s) => s !== name) },
            },
          };
        }),

      // Budget settings
      setRolloverEnabled: (enabled) =>
        set((state) => ({
          budgetSettings: { ...state.budgetSettings, rolloverEnabled: enabled },
        })),

      // Copy budget from one month to another
      copyBudgetFromMonth: (fromMonth, toMonth) =>
        set((state) => {
          const fromBudget = state.budgets[fromMonth];
          if (!fromBudget) return state;
          return {
            budgets: {
              ...state.budgets,
              [toMonth]: { ...fromBudget },
            },
          };
        }),

      // Prefill budget from actual spending
      prefillBudgetFromSpending: (sourceMonth, targetMonth) =>
        set((state) => {
          const sourceTx = state.transactions.filter(
            (t) => t.date.substring(0, 7) === sourceMonth
          );
          const newBudgets = {};
          const budgetCats = [
            'bills', 'expenses', 'savings', 'investments',
            ...Object.keys(state.customCategories),
          ];
          budgetCats.forEach((cat) => {
            const spent = sourceTx
              .filter((t) => t.category === cat)
              .reduce((sum, t) => sum + t.amount, 0);
            if (spent > 0) newBudgets[cat] = Math.round(spent);
          });
          return {
            budgets: {
              ...state.budgets,
              [targetMonth]: { ...state.budgets[targetMonth], ...newBudgets },
            },
          };
        }),

      // Data export/import
      exportData: () => {
        const { transactions, budgets, accounts, customSubcategories, customCategories, budgetSettings, userName } = get();
        return {
          transactions, budgets, accounts, customSubcategories, customCategories, budgetSettings, userName,
          exportedAt: new Date().toISOString(), version: 3,
        };
      },

      importData: (data) => {
        if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
          throw new Error('Invalid data format');
        }
        set({
          transactions: data.transactions,
          accounts: data.accounts,
          budgets: data.budgets || {},
          customSubcategories: data.customSubcategories || {},
          customCategories: data.customCategories || {},
          budgetSettings: data.budgetSettings || { rolloverEnabled: false },
          userName: data.userName || '',
          tourCompleted: data.tourCompleted ?? false,
        });
      },
    }),
    {
      name: 'penny-storage',
    }
  )
);

export default useStore;

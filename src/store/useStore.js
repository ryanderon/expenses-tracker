import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId, setCycleStartDay } from '@/lib/utils';
import idbStorage, { clearLegacyStorage } from '@/lib/idbStorage';
import { subKey } from '@/lib/budget';
import { DEFAULT_LOCALE } from '@/lib/i18n';
import { priceKey } from '@/lib/prices';
import { AI_MODELS, DEFAULT_MODEL } from '@/lib/aiModels';

const DEFAULT_ACCOUNTS = [
  { id: 'nobu', name: 'Nobu', type: 'Salary', color: '#6b7d4a' },
  { id: 'bca', name: 'BCA', type: 'Spending', color: '#d47d52' },
  { id: 'jenius', name: 'Jenius', type: 'Savings', color: '#506180' },
  { id: 'mandiri', name: 'Mandiri', type: 'Insurance & E-Money', color: '#8a9f62' },
  { id: 'bibit', name: 'Bibit', type: 'Investment', color: '#9070ad' },
];

const DEFAULT_BUDGET_SETTINGS = {
  // Day of the month a budget period starts on. 1 is a calendar month; 25 makes
  // a period run the 25th to the 24th, for pay that lands late in the month.
  cycleStartDay: 1,
  rolloverEnabled: false,
  rolloverMode: 'surplus', // 'surplus' carries leftovers only; 'full' also carries overspend
  rolloverExcluded: {},
  alertThreshold: 80,
};

const DEFAULT_AI_SETTINGS = {
  apiKey: '',
  model: DEFAULT_MODEL,
};

const DEFAULT_PRICE_META = {
  apiKey: '',
  baseCurrency: 'IDR',
  lastAutoFetchAt: null,
  autoFetchesToday: 0,
  dayKey: null,
  lastFetchAt: null,
  errors: {},
};

const DEFAULT_SYNC_SETTINGS = {
  googleEnabled: false,
  autoBackup: true,
  fileId: null,
  lastSyncedAt: null,
  account: null,
};

/** Fields that travel in a backup/restore payload. The API key never does. */
const DATA_KEYS = [
  'transactions', 'budgets', 'subBudgets', 'budgetTemplate', 'accounts',
  'customSubcategories', 'customCategories', 'budgetSettings', 'userName',
  'holdings',
];

const useStore = create(
  persist(
    (set, get) => {
      /**
       * Wraps `set` for anything that changes user data, so `dataUpdatedAt`
       * always reflects the latest edit. Google sync compares that timestamp
       * against the remote copy to decide which side is newer.
       */
      const setData = (updater) =>
        set((state) => ({
          ...(typeof updater === 'function' ? updater(state) : updater),
          dataUpdatedAt: Date.now(),
        }));

      return {
        transactions: [],
        budgets: {},
        subBudgets: {},
        budgetTemplate: { categories: {}, subcategories: {} },
        accounts: DEFAULT_ACCOUNTS,
        customSubcategories: {},
        customCategories: {},
        budgetSettings: DEFAULT_BUDGET_SETTINGS,
        aiSettings: DEFAULT_AI_SETTINGS,
        syncSettings: DEFAULT_SYNC_SETTINGS,
        tourCompleted: false,
        userName: '',
        locale: DEFAULT_LOCALE,
        lastUsedAccount: null,
        holdings: [],
        priceCache: {},
        priceRates: {},
        priceMeta: DEFAULT_PRICE_META,
        dataUpdatedAt: 0,

        setLocale: (locale) => set({ locale }),

        _hasHydrated: false,
        setHasHydrated: (v) => set({ _hasHydrated: v }),

        setUserName: (name) => setData({ userName: name }),

        setTourCompleted: (completed) => set({ tourCompleted: completed }),

        // Account CRUD
        addAccount: (account) =>
          setData((state) => ({
            accounts: [...state.accounts, { ...account, id: generateId() }],
          })),

        updateAccount: (id, updates) =>
          setData((state) => ({
            accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
          })),

        deleteAccount: (id) =>
          setData((state) => ({
            accounts: state.accounts.filter((a) => a.id !== id),
          })),

        // Transaction CRUD
        addTransaction: (transaction) =>
          setData((state) => ({
            transactions: [
              ...state.transactions,
              { ...transaction, id: generateId(), createdAt: new Date().toISOString() },
            ],
            // Quick add pre-selects this so the common case is amount + category.
            lastUsedAccount: transaction.account || state.lastUsedAccount,
          })),

        updateTransaction: (id, updates) =>
          setData((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === id ? { ...t, ...updates } : t
            ),
          })),

        deleteTransaction: (id) =>
          setData((state) => ({
            transactions: state.transactions.filter((t) => t.id !== id),
          })),

        // Budget — month-specific overrides
        setBudget: (monthKey, category, amount) =>
          setData((state) => ({
            budgets: {
              ...state.budgets,
              [monthKey]: { ...state.budgets[monthKey], [category]: amount },
            },
          })),

        clearBudget: (monthKey, category) =>
          setData((state) => {
            const month = { ...state.budgets[monthKey] };
            delete month[category];
            return { budgets: { ...state.budgets, [monthKey]: month } };
          }),

        setSubBudget: (monthKey, category, sub, amount) =>
          setData((state) => ({
            subBudgets: {
              ...state.subBudgets,
              [monthKey]: { ...state.subBudgets[monthKey], [subKey(category, sub)]: amount },
            },
          })),

        clearSubBudget: (monthKey, category, sub) =>
          setData((state) => {
            const month = { ...state.subBudgets[monthKey] };
            delete month[subKey(category, sub)];
            return { subBudgets: { ...state.subBudgets, [monthKey]: month } };
          }),

        getBudget: (monthKey, category) =>
          get().budgets[monthKey]?.[category] ??
          get().budgetTemplate?.categories?.[category] ?? 0,

        // Budget — recurring template that applies to every month by default
        setTemplateBudget: (category, amount) =>
          setData((state) => ({
            budgetTemplate: {
              ...state.budgetTemplate,
              categories: { ...state.budgetTemplate.categories, [category]: amount },
            },
          })),

        setTemplateSubBudget: (category, sub, amount) =>
          setData((state) => ({
            budgetTemplate: {
              ...state.budgetTemplate,
              subcategories: {
                ...state.budgetTemplate.subcategories,
                [subKey(category, sub)]: amount,
              },
            },
          })),

        /** Promotes a month's numbers into the template so they repeat. */
        saveMonthAsTemplate: (monthKey) =>
          setData((state) => ({
            budgetTemplate: {
              categories: {
                ...state.budgetTemplate.categories,
                ...(state.budgets[monthKey] || {}),
              },
              subcategories: {
                ...state.budgetTemplate.subcategories,
                ...(state.subBudgets[monthKey] || {}),
              },
            },
          })),

        /** Drops a month's overrides so it falls back to the template. */
        resetMonthToTemplate: (monthKey) =>
          setData((state) => {
            const { [monthKey]: _b, ...budgets } = state.budgets;
            const { [monthKey]: _s, ...subBudgets } = state.subBudgets;
            return { budgets, subBudgets };
          }),

        clearTemplate: () =>
          setData({ budgetTemplate: { categories: {}, subcategories: {} } }),

        // Custom subcategories
        addCustomSubcategory: (category, name) =>
          setData((state) => {
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
          setData((state) => ({
            customSubcategories: {
              ...state.customSubcategories,
              [category]: (state.customSubcategories[category] || []).filter((s) => s !== name),
            },
          })),

        // Custom categories CRUD
        addCustomCategory: (id, category) =>
          setData((state) => ({
            customCategories: { ...state.customCategories, [id]: category },
          })),

        updateCustomCategory: (id, updates) =>
          setData((state) => ({
            customCategories: {
              ...state.customCategories,
              [id]: { ...state.customCategories[id], ...updates },
            },
          })),

        deleteCustomCategory: (id) =>
          setData((state) => {
            const { [id]: _, ...rest } = state.customCategories;
            return { customCategories: rest };
          }),

        addSubcategoryToCustomCategory: (categoryKey, name) =>
          setData((state) => {
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
          setData((state) => {
            const cat = state.customCategories[categoryKey];
            if (!cat) return state;
            return {
              customCategories: {
                ...state.customCategories,
                [categoryKey]: {
                  ...cat,
                  subcategories: cat.subcategories.filter((s) => s !== name),
                },
              },
            };
          }),

        // Budget settings
        setBudgetSetting: (key, value) =>
          setData((state) => ({
            budgetSettings: { ...state.budgetSettings, [key]: value },
          })),

        setRolloverEnabled: (enabled) =>
          setData((state) => ({
            budgetSettings: { ...state.budgetSettings, rolloverEnabled: enabled },
          })),

        toggleRolloverExcluded: (category) =>
          setData((state) => {
            const excluded = { ...(state.budgetSettings.rolloverExcluded || {}) };
            if (excluded[category]) delete excluded[category];
            else excluded[category] = true;
            return { budgetSettings: { ...state.budgetSettings, rolloverExcluded: excluded } };
          }),

        // Copy budget from one month to another
        copyBudgetFromMonth: (fromMonth, toMonth) =>
          setData((state) => ({
            budgets: state.budgets[fromMonth]
              ? { ...state.budgets, [toMonth]: { ...state.budgets[fromMonth] } }
              : state.budgets,
            subBudgets: state.subBudgets[fromMonth]
              ? { ...state.subBudgets, [toMonth]: { ...state.subBudgets[fromMonth] } }
              : state.subBudgets,
          })),

        // Prefill budget from actual spending
        prefillBudgetFromSpending: (sourceMonth, targetMonth) =>
          setData((state) => {
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

        // Holdings
        addHolding: (holding) =>
          setData((state) => ({
            holdings: [...state.holdings, { ...holding, id: generateId() }],
          })),

        updateHolding: (id, updates) =>
          setData((state) => ({
            holdings: state.holdings.map((h) => (h.id === id ? { ...h, ...updates } : h)),
          })),

        deleteHolding: (id) =>
          setData((state) => ({
            holdings: state.holdings.filter((h) => h.id !== id),
          })),

        addBuyToHolding: (id, buy) =>
          setData((state) => ({
            holdings: state.holdings.map((h) =>
              h.id === id
                ? {
                    ...h,
                    buys: [...(h.buys || []), { ...buy, id: generateId() }]
                      .sort((a, b) => a.date.localeCompare(b.date)),
                  }
                : h
            ),
          })),

        removeBuyFromHolding: (id, buyId) =>
          setData((state) => ({
            holdings: state.holdings.map((h) =>
              h.id === id ? { ...h, buys: (h.buys || []).filter((b) => b.id !== buyId) } : h
            ),
          })),

        /**
         * Prices are cached, not user data — they never mark the store dirty,
         * so a background refresh can't trigger a Google Drive backup.
         */
        setQuotes: (quotes, rates, errors) =>
          set((state) => ({
            priceCache: { ...state.priceCache, ...quotes },
            priceRates: { ...state.priceRates, ...(rates || {}) },
            priceMeta: { ...state.priceMeta, errors: errors || {}, lastFetchAt: Date.now() },
          })),

        /** Records an automatic refresh against today's budget. */
        countAutoFetch: () =>
          set((state) => {
            const today = new Date().toISOString().slice(0, 10);
            const sameDay = state.priceMeta.dayKey === today;
            return {
              priceMeta: {
                ...state.priceMeta,
                dayKey: today,
                autoFetchesToday: sameDay ? state.priceMeta.autoFetchesToday + 1 : 1,
                lastAutoFetchAt: Date.now(),
              },
            };
          }),

        setPriceSettings: (updates) =>
          set((state) => ({ priceMeta: { ...state.priceMeta, ...updates } })),

        dropQuote: (exchange, symbol) =>
          set((state) => {
            const { [priceKey(exchange, symbol)]: _gone, ...rest } = state.priceCache;
            return { priceCache: rest };
          }),

        // AI settings — the API key stays local and is never exported or synced
        setAiSettings: (updates) =>
          set((state) => ({ aiSettings: { ...state.aiSettings, ...updates } })),

        // Sync settings
        setSyncSettings: (updates) =>
          set((state) => ({ syncSettings: { ...state.syncSettings, ...updates } })),

        // Data export/import
        exportData: () => {
          const state = get();
          const payload = {};
          for (const key of DATA_KEYS) payload[key] = state[key];
          return {
            ...payload,
            dataUpdatedAt: state.dataUpdatedAt || Date.now(),
            exportedAt: new Date().toISOString(),
            version: 5,
          };
        },

        importData: (data) => {
          if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
            throw new Error('Invalid data format');
          }
          setData({
            transactions: data.transactions,
            accounts: data.accounts,
            budgets: data.budgets || {},
            subBudgets: data.subBudgets || {},
            budgetTemplate: data.budgetTemplate || { categories: {}, subcategories: {} },
            customSubcategories: data.customSubcategories || {},
            customCategories: data.customCategories || {},
            budgetSettings: { ...DEFAULT_BUDGET_SETTINGS, ...(data.budgetSettings || {}) },
            holdings: data.holdings || [],
            userName: data.userName || '',
            tourCompleted: data.tourCompleted ?? true,
          });
        },
      };
    },
    {
      name: 'penny-storage',
      version: 6,
      storage: createJSONStorage(() => idbStorage),

      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        const next = { ...persisted };
        if (version < 5) {
          next.holdings = next.holdings || [];
          next.priceCache = next.priceCache || {};
          next.priceRates = next.priceRates || {};
          next.priceMeta = { ...DEFAULT_PRICE_META, ...(next.priceMeta || {}) };
        }
        if (version < 6) {
          // Opus was dropped from the model list; anyone still pointed at it
          // would send a model the picker can no longer show.
          const model = next.aiSettings?.model;
          if (model && !AI_MODELS.some((m) => m.id === model)) {
            next.aiSettings = { ...next.aiSettings, model: DEFAULT_MODEL };
          }
        }
        if (version < 4) {
          next.subBudgets = next.subBudgets || {};
          next.budgetTemplate = next.budgetTemplate || { categories: {}, subcategories: {} };
          next.budgetSettings = { ...DEFAULT_BUDGET_SETTINGS, ...(next.budgetSettings || {}) };
          next.aiSettings = { ...DEFAULT_AI_SETTINGS, ...(next.aiSettings || {}) };
          next.syncSettings = { ...DEFAULT_SYNC_SETTINGS, ...(next.syncSettings || {}) };
          next.dataUpdatedAt = next.dataUpdatedAt || Date.now();
        }
        return next;
      },

      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('Failed to load saved data:', error);
        // Before anything renders with the restored data: the date helpers read
        // the cycle start day from module state, not from React.
        setCycleStartDay(state?.budgetSettings?.cycleStartDay);
        state?.setHasHydrated(true);
        clearLegacyStorage();
      },
    }
  )
);

/**
 * Keep the date helpers' copy of the cycle start day in step with the store.
 *
 * This listener is registered before any component mounts, so it runs ahead of
 * React's own subscribers — by the time a page re-renders for the change, the
 * helpers it calls during that render already agree with it.
 */
useStore.subscribe((state) => {
  setCycleStartDay(state.budgetSettings?.cycleStartDay);
});

export default useStore;

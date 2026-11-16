import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  generateId, getMonthKey, savingsAccountIds, savingsEffect, syncCycle,
} from '@/lib/utils';
import idbStorage, { clearLegacyStorage } from '@/lib/idbStorage';
import { subKey } from '@/lib/budget';
import { DEFAULT_LOCALE } from '@/lib/i18n';
import { priceKey } from '@/lib/prices';
import { AI_MODELS, DEFAULT_MODEL, RETIRED_MODELS } from '@/lib/aiModels';
import { CATEGORIES, getAllCategories, getSubcategories, isNeutralType } from '@/lib/constants';

/**
 * Points every transaction that used one of `fromIds` (as source or
 * destination) at `toId` instead, or deletes them when `toId` is empty. Either
 * way nothing is left referencing an account that no longer exists.
 */
/**
 * An account as stored: older builds saved the card's computed `balance` and
 * `txCount` along with it when the account was edited.
 */
function cleanAccount({ balance: _balance, txCount: _txCount, ...account }) {
  return account;
}

function reassignAccounts(transactions, fromIds, toId) {
  const from = new Set(fromIds);
  if (!toId) return transactions.filter((t) => !from.has(t.account) && !from.has(t.toAccount));
  return transactions
    .map((t) => {
      if (!from.has(t.account) && !from.has(t.toAccount)) return t;
      const next = { ...t };
      if (from.has(t.account)) next.account = toId;
      if (from.has(t.toAccount)) next.toAccount = toId;
      return next;
    })
    // A transfer between the old account and its replacement now goes nowhere.
    .filter((t) => !(t.toAccount && t.toAccount === t.account));
}

/**
 * Same idea for categories. A moved transaction keeps its subcategory when the
 * new category has one by that name, and otherwise lands in its "Other".
 */
function reassignCategories(state, fromIds, toId) {
  const from = new Set(fromIds);
  if (!toId) return state.transactions.filter((t) => !from.has(t.category));
  const subs = getSubcategories(toId, state.customSubcategories, state.customCategories);
  const fallback = subs.includes('Other') ? 'Other' : subs[0] || 'Other';
  return state.transactions.map((t) => {
    if (!from.has(t.category)) return t;
    const { flow: _flow, ...rest } = t;
    return {
      ...rest,
      category: toId,
      subcategory: subs.includes(t.subcategory) ? t.subcategory : fallback,
    };
  });
}

/** Moves one key's amount onto another, adding to it if the target already has one. */
function moveKey(obj = {}, from, to) {
  if (!(from in obj)) return obj;
  const { [from]: amount, ...rest } = obj;
  return { ...rest, [to]: (rest[to] || 0) + amount };
}

/**
 * Points everything that used subcategory `from` of `category` at `to`:
 * transactions, per-month sub-budgets and the recurring template. If `to`
 * already has amounts they're added together, so a rename onto an existing
 * name is a merge.
 */
function moveSubcategoryData(state, category, from, to) {
  const fromKey = subKey(category, from);
  const toKey = subKey(category, to);
  return {
    transactions: state.transactions.map((t) => (
      t.category === category && (t.subcategory || 'Other') === from ? { ...t, subcategory: to } : t
    )),
    subBudgets: Object.fromEntries(
      Object.entries(state.subBudgets || {}).map(([m, v]) => [m, moveKey(v, fromKey, toKey)])
    ),
    budgetTemplate: {
      ...state.budgetTemplate,
      subcategories: moveKey(state.budgetTemplate?.subcategories, fromKey, toKey),
    },
  };
}

/** Where a removed subcategory's transactions go: the category's "Other", else its first one left. */
function fallbackSubcategory(state, category, removed) {
  const left = getSubcategories(category, state.customSubcategories, state.customCategories)
    .filter((s) => s !== removed);
  return left.includes('Other') ? 'Other' : left[0] || 'Other';
}

const unique = (list) => list.filter((s, i) => list.indexOf(s) === i);

/** Budget amounts keyed by a category that's going away. */
function dropCategoryBudgets(state, id) {
  const prefix = `${id}::`;
  const withoutCat = (obj = {}) => {
    const { [id]: _gone, ...rest } = obj;
    return rest;
  };
  const withoutSubs = (obj = {}) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith(prefix)));
  const perMonth = (byMonth = {}, fn) =>
    Object.fromEntries(Object.entries(byMonth).map(([m, v]) => [m, fn(v)]));

  return {
    budgets: perMonth(state.budgets, withoutCat),
    subBudgets: perMonth(state.subBudgets, withoutSubs),
    budgetTemplate: {
      categories: withoutCat(state.budgetTemplate?.categories),
      subcategories: withoutSubs(state.budgetTemplate?.subcategories),
    },
    budgetSettings: {
      ...state.budgetSettings,
      rolloverExcluded: withoutCat(state.budgetSettings?.rolloverExcluded),
    },
  };
}

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
  // Start each period on the day its salary (Paycheck) landed, for paydays
  // pulled forward by weekends and holidays.
  cycleFollowPaycheck: false,
  rolloverEnabled: false,
  rolloverMode: 'surplus', // 'surplus' carries leftovers only; 'full' also carries overspend
  rolloverExcluded: {},
  alertThreshold: 80,
};

const DEFAULT_AI_SETTINGS = {
  // One key per provider, so switching models never means re-entering a key.
  apiKeys: { google: '', groq: '', anthropic: '' },
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

        /** `moveTo` takes the account's transactions; without it they're deleted. */
        deleteAccount: (id, { moveTo } = {}) =>
          setData((state) => ({
            accounts: state.accounts.filter((a) => a.id !== id),
            transactions: reassignAccounts(state.transactions, [id], moveTo),
            lastUsedAccount: state.lastUsedAccount === id ? moveTo || null : state.lastUsedAccount,
          })),

        /** Re-homes transactions left on accounts that no longer exist. */
        reassignAccounts: (fromIds, toId) =>
          setData((state) => ({ transactions: reassignAccounts(state.transactions, fromIds, toId) })),

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

        /** Its transactions and budget amounts move to the category's "Other". */
        removeCustomSubcategory: (category, name) =>
          setData((state) => ({
            ...moveSubcategoryData(state, category, name, fallbackSubcategory(state, category, name)),
            customSubcategories: {
              ...state.customSubcategories,
              [category]: (state.customSubcategories[category] || []).filter((s) => s !== name),
            },
          })),

        /**
         * Renames a user-made subcategory of a built-in or custom category,
         * everywhere it's used. Built-in subcategory names can't be renamed:
         * they're translated for display and other code relies on them.
         */
        renameSubcategory: (category, from, to) =>
          setData((state) => {
            const name = String(to || '').trim();
            if (!name || name === from) return state;
            const swap = (list = []) => unique(list.map((s) => (s === from ? name : s)));
            const moved = moveSubcategoryData(state, category, from, name);

            if (CATEGORIES[category]) {
              const defaults = CATEGORIES[category].subcategories || [];
              return {
                ...moved,
                customSubcategories: {
                  ...state.customSubcategories,
                  // Renaming onto a built-in name merges into it; it isn't custom any more.
                  [category]: swap(state.customSubcategories[category]).filter((s) => !defaults.includes(s)),
                },
              };
            }
            const cat = state.customCategories[category];
            if (!cat) return state;
            return {
              ...moved,
              customCategories: {
                ...state.customCategories,
                [category]: { ...cat, subcategories: swap(cat.subcategories) },
              },
            };
          }),

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

        /** `moveTo` takes the category's transactions; without it they're deleted. */
        deleteCustomCategory: (id, { moveTo } = {}) =>
          setData((state) => {
            const { [id]: _, ...rest } = state.customCategories;
            return {
              customCategories: rest,
              transactions: reassignCategories(state, [id], moveTo),
              ...dropCategoryBudgets(state, id),
            };
          }),

        /** Re-homes transactions whose category no longer exists. */
        reassignCategories: (fromIds, toId) =>
          setData((state) => ({ transactions: reassignCategories(state, fromIds, toId) })),

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

        /** Its transactions and budget amounts move to the category's "Other" or first subcategory. */
        removeSubcategoryFromCustomCategory: (categoryKey, name) =>
          setData((state) => {
            const cat = state.customCategories[categoryKey];
            if (!cat) return state;
            return {
              ...moveSubcategoryData(state, categoryKey, name, fallbackSubcategory(state, categoryKey, name)),
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
            // By budget period, not calendar month, so a 25th–24th cycle
            // prefills from the period the user actually sees.
            const sourceTx = state.transactions.filter(
              (t) => getMonthKey(t.date) === sourceMonth
            );
            const newBudgets = {};
            // Every category the budget tracks: not income, not money that
            // only moves (transfers, receivables).
            const budgetCats = Object.entries(getAllCategories(state.customCategories))
              .filter(([, c]) => c.type !== 'income' && !isNeutralType(c.type))
              .map(([key]) => key);
            const allCategories = getAllCategories(state.customCategories);
            const savingsIds = savingsAccountIds(state.accounts);
            budgetCats.forEach((cat) => {
              let spent = sourceTx
                .filter((t) => t.category === cat)
                .reduce((sum, t) => sum + t.amount, 0);
              // Savings is mostly saved by moving money into a savings account,
              // so the target comes from how much those grew, as everywhere else.
              if (cat === 'savings') {
                spent += sourceTx.reduce((sum, t) => sum + savingsEffect(t, savingsIds, allCategories), 0);
              }
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

        // AI settings — API keys stay local and are never exported or synced
        setAiSettings: (updates) =>
          set((state) => ({ aiSettings: { ...state.aiSettings, ...updates } })),
        setAiKey: (provider, key) =>
          set((state) => ({
            aiSettings: {
              ...state.aiSettings,
              apiKeys: { ...state.aiSettings.apiKeys, [provider]: key },
            },
          })),

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
            accounts: data.accounts.map(cleanAccount),
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
      version: 9,
      storage: createJSONStorage(() => idbStorage),

      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        const next = { ...persisted };
        if (version < 9) {
          next.accounts = (next.accounts || []).map(cleanAccount);
        }
        if (version < 8) {
          // Claude Haiku 4.5 and Sonnet 5 left the list for their 5.5
          // successors. Same key, same provider: carry the choice forward
          // rather than letting the check below drop it to the free default.
          const model = next.aiSettings?.model;
          if (RETIRED_MODELS[model]) {
            next.aiSettings = { ...next.aiSettings, model: RETIRED_MODELS[model] };
          }
        }
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
        if (version < 7) {
          // The single Anthropic key became one key per provider. Anyone who
          // never added a key moves to the free default instead of staying on
          // a paid model they have no key for.
          // Keys already stored per provider are kept, so a migration can
          // never wipe one.
          const { apiKey = '', ...rest } = next.aiSettings || {};
          const apiKeys = {
            ...DEFAULT_AI_SETTINGS.apiKeys,
            ...(rest.apiKeys || {}),
            ...(apiKey ? { anthropic: apiKey } : {}),
          };
          const hasKey = Object.values(apiKeys).some(Boolean);
          next.aiSettings = {
            ...DEFAULT_AI_SETTINGS,
            ...rest,
            apiKeys,
            model: hasKey ? rest.model || DEFAULT_MODEL : DEFAULT_MODEL,
          };
        }
        return next;
      },

      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('Failed to load saved data:', error);
        // Before anything renders with the restored data: the date helpers read
        // the cycle from module state, not from React.
        syncCycleFrom(state);
        state?.setHasHydrated(true);
        clearLegacyStorage();
      },
    }
  )
);

/**
 * Keep the date helpers' copy of the cycle in step with the store: the start
 * day, whether periods follow paydays, and (for that) the transactions.
 *
 * This listener is registered before any component mounts, so it runs ahead of
 * React's own subscribers — by the time a page re-renders for the change, the
 * helpers it calls during that render already agree with it.
 */
function syncCycleFrom(state) {
  syncCycle({
    startDay: state?.budgetSettings?.cycleStartDay,
    followPaycheck: state?.budgetSettings?.cycleFollowPaycheck,
    transactions: state?.transactions,
  });
}

useStore.subscribe(syncCycleFrom);

export default useStore;

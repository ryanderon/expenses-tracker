# Data model (`src/store/useStore.js`)

- **Persistence:** zustand `persist`, name `penny-storage`, storage `createJSONStorage(() => idbStorage)`. There is no `partialize`, so every non-function key is persisted.
- **Version:** **9**.
- **Storage layer** (`src/lib/idbStorage.js`): IndexedDB database `penny`, store `kv`. On first read it adopts legacy `localStorage['penny-storage']`, and it falls back to localStorage if IndexedDB fails.

## User data

These keys are written through `setData()`, which stamps `dataUpdatedAt`.

- **`transactions[]`:** `{ id, createdAt, category, subcategory, account, amount, date, note?, toAccount?, flow? }`.
  - `subcategory` is stored as an English string; the default is `'Other'`.
  - `amount` is always positive.
  - `date` is `'yyyy-MM-dd'`.
  - `toAccount` is set only for transfers and investments.
  - `flow` is `'in'` only on receivable repayments.
  - Old imports may carry `description` instead of `note`, so read `t.note || t.description`.
- **`accounts[]`:** `{ id, name, type (free text), role? ('spending' | 'savings' | 'investment'), color (hex), openingBalance? }`. Nothing else: see `cleanAccount`. A missing `role` is inferred at read time (`accountRole`), so old data needs no migration. `DEFAULT_ACCOUNTS` are nobu, bca, jenius, mandiri and bibit.
- **`budgets`:** `{ 'yyyy-MM': { categoryKey: amount } }`, the per-month overrides.
- **`subBudgets`:** `{ 'yyyy-MM': { 'cat::Sub': amount } }`, keyed with `subKey()` from `lib/budget.js`.
- **`budgetTemplate`:** `{ categories: { cat: amt }, subcategories: { 'cat::Sub': amt } }`.
- **`budgetSettings`:** `{ cycleStartDay: 1, cycleFollowPaycheck: false, rolloverEnabled, rolloverMode: 'surplus' | 'full', rolloverExcluded: { cat: true }, alertThreshold: 80 }`.
- **`customSubcategories`:** `{ builtInCatKey: [names] }`.
- **`customCategories`:** `{ slug: { label, type, color, hex, subcategories, isCustom: true } }`.
- **`holdings[]`:** `{ id, symbol, exchange, micCode, name, currency, type, lotSize, buys: [{ id, date, shares, price, fee }] }`. `shares` = lots × lotSize.
- **`userName`.**

## Settings and caches

These keys are written with plain `set`, so they never trigger a backup.

- **`aiSettings`:** `{ apiKeys: { google, groq, anthropic }, model, effort? }`. When `effort` is unset, `DEFAULT_EFFORT` (`'medium'`) is used.
- **`priceCache`:** `{ 'EXCH:SYM': { price, previousClose, changePct, currency, isMarketOpen, at } }`.
- **`priceRates`:** `{ USD: rateToBase }`.
- **`priceMeta`:** `{ apiKey, baseCurrency: 'IDR', lastAutoFetchAt, autoFetchesToday, dayKey, lastFetchAt, errors }`.
- **`syncSettings`:** `{ googleEnabled, autoBackup, fileId, lastSyncedAt, account }`.
- **`locale`, `tourCompleted`, `lastUsedAccount`, `dataUpdatedAt`, `_hasHydrated`.**
- **Theme** is outside the store, in `localStorage['penny-theme']`.
- **The AI chat thread** is in the separate, non-persisted `src/store/useChatStore.js`.

## Backup and export

`exportData()` writes only `DATA_KEYS`, plus `dataUpdatedAt`, `exportedAt` and a hard-coded `version: 5`.
- **`DATA_KEYS`:** transactions, budgets, subBudgets, budgetTemplate, accounts, customSubcategories, customCategories, budgetSettings, userName, holdings.
- **Excluded on purpose:** API keys (`aiSettings`, `priceMeta`), caches, sync settings, locale.

`importData()`:
- Requires `transactions` and `accounts` arrays.
- Replaces everything, and merges `budgetSettings` with defaults.

Google Drive sync (`useGoogleBackup`):
- Stores a single `penny-backup.json` in `drive.appdata`.
- Auto-backup is debounced 20 s after `dataUpdatedAt` changes and flushed on `visibilitychange`.
- On connect it checks for conflicts, comparing `dataUpdatedAt`.
- Requires `VITE_GOOGLE_CLIENT_ID`.

## Migrations (`migrate`, in code order)

| Branch | What it does |
|---|---|
| `< 9` | Strips computed `balance` / `txCount` from stored accounts (`cleanAccount`). |
| `< 8` | Maps retired Claude model ids to their successors via `RETIRED_MODELS` (`claude-haiku-4-5` → `claude-haiku-5-5`, `claude-sonnet-5` → `claude-sonnet-5-5`). |
| `< 5` | Adds holdings, priceCache, priceRates and priceMeta. |
| `< 6` | Resets a model that isn't in `AI_MODELS` to `DEFAULT_MODEL`. |
| `< 4` | Defaults subBudgets, budgetTemplate, budgetSettings, aiSettings, syncSettings and dataUpdatedAt. |
| `< 7` | Moves the single `apiKey` to `apiKeys.anthropic`. With no key, resets the model to the free default. |

Store actions that keep references valid:
- `deleteAccount(id, { moveTo })` and `deleteCustomCategory(id, { moveTo })` re-home the item's transactions, or delete them when `moveTo` is absent.
- `deleteCustomCategory` also drops the category's budgets, subBudgets, template entries and `rolloverExcluded` flag.
- `reassignAccounts(fromIds, toId)` and `reassignCategories(fromIds, toId)` fix orphans that older versions left behind.

To change the persisted shape:
- Bump `version` and add a branch.
- If the data should be backed up, add it to `DATA_KEYS` and handle it in `importData`.
- New built-in categories need no migration: `getAllCategories()` merges `CATEGORIES` at read time.

`onRehydrateStorage` does three things:
- Calls `syncCycle` (via `syncCycleFrom`) with the start day, follow-paycheck flag and transactions before anything renders. The same function is the store's `subscribe` listener.
- Sets `_hasHydrated`.
- Clears the legacy localStorage copy.

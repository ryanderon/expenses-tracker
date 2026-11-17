# Pages

Routes live in `src/App.jsx`. Analytics, Reports, Portfolio, Insights and Settings are lazy-loaded. `/more` redirects to `/settings`, and unknown paths redirect to `/`.

## `/` Dashboard (`src/pages/Dashboard.jsx`)

- **Period:** `MonthField` picker.
- **Hero:** shows `totals.net`, plus income and outflow (expenses + savings + investments).
- **Stats:** four `StatCard`s and allocation `Ring`s (each type as a % of income).
- **Breakdown:** a `StackedBar` over every category except income and the neutral types.
- **Top spending:** the top 5 expense subcategories via `topSubcategoryRows` ("Lainnya · Tagihan").
- **Labels:** the hero says "Keluar" (outflow); the stat card says "Pengeluaran" (expenses only).
- **Trend:** year chart from `src/components/TrendChart.jsx`, the only Recharts user (lazy-loaded).
- **Accounts:** balance tiles plus a portfolio tile. The page mounts `usePrices()` to refresh prices.

## `/today` Today (`src/pages/Today.jsx`)

- **Allowance ring:** `getDailyAllowance` over `report.spendBudget` (expense categories only). When `report.spending.isOver`, the ring shows "Lewat batas" with the amount.
- **Period summary:** uses `report.spending`, not the totals that include goals. Both the ring and the no-budget card carry `data-tour="today-hero"`.
- **Alerts:** from `buildBudgetReport().alerts`.
- **Progress:** a "month so far" bar with a pacing tick.
- **Entries:** today's transactions plus the 5 most recent. `EntryRow` shows `+` for income and for receivable repayments.
- **No budget:** links to `/budget`. This page still uses shadcn `Card`, `Progress` and lucide icons.

## `/transactions` Transactions (`src/pages/Transactions.jsx`)

- **Period:** `PeriodField`, either `{ mode: 'month', month }` or `{ mode: 'range', from, to }`.
- **Search:** matches only the raw `subcategory` and `note`.
- **Filters:** category, subcategory and account. The account filter matches `account` or `toAccount`.
- **Totals:** Masuk is income; Pengeluaran is expense-type only, matching Dashboard and Budget.
- **Rows:** `TYPE_ICON` / `TYPE_TONE` set the look per type. Receivables show sky-coloured amounts, a `−` or `+` sign, and a "Keluar dulu" or "Udah balik" badge.
- **Edit:** reopens `QuickAdd` with `editing`.

## QuickAdd (`src/components/QuickAdd.jsx`)

- **Pickers:** category, subcategory and account are `ChoicePill`s. The account defaults to `lastUsedAccount`.
- **Destination account:** `toAccount` is required only when `category === 'transfer' || category === 'investments'`. This checks the category id, not the type.
- **Receivable categories:** add a direction picker ("Keluar dulu" / "Udah balik") that writes `flow: 'in'` for repayments; the account label becomes "Masuk ke akun". The form saves `flow: undefined` for every other category.

## `/insights` Insights (`src/pages/Insights.jsx`)

- **Tab:** stored in `useChatStore.tab`.
- **Ringkasan (summary):** `InsightsSummary` → `buildInsights(state, { monthKey, t })` in `src/lib/insights.js`. It shows a health score `Ring` plus rule cards.
  - **Rules:** pace vs. your own prior months to the same day; projection; budget over / trending / OK; subcategory movers; savings rate or deficit; fixed costs; where to cut (25th percentile of your own months); small purchases under 50k; weekend vs. weekday (56-day window); outliers (3× median); concentration (≥35%); no-spend days.
  - **Health score weights:** savings 30, spending 25, fixed 15, budget 15, runway 15. It needs at least 2 components.
- **Tanya AI:** the chat. See the AI section of `SKILL.md`.
  - **Composer:** grows with the text, with a period chip (`ScopePicker`) and a model chip (`ModelPicker`). On touch devices Enter inserts a newline; on desktop Enter sends.
  - **Actions:** stop keeps the partial answer; errors show inline with retry and settings links; copy and regenerate; a jump-to-latest button.

## `/analytics` Analytics (`src/pages/Analytics.jsx`)

- **Period:** `useReportPeriod()` + `ReportPeriodControls`.
  - Monthly: a budget period or a custom range.
  - Yearly: the cycle-aware year.
- **Panels:** distribution of outflow categories (income and neutral types excluded), top 6 expense subcategories (`topSubcategoryRows`), `ComparisonBars` (each period of `chartYear`), category mix, and quick stats (the average is per expense, not per transaction).
- **Category mix:** Bills is its own row; Expenses is `totals.expenses − bills`.
- **`ComparisonBars` on a phone:** a year of groups (~36px each) is wider than the card, so it scrolls sideways inside it and opens on the latest month with data. The Panel needs `min-w-0`: a grid item otherwise widens to fit the chart and spills off the screen, which a page-level `scrollWidth` check doesn't catch.

## `/budget` Budget (`src/pages/Budget.jsx`)

- **Monthly tab ("Periode ini"):**
  - Three actions: "Isi otomatis" (a menu: use last period's actuals, or copy last period's limits), "Pakai tiap periode" (save as template), and "Atur". The Atur popover holds rollover and its mode, the warning threshold (`alertThreshold`), reset to template, and managing subcategories.
  - The main card is spending vs limits (`report.spending`).
  - Two sections: "Batas pengeluaran" (limit cards) and "Target nyisihin" (goal cards for Savings/Investments: collected vs target, "Tercapai", no pace marker and no projection).
  - With no limits set, the usage panel shows `budget.noBudgetHint` instead of "of Rp 0 · 0%".
  - Alerts (limits only) are a compact banner: red if any limit is passed, amber while they're only close.
  - The stats (Masuk, Batas pengeluaran, Pengeluaran, Belum dianggarkan) are one panel of `SummaryCell`s split by hairlines: 2×2 on a phone, 1×4 from `lg`. Label on top and the value full width below. Four `StatCard`s side by side cut the values off at phone width ("Rp 23.2…").
  - Spending card: the amount and the percent share a row, with "dari Rp …" on its own line. Below it, the pace figures are label-and-value rows on a phone and three columns from `sm`.
  - A `CategoryCard` per category with category and subcategory overrides (`BudgetAmountInput` commits on blur or Enter).
- **Recurring tab ("Tiap periode"):** `TemplateTab` edits `budgetTemplate`.
- **Manage categories dialog:** adds or removes `customSubcategories`.

## `/reports` Reports (`src/pages/Reports.jsx`)

- **Period:** `useReportPeriod()` + `ReportPeriodControls`, as on Analytics. The summary header shows `period.label`.
- **Content:** a category → subcategory table (neutral types excluded), a grade from `gradeFor(savingsRate, expenseRate)` (over 100% shows `gradeOverBody`), rate meters, an account-usage table, and Excel export (named `penny-<fileKey>`).

## `/portfolio` Portfolio (`src/pages/Portfolio.jsx`)

- **Adding holdings:** `SymbolSearch`, then `AddHoldingDialog` (lots × `lotSizeFor(exchange)`, price, fee, date). Buying the same symbol and exchange averages in via `addBuyToHolding`.
- **Rows:** `HoldingRow` shows per-lot buys and can delete a single buy or the whole holding.
- **Not linked to transactions.**
- **Prices:** IDX and other Yahoo-suffix exchanges go through the `/api/quote` Yahoo proxy; everything else uses Twelve Data with the user's key (`priceMeta.apiKey`).

## `/accounts` Accounts (`src/pages/Accounts.jsx`)

- **`NetWorthPanel`:** everyday, savings and investment accounts by `accountRole`, portfolio market value, and outstanding receivables, as segments of a stacked bar with a legend.
- **Role:** each card shows its role badge (Harian / Tabungan / Investasi). The form sets it with a role picker.
- **Account cards:** balance (`getAccountBalance`) and transaction count. CRUD via `AccountFormDialog` (name, free-text type, colour, `openingBalance`).
- **Deleting:** an account with transactions opens `ReassignDialog` (move them to another account, or delete them). Transfers that would end up from and to the same account are dropped.
- **Orphans:** transactions on accounts that no longer exist show an amber "fix" card, which runs `reassignAccounts`.
- **`InvestmentCard`** links to `/portfolio`.
- **`ReceivablesCard`** shows the total still owed back and a per-subcategory breakdown. It appears once any receivable transaction exists.

## `/categories` Categories (`src/pages/Categories.jsx`)

- **Built-in categories:** you can only add, rename or remove *custom* subcategories.
- **Custom subcategory chips:** tap the name to rename it (`RenameSubDialog`, which warns when the rename will merge into an existing name). × removes it, after a confirm if it's in use.
- **Custom categories:** CRUD. The id is a slug of the label: `{ label, type, color: 'var(--chart-5)', hex, subcategories, isCustom: true }`. The type picker hides the neutral types; its labels come from `TYPE_BADGES`.
- **Type badges:** `TYPE_BADGES` covers every type, receivable (sky) included.
- **Deleting:** a category with transactions opens `ReassignDialog`. The default target is the built-in category of the same type (`DEFAULT_TARGET`).
- **Orphans:** transactions whose category no longer exists show an amber "fix" card, which runs `reassignCategories`.
- **i18n:** all strings are translated.

## `/split-bill` Split Bill (`src/pages/SplitBill.jsx`)

- **No persistence:** all state is local to the component, and nothing is written to transactions.
- **Splitting:** items are assigned to people. Tax, service and discount are a percentage if the value is ≤100, otherwise an absolute amount, and are spread proportionally.
- **OCR:** `import('tesseract.js')` → `createWorker('ind+eng')` → `parseReceiptText`.
- **Share:** `navigator.share`, with a clipboard fallback. The share text, OCR errors and the default "Me" person are translated (`splitBill.*`).

## `/settings` Settings (`src/pages/Settings.jsx`)

Sections, in order:
- **Language.**
- **Cycle:** presets 1, 20, 25 or 28, or a custom day from 1 to 28, plus the "Mulai periode pas gaji masuk" toggle (`cycleFollowPaycheck`).
- **AI:** provider, key with a verify button, model, and effort for Claude.
- **Prices:** Twelve Data key (`PricesSection`). Its selling point is coverage: with a key every stock gets a price; without one, only exchanges in `YAHOO_SUFFIXES` (IDX, LSE, SGX, JPX…) do, through the Yahoo proxy.
- **Google Drive backup:** includes the `ConflictDialog`.
- **Data:** name, counts, storage size, JSON export and import, Excel export.

## Shell (`src/App.jsx`)

- **Desktop:** a sidebar.
- **Mobile:** a menu sheet plus a bottom nav.
- **Header actions:** sync indicator, tour, theme toggle, a data menu (backup or restore a JSON file, Excel), and an avatar linking to `/settings`.
- **Startup:** `HydrationGate` waits for IndexedDB; `UserNameModal` can't be dismissed until a name is set on first run.
- **Height vars:** `useHeightVar` publishes `--app-header-h` and `--bottom-nav-h`.
- **Tour targets:** the desktop sidebar nav has `data-tour="nav-sidebar"`; the mobile bottom-bar menu button has `data-tour="nav-more"`.
- **Tour behaviour:** it auto-starts when `!tourCompleted`. `TourTrigger` sets `tourCompleted = false` and reloads the page.
- **Tour steps, in order:**
  1. Today hero (`/today`)
  2. Today add button
  3. Budget actions
  4. Insights header
  5. Navigation: sidebar on desktop, "Lainnya" on mobile
- **PWA:** `public/sw.js` (network-first navigation, cache-first assets, skips `/api`) and `public/manifest.json`. The service worker is registered in production only.
  - `public/privacy.html` is the privacy policy, static so it loads without JS. Google's consent screen requires its URL before the OAuth app can be published, and the sidebar footer links to it. Keep it true when the app starts sending data anywhere new.
  - It also keeps Google Fonts (Manrope and Material Symbols, served from cache and refreshed in the background), so the icons survive opening the app offline. Without that cache they turn into their names and break the layout.

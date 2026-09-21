# Penny

A personal finance tracker I built for myself to keep tabs on where my money goes each month. Handles income, expenses, savings, investments, and transfers between accounts — basically everything I need to stay on top of my finances without relying on spreadsheets.

## What it does

- **Dashboard** — Net balance for the month as a gradient hero, four stat tiles, allocation rings, a spending breakdown, top spending, a year trend, and account balances
- **Today** — Daily allowance: what's left to spend today, and what you've spent against it
- **Transactions** — Every entry, searchable and filterable, with add/edit in one modal
- **AI Insights** — Ask Claude about your spending; it reads a summary of your actual numbers
- **Analytics** — Category distribution, expense breakdown, month-over-month comparison, category mix, quick stats
- **Budget** — Recurring monthly limits with per-month overrides, subcategory limits, multi-month rollover, and pacing (see below)
- **Reports** — Grouped summary table, a financial-health score with rate meters, and account usage
- **Investments** — Track holdings by lot and see what they're worth now, with delayed prices from Twelve Data
- **Accounts · Categories · Split Bill · Settings**
- **Transfers** — Move money between accounts (e.g. salary → savings) without it counting as income or expense
- **Backup/Restore** — Auto-backup to your own Google Drive, plus JSON export/import
- **Bilingual** — English by default, Bahasa Indonesia available
- **PWA** — Installable on mobile, works offline

## Design

The UI follows `Penny redesign project/Penny Redesign.dc.html` — the design doc is vendored in the repo so the tokens have a source of truth.

- **Type** is Manrope (400–800); icons are Material Symbols Outlined.
- **Colour** is defined in oklch in [src/index.css](src/index.css): a green `--primary`, plus `--teal`, `--violet`, `--amber` and `--danger` accents, each with a soft tint for badge backgrounds. Light and dark are both ported from the design. `--chart-1..5` mirror the design's chart palette exactly.
- **Surfaces** are 20px-radius cards on a hairline border with a soft two-layer shadow. shadcn's `Card` was retuned to match, so pages that don't use the design primitives still land in the same language.
- **Repeated shapes** live in [src/components/ui/design.jsx](src/components/ui/design.jsx) — `Panel`, `StatCard`, `IconBadge`, `StackedBar`, `LegendRow`, `Meter`, `Ring`, `SegmentedTabs`, `ChoicePill`, `InitialBadge`. Adjust a radius there and it lands everywhere.
- **Dates** use [src/components/ui/date-fields.jsx](src/components/ui/date-fields.jsx) — `MonthField` (pill + month/year grid) and `DateField` (pill + calendar popover). Native `<input type="month">` and `type="date"` render an OS widget that ignores every token in the design, so nothing uses them. Every period control in the app is the same pill; every tab strip is `SegmentedTabs`.
- **Amounts** use [src/components/ui/currency-input.jsx](src/components/ui/currency-input.jsx) in `sm`/`md`/`lg`. The `Rp` prefix is a flex sibling of the input, not an overlay — an absolutely positioned prefix has to be dodged with left padding, which lines up at exactly one font size and drifts at every other.

Navigation is the design's twelve-item sidebar. Two entries post-date the design — **Today** and **Investments** — and are slotted beside their nearest relatives. The design is desktop-only, so phones additionally get a bottom bar (Dashboard · Transactions · Budget · Insights) plus a menu button that opens the full sidebar.

Charts stay on Recharts, recoloured to the design palette; Recharts is lazy-loaded so it never blocks the dashboard's first paint.

## The month doesn't have to be a calendar month

If you're paid on the 25th, a calendar month splits your pay from the spending it covers: the 1st opens with no income and a net that only goes down, and the money that has to last you until the 24th is filed under last month.

**Settings → Budget period** sets the day a period starts. At 25, the period runs the 25th to the 24th and is named after the month it starts in — 25 Sep to 24 Oct is `2026-09`, shown as `25 Sep – 24 Oct 2026`. Everything downstream follows: the dashboard, budget pacing, the daily allowance, reports, and the snapshot handed to the AI.

Any day from 1 to 28 works. It stops at 28 so the boundary exists in February; 1 means a plain calendar month, which is the default.

## Starting balances

An account's balance is its **opening balance** plus everything that has moved through it since. The opening balance is set on the account itself — what it already held the day you added it.

Without it, the only way to start from a real figure would be to enter a fake income transaction, which would then show up in that month's income, in the budget, in reports, and in the AI's view of your finances. An opening balance stays out of all of them: it moves the balance and nothing else.

## The daily number

Today's allowance is the budget still unspent **before today**, divided over the days still to come:

```
allowance = (total budget − spent before today) ÷ days remaining
left today = allowance − spent today
```

It's fixed at the start of the day, so the target you wake up to doesn't shift every time you buy coffee. Underspending yesterday raises today's allowance automatically — there's no separate carry-over to manage. Outside the current period there's no "today" to budget for, so the screen falls back to the month view.

"Days remaining" counts days left in the budget period, not the calendar month, so a custom start day is handled without a special case.

If no budget is set, the screen says so and points at the Budget page rather than showing a meaningless zero.

## Budget

- **Recurring budget** — Set an amount once on the *Recurring* tab and it applies to every month. The *Monthly* tab only overrides a month when you actually change it, so there's no copying month to month.
- **Subcategory limits** — Budget "Dining Out" rather than all of "Expenses". When any subcategory has a limit, the parent total is derived from its children.
- **Rollover** — Unused budget accumulates across months, not just from last month. `Carry surplus only` forgives overspend; `Carry surplus + deficit` makes it follow you forward. Can be disabled per category.
- **Pacing** — A tick on each progress bar marks where straight-line spending says you should be today, alongside a projected month-end total and a safe-to-spend-per-day figure. Categories that are over, near the limit, or trending over get surfaced in an alert banner.

## AI Insights

Bring your own [Anthropic API key](https://console.anthropic.com/settings/keys) — add it in **Settings**. Requests go straight from your browser to Anthropic; the key is stored only on your device and is deliberately excluded from every backup and export.

Instead of shipping raw transactions, the app builds a compact JSON snapshot — monthly trend, category and subcategory breakdowns, budget vs actual, pacing, account balances, detected recurring commitments, and the largest transactions. That keeps a question at roughly 1–2k input tokens even with thousands of transactions.

Model and reasoning effort are configurable (Opus 5 by default, Sonnet 5 and Haiku 4.5 available).

## Investments

Expenses answer "where did it go". Holdings answer "what do I actually have". They're separate on purpose: a transaction records that Rp 6.000.000 left your account, a holding records that it became **10 lots of BBCA at 6.000**.

```
BBCA · 15 lots · avg Rp 5.843    cost Rp 8.765.000
                                 now  Rp 10.725.000   +22,36%
```

IDX lots are handled properly — 1 lot = 100 shares — and buying more of the same ticker averages into the existing position rather than creating a second row. Fees count toward cost basis, so the average price is your real break-even.

Prices come from [Twelve Data](https://twelvedata.com/pricing) with your own API key, added in **Settings**. Notes on how it behaves:

- **Ticker search costs nothing.** It uses Twelve Data's reference endpoint, which needs no key and burns no credits — so you can browse freely. The exchange is always shown, because `BBCA` is Bank Central Asia on IDX *and* a Canadian ETF on three other exchanges.
- **Quotes are rationed.** Automatic refreshes run at most **4× a day, at least 6 hours apart**. A portfolio's value doesn't move enough between those points to justify more, and the cache survives reloads — opening the app ten times in an afternoon costs nothing. Manual refresh is always available.
- **Partial data is shown as partial.** A holding without a quote is counted at cost, and the total says so ("only 1 of 2 priced") rather than quietly under-reporting.
- **Mixed currencies** pull one FX rate per foreign currency per refresh. A holding with no rate is left out of the combined total and flagged, rather than converted at a made-up rate.

Expect **delayed quotes, not real-time ticks** — live IDX data is a paid feed. For seeing what your portfolio is worth, the delay doesn't matter.

Holdings are included in backups. The Twelve Data key, like the Anthropic one, is not.

## Google Drive backup

Optional, and off until you connect it. Penny requests only the `drive.appdata` scope, which gives it a hidden folder of its own — it cannot see anything else in your Drive. One backup file is kept and overwritten in place, so repeated backups never pile up copies.

Backups are debounced ~20s after your last edit and flushed when the tab is hidden. On first connect, if Drive already holds a newer copy you're asked which side to keep rather than having one silently overwrite the other.

Set up requires a Google OAuth client ID (Web application) from the Google Cloud Console, with your app's origin listed under authorised JavaScript origins:

```bash
# .env.local
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Without it, the Settings page shows the backup section as unconfigured and everything else works as normal.

## Language

English is the default; Bahasa Indonesia is available under **Settings → Language**. Both cover the whole interface — screens, dialogs, buttons, validation messages, built-in category names, and date formatting.

Strings live in `src/locales/{id,en}.js` and resolve through `useT()`. Adding a language means adding one file and one entry in `LOCALE_OPTIONS`.

One deliberate exception: **default subcategory names are stored on transactions as English strings** (`Dining Out`, `Groceries`). Renaming them would rewrite user data, so they are translated for display only via `subcategoryLabel()` and stored unchanged. Names you create yourself are never translated.

Tone across both languages is casual and everyday — short sentences, contractions, plain words. Indonesian deliberately keeps the loanwords people actually use (*file, backup, restore, browser, export*) rather than the formal calques (*berkas, pencadangan, peramban*), which read like a government form.

## Stack

- React 19 + Vite 8
- Tailwind CSS v4 + shadcn/ui
- Zustand (state persisted to IndexedDB)
- Recharts for charts (lazy-loaded with Reports)
- `@anthropic-ai/sdk` for Insights (lazy-loaded)
- Twelve Data REST for stock prices (no SDK, plain `fetch`)
- date-fns, xlsx
- i18n is hand-rolled — see `src/lib/i18n.js`

## Getting started

```bash
# install dependencies
npm install

# run dev server
npm run dev

# build for production
npm run build

# preview production build
npm run preview
```

The app runs on `http://localhost:5173` by default.

## Data storage

Everything is stored in this browser's **IndexedDB** under the database `penny`, key `penny-storage`. There's still no backend — your data lives in your browser.

Older installs kept data in localStorage, which caps out around 5MB and blocks the main thread on every read. Data written by those builds is migrated to IndexedDB automatically on first load, and the localStorage copy is removed once the move succeeds. If IndexedDB is unavailable (some private-browsing modes), the app falls back to localStorage rather than failing.

Because browser storage can still be cleared, connect Google Drive backup or export a JSON backup periodically.

import { useState, useMemo } from 'react';
import {
  Panel, Icon, SoftBadge, IconBadge,
} from '@/components/ui/design';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import PageHeader from '@/components/PageHeader';
import { PeriodField } from '@/components/ui/date-fields';
import QuickAdd from '@/components/QuickAdd';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import { useMonthFilter } from '@/hooks/useCycle';
import { getAllCategoryList, getSubcategories } from '@/lib/constants';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import { formatCurrency, getMonthKey, filterTransactionsByDateRange, cn } from '@/lib/utils';

/** Dropdown filter matching the design: pill button + light popover list. */
function FilterSelect({ label, value, options, onChange, icon }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-max items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px]">
          {icon && <Icon name={icon} size={16} className="text-muted-foreground" />}
          {selected?.label ?? label}
          <Icon name="expand_more" size={16} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 rounded-xl p-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => { onChange(o.value); setOpen(false); }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-secondary',
              o.value === value && 'font-bold text-primary'
            )}
          >
            {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const TYPE_ICON = {
  income: 'south_west',
  expense: 'north_east',
  savings: 'savings',
  investment: 'account_balance',
  transfer: 'swap_horiz',
};

const TYPE_TONE = {
  income: 'primary',
  expense: 'danger',
  savings: 'teal',
  investment: 'violet',
  transfer: 'muted',
};

function TransactionRow({ tx, allCategories, accounts, t, dates, onEdit, onDelete }) {
  const cat = allCategories[tx.category];
  const type = cat?.type || 'expense';
  const account = accounts.find((a) => a.id === tx.account);
  const toAccount = tx.toAccount ? accounts.find((a) => a.id === tx.toAccount) : null;
  const isIncome = type === 'income';
  const isTransfer = type === 'transfer';

  let amountClass = 'text-danger';
  if (isTransfer) amountClass = 'text-muted-foreground';
  else if (isIncome) amountClass = 'text-primary';

  let sign = '−';
  if (isTransfer) sign = '';
  else if (isIncome) sign = '+';

  return (
    <div className="group flex items-center gap-3 rounded-[14px] p-3 transition-colors hover:bg-secondary/60">
      <IconBadge name={TYPE_ICON[type] || 'north_east'} tone={TYPE_TONE[type] || 'muted'} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold">
            {subcategoryLabel(tx.subcategory, t) || categoryLabel(cat, t)}
          </span>
          <SoftBadge>{categoryLabel(cat, t)}</SoftBadge>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {dates.short(tx.date)}
          {account && ` · ${account.name}`}
          {toAccount && ` → ${toAccount.name}`}
          {tx.note && ` · ${tx.note}`}
        </div>
      </div>

      <div className={cn('shrink-0 whitespace-nowrap text-sm font-bold tabular-nums', amountClass)}>
        {sign}{formatCurrency(tx.amount)}
      </div>

      <div className="flex shrink-0 gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onEdit(tx)}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon name="edit" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('common.edit')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { if (window.confirm(t('transactions.deleteConfirm'))) onDelete(tx.id); }}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
            >
              <Icon name="delete" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('common.delete')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function Transactions() {
  const t = useT();
  const dates = useDateFormat();

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const customCategories = useStore((s) => s.customCategories);
  const customSubcategories = useStore((s) => s.customSubcategories);
  const deleteTransaction = useStore((s) => s.deleteTransaction);

  const [period, setPeriod] = useState(() => ({ mode: 'month', month: getMonthKey(new Date()) }));
  const filterByMonth = useMonthFilter();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [subFilter, setSubFilter] = useState('all');
  const [accFilter, setAccFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const allCategoryList = useMemo(() => getAllCategoryList(customCategories), [customCategories]);
  const allCategories = useMemo(
    () => Object.fromEntries(allCategoryList.map((c) => [c.id, c])),
    [allCategoryList]
  );

  const subOptions = useMemo(() => {
    if (catFilter === 'all') return [];
    return getSubcategories(catFilter, customSubcategories, customCategories);
  }, [catFilter, customSubcategories, customCategories]);

  const periodTx = useMemo(
    () => (period.mode === 'range'
      ? filterTransactionsByDateRange(transactions, period.from, period.to)
      : filterByMonth(transactions, period.month)),
    [filterByMonth, transactions, period]
  );

  const filtered = useMemo(() => {
    let list = periodTx;
    if (catFilter !== 'all') list = list.filter((x) => x.category === catFilter);
    if (subFilter !== 'all') list = list.filter((x) => x.subcategory === subFilter);
    if (accFilter !== 'all') {
      list = list.filter((x) => x.account === accFilter || x.toAccount === accFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (x) => x.subcategory?.toLowerCase().includes(q) || x.note?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [periodTx, catFilter, subFilter, accFilter, search]);

  const income = filtered
    .filter((x) => allCategories[x.category]?.type === 'income')
    .reduce((s, x) => s + x.amount, 0);
  const expense = filtered
    .filter((x) => {
      const type = allCategories[x.category]?.type;
      return type !== 'income' && type !== 'transfer';
    })
    .reduce((s, x) => s + x.amount, 0);

  const isFiltered = search || catFilter !== 'all' || accFilter !== 'all';

  return (
    <>
      <PageHeader
        actions={
          <>
            <PeriodField value={period} onChange={setPeriod} />
            <Button
              data-tour="add-transaction"
              onClick={() => { setEditing(null); setAddOpen(true); }}
              className="rounded-xl px-4 py-2.5 font-bold shadow-[0_4px_14px_var(--primary-soft)]"
            >
              <Icon name="add" size={18} /> {t('transactions.add')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              {t('transactions.income')}
            </div>
            <div className="mt-1 text-[19px] font-extrabold tabular-nums text-primary">
              {formatCurrency(income)}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              {t('transactions.expenses')}
            </div>
            <div className="mt-1 text-[19px] font-extrabold tabular-nums text-danger">
              {formatCurrency(expense)}
            </div>
          </div>
        </div>

        <div data-tour="search-filter" className="flex flex-wrap gap-2.5">
          <div className="flex min-w-55 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-1">
            <Icon name="search" size={18} className="text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('transactions.searchPlaceholder')}
              className="h-9 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
            />
          </div>

          <FilterSelect
            value={catFilter}
            onChange={(v) => { setCatFilter(v); setSubFilter('all'); }}
            options={[
              { value: 'all', label: t('transactions.allCategories') },
              ...allCategoryList.map((c) => ({
                value: c.id, label: categoryLabel(c, t), color: c.hex,
              })),
            ]}
          />

          {catFilter !== 'all' && subOptions.length > 0 && (
            <FilterSelect
              value={subFilter}
              onChange={setSubFilter}
              options={[
                { value: 'all', label: t('transactions.allSubcategories') },
                ...subOptions.map((s) => ({ value: s, label: subcategoryLabel(s, t) })),
              ]}
            />
          )}

          <FilterSelect
            value={accFilter}
            onChange={setAccFilter}
            options={[
              { value: 'all', label: t('transactions.allAccounts') },
              ...accounts.map((a) => ({ value: a.id, label: a.name, color: a.color })),
            ]}
          />
        </div>

        <Panel data-tour="transaction-list" padded={false} className="p-2">
          {filtered.length > 0 ? (
            <div className="flex flex-col">
              {filtered.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  allCategories={allCategories}
                  accounts={accounts}
                  t={t}
                  dates={dates}
                  onEdit={(x) => { setEditing(x); setAddOpen(true); }}
                  onDelete={deleteTransaction}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-[13.5px] text-muted-foreground">
              {isFiltered ? t('transactions.emptyFiltered') : t('transactions.emptyBody')}
            </div>
          )}
        </Panel>
      </div>

      <QuickAdd
        open={addOpen}
        onOpenChange={(v) => { setAddOpen(v); if (!v) setEditing(null); }}
        editing={editing}
      />
    </>
  );
}

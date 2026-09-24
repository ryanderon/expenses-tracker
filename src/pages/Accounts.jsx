import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CurrencyInput from '@/components/ui/currency-input';
import {
  Icon, IconBadge, InitialBadge, EmptyState, Panel, StackedBar, LegendRow,
} from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import usePortfolio from '@/hooks/usePortfolio';
import usePrices from '@/hooks/usePrices';
import { ACCOUNT_COLORS, getAllCategories } from '@/lib/constants';
import { formatCurrency, getAccountBalance, cn } from '@/lib/utils';

/** Share of `part` in `total`, or null when a negative balance makes it meaningless. */
function share(part, total, other) {
  if (part < 0 || other < 0 || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function NetWorthPanel({ cash, portfolio, hasHoldings }) {
  const t = useT();
  const invested = hasHoldings ? portfolio.marketValue : 0;
  const total = cash + invested;

  return (
    <Panel className="mb-4">
      <p className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
        {t('accounts.netWorth')}
      </p>
      <p className={cn(
        'mt-1 text-[28px] font-extrabold tabular-nums tracking-[-0.02em]',
        total < 0 && 'text-danger'
      )}>
        {formatCurrency(total)}
      </p>

      {hasHoldings && (
        <>
          <StackedBar
            className="mt-4"
            height={10}
            segments={[
              { key: 'cash', value: Math.max(cash, 0), color: 'var(--primary)' },
              { key: 'investments', value: invested, color: 'var(--teal)' },
            ]}
          />
          <div className="mt-3 flex flex-col gap-2">
            <LegendRow
              color="var(--primary)"
              label={t('accounts.cash')}
              value={formatCurrency(cash)}
              pct={share(cash, total, invested)}
            />
            <LegendRow
              color="var(--teal)"
              label={t('accounts.investments')}
              value={formatCurrency(invested)}
              pct={share(invested, total, cash)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * Investments as one more "account" — read-only here, since its value comes
 * from market prices rather than transactions. Tapping through edits it.
 */
function InvestmentCard({ portfolio }) {
  const t = useT();
  const dates = useDateFormat();
  const up = portfolio.pl >= 0;
  const priced = portfolio.pricedCount > 0;

  return (
    <Link
      to="/portfolio"
      className="group relative rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:border-teal/50"
    >
      <div className="mb-4 flex items-center gap-3">
        <IconBadge name="trending_up" tone="teal" size={48} className="rounded-[14px]" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold">{t('accounts.investments')}</div>
          <div className="truncate text-xs text-muted-foreground">
            {t('accounts.investmentsType', { count: portfolio.totalCount })}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-muted-foreground">{t('accounts.investmentsValue')}</div>
          <div className="text-lg font-extrabold tabular-nums text-teal">
            {formatCurrency(portfolio.marketValue)}
          </div>
        </div>
        <div className="text-right text-xs">
          {priced ? (
            <>
              <div className={cn('font-bold tabular-nums', up ? 'text-primary' : 'text-danger')}>
                {up ? '+' : '−'}{formatCurrency(Math.abs(portfolio.pl))}{' '}
                ({up ? '+' : ''}{portfolio.plPct.toFixed(2)}%)
              </div>
              {portfolio.quotedAt && (
                <div className="text-[11px] text-muted-foreground">
                  {t('common.ago', { time: dates.distance(portfolio.quotedAt) })}
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground">{t('accounts.investmentsPending')}</div>
          )}
        </div>
      </div>

      <Icon
        name="chevron_right"
        size={20}
        className="absolute right-3 top-3 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

const INITIAL_FORM = { name: '', type: '', color: ACCOUNT_COLORS[0], openingBalance: '' };

function AccountFormDialog({ open, onOpenChange, account, onSubmit }) {
  const t = useT();
  const [form, setForm] = useState(() =>
    account
      ? { ...account, openingBalance: account.openingBalance ? String(account.openingBalance) : '' }
      : INITIAL_FORM
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim()) return;
    onSubmit({ ...form, openingBalance: Number(form.openingBalance) || 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="font-extrabold">
            {account ? t('accounts.editTitle') : t('accounts.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {account ? t('accounts.editDescription') : t('accounts.newDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('accounts.name')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('accounts.namePlaceholder')}
              className="h-11 rounded-[10px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('accounts.type')}</Label>
            <Input
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder={t('accounts.typePlaceholder')}
              className="h-11 rounded-[10px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              {t('accounts.openingBalance')}{' '}
              <span className="font-normal text-muted-foreground">
                ({t('common.optional')})
              </span>
            </Label>
            <CurrencyInput
              name="openingBalance"
              value={form.openingBalance}
              onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('accounts.openingBalanceHint')}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('accounts.color')}</Label>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    'size-8 rounded-[10px] transition-transform',
                    form.color === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Accounts() {
  const t = useT();
  const {
    accounts, transactions, customCategories, addAccount, updateAccount, deleteAccount,
  } = useStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const holdings = useStore((s) => s.holdings);
  const portfolio = usePortfolio();
  // Mounted for its auto-refresh, so the investment figure here stays current.
  usePrices();
  const hasHoldings = holdings.length > 0;

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const rows = useMemo(
    () => accounts.map((a) => ({
      ...a,
      balance: getAccountBalance(transactions, a.id, allCategories, a.openingBalance),
      txCount: transactions.filter((x) => x.account === a.id || x.toAccount === a.id).length,
    })),
    [accounts, transactions, allCategories]
  );

  const handleSubmit = (data) => {
    if (editing) updateAccount(editing.id, data);
    else addAccount(data);
    setEditing(null);
  };

  const handleDelete = (id) => {
    const hasTx = transactions.some((x) => x.account === id || x.toAccount === id);
    if (hasTx && !window.confirm(t('accounts.deleteWithTx'))) return;
    if (!hasTx && !window.confirm(t('accounts.deleteConfirm'))) return;
    deleteAccount(id);
  };

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="rounded-xl px-4 py-2.5 font-bold shadow-[0_4px_14px_var(--primary-soft)]"
          >
            <Icon name="add" size={18} /> {t('accounts.add')}
          </Button>
        }
      />

      {(rows.length > 0 || hasHoldings) && (
        <NetWorthPanel
          cash={rows.reduce((sum, a) => sum + a.balance, 0)}
          portfolio={portfolio}
          hasHoldings={hasHoldings}
        />
      )}

      {rows.length > 0 || hasHoldings ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((acc) => (
            <div
              key={acc.id}
              className="group relative rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <div className="mb-4 flex items-center gap-3">
                <InitialBadge color={acc.color} size={48} radius={14}>
                  {acc.name.charAt(0)}
                </InitialBadge>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold">{acc.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{acc.type}</div>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground">{t('accounts.balance')}</div>
                  <div className={cn(
                    'text-lg font-extrabold tabular-nums',
                    acc.balance >= 0 ? 'text-primary' : 'text-danger'
                  )}>
                    {formatCurrency(acc.balance)}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{t('accounts.transactionsCount', { count: acc.txCount })}</div>
                  {acc.openingBalance > 0 && (
                    <div className="text-[11px]">
                      {t('accounts.openingBalanceRow', {
                        amount: formatCurrency(acc.openingBalance),
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute right-3 top-3 flex gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setEditing(acc); setDialogOpen(true); }}
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
                      onClick={() => handleDelete(acc.id)}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.delete')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
          {hasHoldings && <InvestmentCard portfolio={portfolio} />}
        </div>
      ) : (
        <EmptyState
          icon="account_balance_wallet"
          title={t('accounts.emptyTitle')}
          body={t('accounts.emptyBody')}
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Icon name="add" size={18} /> {t('accounts.add')}
            </Button>
          }
        />
      )}

      {dialogOpen && (
        <AccountFormDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
          account={editing}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

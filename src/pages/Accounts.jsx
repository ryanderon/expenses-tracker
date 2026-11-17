import { useState, useMemo } from 'react';
import { AnimatePresence, m } from 'motion/react';
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
  Icon, IconBadge, InitialBadge, EmptyState, Panel, StackedBar, LegendRow, ChoicePill, SoftBadge,
} from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import ReassignDialog from '@/components/ReassignDialog';
import useExitable from '@/hooks/useExitable';
import useStore from '@/store/useStore';
import { useT, useDateFormat } from '@/hooks/useT';
import usePortfolio from '@/hooks/usePortfolio';
import usePrices from '@/hooks/usePrices';
import { ACCOUNT_COLORS, ACCOUNT_ROLES, accountRole, getAllCategories } from '@/lib/constants';
import { formatCurrency, getAccountBalance, getReceivables, cn } from '@/lib/utils';
import { subcategoryLabel } from '@/lib/i18n';
import { SPRING, EXIT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/ui/motion';

/** Share of `part` in `total`, or null when a negative balance makes it meaningless. */
function share(part, total, parts) {
  if (parts.some((p) => p < 0) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/**
 * Cash in accounts, plus investments at market value, plus money that's out
 * but owed back (receivables) — it left an account, but it's still yours.
 */
function NetWorthPanel({ cash, saved, investAccounts, portfolio, hasHoldings, owed }) {
  const t = useT();
  const invested = hasHoldings ? portfolio.marketValue : 0;
  const total = cash + saved + investAccounts + invested + owed;
  const parts = [cash, saved, investAccounts, invested, owed];

  // Spendable money first, then what's tied up: investment accounts (Bibit…)
  // are balances you track, the portfolio is holdings at market price.
  const segments = [
    { key: 'cash', label: t('accounts.cash'), value: cash, color: 'var(--primary)' },
    saved !== 0 && { key: 'saved', label: t('accounts.savingsAccounts'), value: saved, color: 'var(--teal)' },
    investAccounts !== 0 && { key: 'investAccounts', label: t('accounts.investmentAccounts'), value: investAccounts, color: 'var(--violet)' },
    hasHoldings && { key: 'portfolio', label: t('accounts.portfolio'), value: invested, color: 'var(--amber)' },
    owed > 0 && { key: 'owed', label: t('accounts.owed'), value: owed, color: 'var(--sky)' },
  ].filter(Boolean);

  return (
    <Panel className="mb-4">
      <p className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
        {t('accounts.netWorth')}
      </p>
      <p className={cn(
        'mt-1 text-[28px] font-extrabold tabular-nums tracking-[-0.02em]',
        total < 0 && 'text-danger'
      )}>
        <AnimatedNumber value={total} format={formatCurrency} />
      </p>

      {segments.length > 1 && (
        <>
          <StackedBar
            className="mt-4"
            height={10}
            segments={segments.map((seg) => ({ ...seg, value: Math.max(seg.value, 0) }))}
          />
          <div className="mt-3 flex flex-col gap-2">
            {segments.map((seg) => (
              <LegendRow
                key={seg.key}
                color={seg.color}
                label={seg.label}
                value={formatCurrency(seg.value)}
                pct={share(seg.value, total, parts)}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * Receivables as one more "account": what's been paid out for work or lent,
 * minus what has come back. Read-only — it moves when transactions are added.
 */
function ReceivablesCard({ receivables }) {
  const t = useT();
  const settled = receivables.outstanding <= 0;

  return (
    <div className="relative rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-3">
        <IconBadge name="handshake" tone="sky" size={48} className="rounded-[14px]" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold">{t('categoriesData.receivables')}</div>
          <div className="truncate text-xs text-muted-foreground">{t('accounts.owedType')}</div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-muted-foreground">{t('accounts.owedValue')}</div>
          <div className="text-lg font-extrabold tabular-nums text-sky">
            {formatCurrency(Math.max(receivables.outstanding, 0))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right text-xs text-muted-foreground">
          {settled
            ? <span>{t('accounts.owedSettled')}</span>
            : receivables.bySubcategory
                .filter((r) => r.amount > 0)
                .map((r) => (
                  <span key={r.name} className="tabular-nums">
                    {subcategoryLabel(r.name, t)} · {formatCurrency(r.amount)}
                  </span>
                ))}
        </div>
      </div>
    </div>
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

const INITIAL_FORM = { name: '', type: '', role: 'spending', color: ACCOUNT_COLORS[0], openingBalance: '' };

/** Tone per account role, for the badge on each card. */
const ROLE_TONE = { spending: 'muted', savings: 'teal', investment: 'violet' };

function AccountFormDialog({ open, onOpenChange, account, onSubmit }) {
  const t = useT();
  const [form, setForm] = useState(() =>
    account
      ? {
          ...account,
          role: accountRole(account),
          openingBalance: account.openingBalance ? String(account.openingBalance) : '',
        }
      : INITIAL_FORM
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim()) return;
    // Only the account's own fields: the card it was opened from also carries
    // computed figures (balance, txCount) that must not be saved with it.
    onSubmit({
      name: form.name,
      type: form.type,
      role: form.role,
      color: form.color,
      openingBalance: Number(form.openingBalance) || 0,
    });
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
          {/* Decides how its money counts: saving into a savings account is "Savings". */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('accounts.role')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_ROLES.map((role) => (
                <ChoicePill key={role} active={form.role === role} onClick={() => setForm({ ...form, role })}>
                  {t(`accounts.roles.${role}`)}
                </ChoicePill>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t(`accounts.roleHints.${form.role}`)}</p>
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
    reassignAccounts,
  } = useStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  // { id, name, count } for an account being deleted that still has transactions.
  const [deleting, setDeleting] = useState(null);
  const [fixingOrphans, setFixingOrphans] = useState(false);
  // Stay mounted through their closing animation.
  const formDialog = useExitable(dialogOpen);
  const deleteDialog = useExitable(deleting);
  const orphanDialog = useExitable(fixingOrphans);

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

  const receivables = useMemo(
    () => getReceivables(transactions, allCategories),
    [transactions, allCategories]
  );

  const handleSubmit = (data) => {
    if (editing) updateAccount(editing.id, data);
    else addAccount(data);
    setEditing(null);
  };

  // Transactions still pointing at accounts deleted by an older version.
  const orphans = useMemo(() => {
    const known = new Set(accounts.map((a) => a.id));
    const missing = new Set();
    let count = 0;
    for (const x of transactions) {
      const lost = [x.account, x.toAccount].filter((id) => id && !known.has(id));
      if (!lost.length) continue;
      lost.forEach((id) => missing.add(id));
      count += 1;
    }
    return { ids: [...missing], count };
  }, [accounts, transactions]);

  const handleDelete = (acc) => {
    const count = transactions.filter((x) => x.account === acc.id || x.toAccount === acc.id).length;
    if (count > 0) {
      setDeleting({ id: acc.id, name: acc.name, count });
      return;
    }
    if (window.confirm(t('accounts.deleteConfirm'))) deleteAccount(acc.id);
  };

  const accountOptions = (excludeId) => accounts
    .filter((a) => a.id !== excludeId)
    .map((a) => ({ value: a.id, label: a.name }));

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

      {orphans.count > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] border border-amber/40 bg-amber-soft px-4 py-3">
          <Icon name="link_off" size={20} className="text-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold">{t('accounts.orphanTitle', { count: orphans.count })}</p>
            <p className="text-xs text-muted-foreground">{t('accounts.orphanBody')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setFixingOrphans(true)}>
            {t('reassign.fix')}
          </Button>
        </div>
      )}

      {(rows.length > 0 || hasHoldings) && (
        <NetWorthPanel
          cash={rows.filter((a) => accountRole(a) === 'spending').reduce((sum, a) => sum + a.balance, 0)}
          saved={rows.filter((a) => accountRole(a) === 'savings').reduce((sum, a) => sum + a.balance, 0)}
          investAccounts={rows.filter((a) => accountRole(a) === 'investment').reduce((sum, a) => sum + a.balance, 0)}
          portfolio={portfolio}
          hasHoldings={hasHoldings}
          owed={Math.max(receivables.outstanding, 0)}
        />
      )}

      {rows.length > 0 || hasHoldings ? (
        <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* A new account grows in, a deleted one shrinks away, and `layout`
              slides the cards after it into the gap. Radius inline (px) so
              the layout animation doesn't warp the corners. */}
          <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((acc) => (
            <m.div
              key={acc.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: EXIT }}
              transition={SPRING}
              style={{ borderRadius: 20 }}
              className="group relative border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <div className="mb-4 flex items-center gap-3">
                <InitialBadge color={acc.color} size={48} radius={14}>
                  {acc.name.charAt(0)}
                </InitialBadge>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold">{acc.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <SoftBadge tone={ROLE_TONE[accountRole(acc)]}>{t(`accounts.roles.${accountRole(acc)}`)}</SoftBadge>
                    <span className="truncate text-xs text-muted-foreground">{acc.type}</span>
                  </div>
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
                      onClick={() => handleDelete(acc)}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.delete')}</TooltipContent>
                </Tooltip>
              </div>
            </m.div>
          ))}
          </AnimatePresence>
          {/* These ride along when an account card before them comes or goes. */}
          {hasHoldings && (
            <m.div layout="position" transition={SPRING} className="grid">
              <InvestmentCard portfolio={portfolio} />
            </m.div>
          )}
          {receivables.count > 0 && (
            <m.div layout="position" transition={SPRING} className="grid">
              <ReceivablesCard receivables={receivables} />
            </m.div>
          )}
        </div>
      ) : (
        <EmptyState
          icon="account_balance_wallet"
          title={t('accounts.emptyTitle')}
          body={t('accounts.emptyBody')}
          action={
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Icon name="add" size={18} /> {t('accounts.add')}
            </Button>
          }
        />
      )}

      {formDialog.mounted && (
        <AccountFormDialog
          open={dialogOpen}
          // `editing` is left as is on close so the title doesn't flip while
          // the dialog animates out; every way of opening it sets it first.
          onOpenChange={setDialogOpen}
          account={editing}
          onSubmit={handleSubmit}
        />
      )}

      {deleteDialog.mounted && (
        <ReassignDialog
          open={deleteDialog.open}
          onOpenChange={(v) => { if (!v) setDeleting(null); }}
          title={t('accounts.deleteTitle', { name: deleteDialog.value.name })}
          description={t('accounts.deleteHasTx', { count: deleteDialog.value.count })}
          count={deleteDialog.value.count}
          options={accountOptions(deleteDialog.value.id)}
          confirmLabel={t('common.delete')}
          onConfirm={(moveTo) => deleteAccount(deleteDialog.value.id, { moveTo })}
        />
      )}

      {orphanDialog.mounted && (
        <ReassignDialog
          open={orphanDialog.open}
          onOpenChange={setFixingOrphans}
          title={t('accounts.orphanDialogTitle')}
          description={t('accounts.orphanBody')}
          count={orphans.count}
          options={accountOptions()}
          confirmLabel={t('reassign.fix')}
          onConfirm={(moveTo) => reassignAccounts(orphans.ids, moveTo)}
        />
      )}
    </>
  );
}

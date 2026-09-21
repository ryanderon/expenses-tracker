import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CurrencyInput from '@/components/ui/currency-input';
import { Icon, InitialBadge, EmptyState } from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import useStore from '@/store/useStore';
import { useT } from '@/hooks/useT';
import { ACCOUNT_COLORS, getAllCategories } from '@/lib/constants';
import { formatCurrency, getAccountBalance, cn } from '@/lib/utils';

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

      {rows.length > 0 ? (
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

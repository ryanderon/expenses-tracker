import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import useStore from '@/store/useStore';
import { ACCOUNT_COLORS, getAllCategories } from '@/lib/constants';
import { formatCurrency, getAccountBalance, cn } from '@/lib/utils';

const INITIAL_FORM = { name: '', type: '', color: ACCOUNT_COLORS[0] };

function AccountFormDialog({ open, onOpenChange, account, onSubmit }) {
  const [form, setForm] = useState(account || INITIAL_FORM);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim()) return;
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Edit Account' : 'New Account'}</DialogTitle>
          <DialogDescription>{account ? 'Update your account details below.' : 'Add a new bank account or wallet to track.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Account Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. BCA, Mandiri" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Account Type</Label>
            <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. Salary, Savings, Spending" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    'size-8 rounded-lg transition-all cursor-pointer',
                    form.color === c ? 'ring-2 ring-ring ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{account ? 'Update' : 'Add Account'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Accounts() {
  const { accounts, transactions, customCategories, addAccount, updateAccount, deleteAccount } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const handleSubmit = (data) => {
    if (editingAccount) {
      updateAccount(editingAccount.id, data);
    } else {
      addAccount(data);
    }
    setEditingAccount(null);
  };

  const handleEdit = (acc) => { setEditingAccount(acc); setDialogOpen(true); };
  const openNew = () => { setEditingAccount(null); setDialogOpen(true); };

  const handleDelete = (id) => {
    const hasTx = transactions.some((t) => t.account === id);
    if (hasTx) {
      if (!window.confirm('This account has transactions. Are you sure you want to delete it?')) return;
    }
    deleteAccount(id);
  };

  const getBalance = (accId) => getAccountBalance(transactions, accId, allCategories);

  const getTxCount = (accId) => transactions.filter((t) => t.account === accId).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your bank accounts and wallets</p>
        </div>
        <Button onClick={openNew}><Plus data-icon="inline-start" /> Add Account</Button>
      </div>

      {accounts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const balance = getBalance(acc.id);
            const txCount = getTxCount(acc.id);
            return (
              <Card key={acc.id} className="group relative">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
                        style={{ backgroundColor: `${acc.color}25`, color: acc.color }}
                      >
                        {acc.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-semibold">{acc.name}</p>
                        <p className="text-xs text-muted-foreground">{acc.type}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => handleEdit(acc)}>
                            <Pencil data-icon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => handleDelete(acc.id)}>
                            <Trash2 data-icon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Balance</p>
                    <p className={cn('text-lg font-bold tabular-nums', balance >= 0 ? 'text-chart-1' : 'text-destructive')}>
                        {formatCurrency(balance)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{txCount} transactions</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="size-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <Wallet className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No accounts yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">Add your first account to start tracking finances.</p>
              <Button onClick={openNew}><Plus data-icon="inline-start" /> Add Account</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {dialogOpen && (
        <AccountFormDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingAccount(null); }}
          account={editingAccount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, Search, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import PeriodFilter, { usePeriodFilter } from '@/components/ui/period-filter';
import CurrencyInput from '@/components/ui/currency-input';
import useStore from '@/store/useStore';
import { CATEGORIES, CATEGORY_LIST, getAllCategories, getAllCategoryList, getSubcategories } from '@/lib/constants';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const INITIAL_FORM = {
  category: '', subcategory: '', account: '', toAccount: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), note: '',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
      <AlertCircle className="size-3" />
      {message}
    </p>
  );
}

function TransactionFormDialog({ open, onOpenChange, transaction, onSubmit }) {
  const { accounts, customSubcategories, customCategories } = useStore();
  const isEditing = !!transaction;
  const [form, setForm] = useState(
    transaction
      ? { ...transaction, amount: String(transaction.amount) }
      : { ...INITIAL_FORM, account: accounts[0]?.id || '' }
  );
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const allCategoryList = useMemo(() => getAllCategoryList(customCategories), [customCategories]);
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const subcategories = form.category ? getSubcategories(form.category, customSubcategories, customCategories) : [];
  const selectedCat = allCategories[form.category];

  const isTransfer = form.category === 'transfer';
  const isInvestment = form.category === 'investments';
  const showToAccount = isTransfer || isInvestment;

  const validate = useCallback((data) => {
    const errs = {};
    if (!data.category) errs.category = 'Please select a category';
    if (data.category && data.category !== 'transfer' && !data.subcategory) errs.subcategory = 'Please select a subcategory';
    if (!data.account) errs.account = 'Please select an account';
    if ((data.category === 'transfer' || data.category === 'investments') && !data.toAccount) errs.toAccount = 'Please select destination account';
    if ((data.category === 'transfer' || data.category === 'investments') && data.toAccount && data.account === data.toAccount) errs.toAccount = 'Cannot transfer to the same account';
    if (!data.amount || Number.parseFloat(data.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!data.date) errs.date = 'Please select a date';
    return errs;
  }, []);

  const set = (field, value) => {
    let next;
    if (field === 'category') {
      next = value === 'transfer'
        ? { ...form, category: value, subcategory: 'Account Transfer', toAccount: '' }
        : { ...form, category: value, subcategory: '', toAccount: value === 'investments' ? form.toAccount : '' };
    } else {
      next = { ...form, [field]: value };
    }
    setForm(next);
    setTouched((prev) => ({ ...prev, [field]: true }));
    // Clear error for this field on change
    if (errors[field]) {
      const newErrs = { ...errors };
      delete newErrs[field];
      if (field === 'category') delete newErrs.subcategory;
      setErrors(newErrs);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched({ category: true, subcategory: true, account: true, toAccount: true, amount: true, date: true });
      return;
    }
    const payload = { ...form, amount: Number.parseFloat(form.amount) };
    if (form.category !== 'transfer' && form.category !== 'investments') delete payload.toAccount;
    onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 bg-secondary/10">
          <DialogTitle className="text-xl">
            {isEditing ? 'Edit Transaction' : 'New Transaction'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your transaction below.'
              : 'Fill in the details to record a new transaction.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex flex-col gap-6 px-6 py-5">
            
            {/* Amount Hero Section */}
            <div className="flex flex-col gap-2">
              <Label className={cn("text-xs uppercase tracking-wider text-muted-foreground font-semibold", errors.amount && touched.amount && 'text-destructive')}>
                Amount
              </Label>
              <div className="relative">
                <CurrencyInput
                  name="amount"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  className={cn(
                    'h-14 text-3xl font-bold bg-transparent border-0 border-b-2 border-border rounded-none px-0 pl-11 shadow-none focus-visible:ring-0 focus-visible:border-primary',
                    errors.amount && touched.amount && 'border-destructive focus-visible:border-destructive'
                  )}
                  style={{ color: selectedCat?.color || 'var(--foreground)' }}
                />
              </div>
              <FieldError message={touched.amount && errors.amount} />
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label className={errors.category && touched.category ? 'text-destructive' : ''}>
                  Category
                </Label>
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger className={cn("h-10", errors.category && touched.category && 'border-destructive ring-destructive/20')}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                    {allCategoryList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError message={touched.category && errors.category} />
              </div>

              {!isTransfer && (
                <div className="flex flex-col gap-2">
                  <Label className={errors.subcategory && touched.subcategory ? 'text-destructive' : ''}>
                    Subcategory
                  </Label>
                  <Select value={form.subcategory} onValueChange={(v) => set('subcategory', v)} disabled={!form.category}>
                    <SelectTrigger className={cn("h-10", errors.subcategory && touched.subcategory && 'border-destructive ring-destructive/20')}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectGroup>
                      {subcategories.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError message={touched.subcategory && errors.subcategory} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label className={errors.account && touched.account ? 'text-destructive' : ''}>
                  {showToAccount ? 'From Account' : 'Account'}
                </Label>
                <Select value={form.account} onValueChange={(v) => set('account', v)}>
                  <SelectTrigger className={cn("h-10", errors.account && touched.account && 'border-destructive ring-destructive/20')}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError message={touched.account && errors.account} />
              </div>

              {showToAccount && (
                <div className="flex flex-col gap-2">
                  <Label className={errors.toAccount && touched.toAccount ? 'text-destructive' : ''}>
                    To Account
                  </Label>
                  <Select value={form.toAccount || ''} onValueChange={(v) => set('toAccount', v)}>
                    <SelectTrigger className={cn("h-10", errors.toAccount && touched.toAccount && 'border-destructive ring-destructive/20')}>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectGroup>
                    {accounts.filter((a) => a.id !== form.account).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                    </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError message={touched.toAccount && errors.toAccount} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label className={errors.date && touched.date ? 'text-destructive' : ''}>
                  Date
                </Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={cn("h-10", errors.date && touched.date && 'border-destructive ring-destructive/20')}
                />
                <FieldError message={touched.date && errors.date} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Note <span className="text-muted-foreground font-normal opacity-70">(optional)</span></Label>
              <Input
                value={form.note || ''}
                onChange={(e) => set('note', e.target.value)}
                placeholder="What was this for?"
                className="h-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="default" className="w-full sm:w-auto px-8">
              {isEditing ? 'Save Changes' : 'Add Transaction'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransactionItem({ transaction, onEdit, onDelete }) {
  const { accounts, customCategories } = useStore();
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);
  const account = accounts.find((a) => a.id === transaction.account);
  const toAccount = transaction.toAccount ? accounts.find((a) => a.id === transaction.toAccount) : null;
  const cat = allCategories[transaction.category];
  const isIncome = cat?.type === 'income';
  const isTransfer = cat?.type === 'transfer';

  return (
    <div className="flex items-start sm:items-center gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors group">
      <div
        className="size-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0"
        style={{ backgroundColor: `${cat?.hex || '#666'}20`, color: cat?.hex || '#666' }}
      >
        {isTransfer ? <ArrowLeftRight /> : isIncome ? <ArrowDownLeft /> : <ArrowUpRight />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <p className="text-sm font-medium break-words">{transaction.subcategory}</p>
          <Badge variant="outline" className="text-[10px] shrink-0">{cat?.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="shrink-0">{formatDate(transaction.date)}</span>
          {account && (
            <>
              <span className="text-border text-[10px]">•</span>
              <span style={{ color: account.color }} className="shrink-0">{account.name}</span>
              {toAccount && (
                <>
                  <span className="text-muted-foreground">→</span>
                  <span style={{ color: toAccount.color }} className="shrink-0">{toAccount.name}</span>
                </>
              )}
            </>
          )}
          {transaction.note && (
            <>
              <span className="text-border text-[10px]">•</span>
              <span className="break-words line-clamp-2 md:line-clamp-none">{transaction.note}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
        <p className={cn('text-sm font-bold tabular-nums', isTransfer ? 'text-muted-foreground' : isIncome ? 'text-chart-1' : 'text-destructive')}>
          {isTransfer ? '' : isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
        </p>

        <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(transaction)}>
                <Pencil data-icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(transaction.id)}>
                <Trash2 data-icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { transactions, accounts, customCategories, customSubcategories, addTransaction, updateTransaction, deleteTransaction } = useStore();
  const period = usePeriodFilter(transactions);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSubcategory, setFilterSubcategory] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);

  const allCategoryList = useMemo(() => getAllCategoryList(customCategories), [customCategories]);
  const filterSubcategories = useMemo(() => {
    if (filterCategory === 'all') return [];
    return getSubcategories(filterCategory, customSubcategories, customCategories);
  }, [filterCategory, customSubcategories, customCategories]);

  const filtered = useMemo(() => {
    let list = period.filtered;
    if (filterCategory !== 'all') list = list.filter((t) => t.category === filterCategory);
    if (filterSubcategory !== 'all') list = list.filter((t) => t.subcategory === filterSubcategory);
    if (filterAccount !== 'all') list = list.filter((t) => t.account === filterAccount || t.toAccount === filterAccount);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.subcategory?.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [period.filtered, filterCategory, filterSubcategory, filterAccount, search]);

  const handleSubmit = (data) => {
    if (editingTx) {
      updateTransaction(editingTx.id, data);
    } else {
      addTransaction(data);
    }
    setEditingTx(null);
  };

  const handleEdit = (tx) => { setEditingTx(tx); setDialogOpen(true); };
  const openNew = () => { setEditingTx(null); setDialogOpen(true); };

  const income = filtered.filter((t) => t.category === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter((t) => t.category !== 'income' && t.category !== 'transfer').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Transactions</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Manage your income and expenses</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <PeriodFilter {...period} />
          <Button data-tour="add-transaction" onClick={openNew} size="sm" className="shrink-0"><Plus data-icon="inline-start" /> <span className="hidden sm:inline">Add</span></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:pt-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 sm:mb-1">Income</p>
            <p className="text-base sm:text-xl font-bold text-chart-1 truncate">{formatCurrency(income)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:pt-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 sm:mb-1">Expenses</p>
            <p className="text-base sm:text-xl font-bold text-destructive truncate">{formatCurrency(expense)}</p>
          </CardContent>
        </Card>
      </div>

      <div data-tour="search-filter" className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setFilterSubcategory('all'); }}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">All Categories</SelectItem>
              {allCategoryList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {filterCategory !== 'all' && filterSubcategories.length > 0 && (
            <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                <SelectItem value="all">All Subcategories</SelectItem>
                {filterSubcategories.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.name}
                  </div>
                </SelectItem>
              ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card data-tour="transaction-list">
        <CardContent className="p-2">
          {filtered.length > 0 ? (
            <div className="divide-y divide-border/50">
              {filtered.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onEdit={handleEdit}
                  onDelete={deleteTransaction}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <ArrowUpRight className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No transactions</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                {search || filterCategory !== 'all' || filterAccount !== 'all' ? 'Try adjusting your filters' : 'Add your first transaction to get started'}
              </p>
              {!search && filterCategory === 'all' && filterAccount === 'all' && (
                <Button onClick={openNew}><Plus data-icon="inline-start" /> Add Transaction</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <TransactionFormDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingTx(null); }}
          transaction={editingTx}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CurrencyInput from '@/components/ui/currency-input';
import { Icon, ChoicePill } from '@/components/ui/design';
import { DateField } from '@/components/ui/date-fields';
import useStore from '@/store/useStore';
import { useT } from '@/hooks/useT';
import { getAllCategoryList, getSubcategories } from '@/lib/constants';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Small uppercase field label, as used throughout the design's modal. */
function FieldLabel({ children }) {
  return (
    <div className="mb-1.5 text-[11.5px] uppercase tracking-[0.04em] text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Add / edit transaction, following the redesign's modal.
 *
 * The design picks category and account with pill rows rather than dropdowns;
 * subcategory keeps the same treatment so the whole sheet reads as one
 * language. Amount and category are the only required fields.
 */
export default function QuickAdd({ open, onOpenChange, editing, defaultType = 'expense' }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[440px] overflow-y-auto rounded-[20px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold">
            {editing ? t('transactions.editTitle') : t('quickAdd.title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('quickAdd.chooseCategory')}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <QuickAddForm
            editing={editing}
            defaultType={defaultType}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({ editing, defaultType, onDone }) {
  const t = useT();

  const accounts = useStore((s) => s.accounts);
  const customCategories = useStore((s) => s.customCategories);
  const customSubcategories = useStore((s) => s.customSubcategories);
  const lastUsedAccount = useStore((s) => s.lastUsedAccount);
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);

  const categoryList = useMemo(
    () => getAllCategoryList(customCategories),
    [customCategories]
  );

  const [category, setCategory] = useState(
    () => editing?.category || (defaultType === 'income' ? 'income' : '')
  );
  const [subcategory, setSubcategory] = useState(() => editing?.subcategory || '');
  const [amount, setAmount] = useState(() => (editing ? String(editing.amount) : ''));
  const [account, setAccount] = useState(
    () => editing?.account || lastUsedAccount || accounts[0]?.id || ''
  );
  const [toAccount, setToAccount] = useState(() => editing?.toAccount || '');
  const [date, setDate] = useState(
    () => editing?.date?.slice(0, 10) || format(new Date(), 'yyyy-MM-dd')
  );
  const [note, setNote] = useState(() => editing?.note || '');
  const [error, setError] = useState(null);

  const subcategories = useMemo(
    () => (category ? getSubcategories(category, customSubcategories, customCategories) : []),
    [category, customSubcategories, customCategories]
  );

  const selected = categoryList.find((c) => c.id === category);
  // Transfers and investments move money between two accounts.
  const needsDestination = category === 'transfer' || category === 'investments';

  const pickCategory = (id) => {
    setCategory(id);
    setError(null);
    const subs = getSubcategories(id, customSubcategories, customCategories);
    setSubcategory(subs.includes('Other') ? 'Other' : subs[0] || '');
    if (id !== 'transfer' && id !== 'investments') setToAccount('');
  };

  const submit = (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError(t('quickAdd.amountRequired'));
    if (!category) return setError(t('quickAdd.categoryRequired'));
    if (!account) return setError(t('quickAdd.accountRequired'));
    if (needsDestination && !toAccount) return setError(t('transactions.errToAccount'));
    if (needsDestination && toAccount === account) return setError(t('transactions.errSameAccount'));

    const payload = {
      category,
      subcategory: subcategory || 'Other',
      account,
      amount: Number(amount),
      date,
      note: note.trim() || undefined,
      ...(needsDestination ? { toAccount } : {}),
    };

    if (editing) updateTransaction(editing.id, payload);
    else addTransaction(payload);
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col">
      <FieldLabel>{t('quickAdd.category')}</FieldLabel>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {categoryList.map((c) => (
          <ChoicePill
            key={c.id}
            active={category === c.id}
            onClick={() => pickCategory(c.id)}
            style={category === c.id ? { backgroundColor: c.hex, color: '#fff' } : undefined}
          >
            {categoryLabel(c, t)}
          </ChoicePill>
        ))}
      </div>

      <FieldLabel>{t('quickAdd.amount')}</FieldLabel>
      <CurrencyInput
        name="amount"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setError(null); }}
        autoFocus
        size="lg"
        className="mb-4"
        style={{ color: selected?.hex }}
      />

      {subcategories.length > 0 && (
        <>
          <FieldLabel>{t('transactions.fieldSubcategory')}</FieldLabel>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {subcategories.map((s) => (
              <ChoicePill key={s} active={subcategory === s} onClick={() => setSubcategory(s)}>
                {subcategoryLabel(s, t)}
              </ChoicePill>
            ))}
          </div>
        </>
      )}

      <FieldLabel>
        {needsDestination ? t('transactions.fieldFromAccount') : t('quickAdd.account')}
      </FieldLabel>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <ChoicePill
            key={a.id}
            active={account === a.id}
            onClick={() => { setAccount(a.id); setError(null); }}
          >
            {a.name}
          </ChoicePill>
        ))}
      </div>

      {needsDestination && (
        <>
          <FieldLabel>{t('transactions.fieldToAccount')}</FieldLabel>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {accounts
              .filter((a) => a.id !== account)
              .map((a) => (
                <ChoicePill
                  key={a.id}
                  active={toAccount === a.id}
                  onClick={() => { setToAccount(a.id); setError(null); }}
                >
                  {a.name}
                </ChoicePill>
              ))}
          </div>
        </>
      )}

      <FieldLabel>{t('quickAdd.date')}</FieldLabel>
      <div className="mb-4">
        <DateField value={date} onChange={setDate} />
      </div>

      <FieldLabel>
        {t('quickAdd.note')}{' '}
        <span className="normal-case">({t('common.optional')})</span>
      </FieldLabel>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('quickAdd.notePlaceholder')}
        className="mb-5 h-11 rounded-[10px]"
      />

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          className="flex-1 rounded-xl py-3 font-bold"
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" className={cn('flex-1 rounded-xl py-3 font-bold')}>
          <Icon name="check" size={18} /> {t('quickAdd.save')}
        </Button>
      </div>
    </form>
  );
}

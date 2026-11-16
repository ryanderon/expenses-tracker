import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Tags, X, GripVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import useStore from '@/store/useStore';
import {
  CATEGORIES, CATEGORY_TYPES, CATEGORY_COLORS, getAllCategories, getSubcategories, isNeutralType,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Icon, SoftBadge } from '@/components/ui/design';
import PageHeader from '@/components/PageHeader';
import ReassignDialog from '@/components/ReassignDialog';
import { useT } from '@/hooks/useT';
import { categoryLabel, subcategoryLabel } from '@/lib/i18n';

const TYPE_BADGES = {
  income: { labelKey: 'categories.typeIncome', tone: 'primary' },
  expense: { labelKey: 'categories.typeExpense', tone: 'danger' },
  savings: { labelKey: 'categories.typeSavings', tone: 'teal' },
  investment: { labelKey: 'categories.typeInvestment', tone: 'violet' },
  receivable: { labelKey: 'categories.typeReceivable', tone: 'sky' },
  transfer: { labelKey: 'categories.typeTransfer', tone: 'muted' },
};

/** Where a deleted category's transactions go by default: the built-in one of the same type. */
const DEFAULT_TARGET = {
  income: 'income', expense: 'expenses', savings: 'savings', investment: 'investments',
};

function CategoryFormDialog({ open, onOpenChange, category, onSubmit }) {
  const t = useT();
  const [form, setForm] = useState(
    category
      ? { label: category.label, type: category.type, hex: category.hex }
      : { label: '', type: 'expense', hex: CATEGORY_COLORS[0] }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? t('categories.editTitle') : t('categories.newTitle')}</DialogTitle>
          <DialogDescription>
            {category ? t('categories.editDescription') : t('categories.newDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t('categories.name')}</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t('categories.namePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('categories.type')}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.keys(CATEGORY_TYPES)
                    .filter((key) => !isNeutralType(key))
                    .map((key) => (
                      <SelectItem key={key} value={key}>{t(TYPE_BADGES[key].labelKey)}</SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('categories.typeHint')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('categories.color')}</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, hex: c })}
                  className={cn(
                    'size-8 rounded-lg transition-all cursor-pointer',
                    form.hex === c ? 'ring-2 ring-ring ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{category ? t('categories.save') : t('categories.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubcategoryInput({ onAdd }) {
  const t = useT();
  const [value, setValue] = useState('');

  const handleAdd = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };

  return (
    <div className="flex gap-2 mt-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        placeholder={`${t('categories.addSubcategory')}…`}
        className="h-8 text-sm"
      />
      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdd} disabled={!value.trim()}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * The stored name a typed subcategory refers to. Built-in names are stored in
 * English but shown translated, so "Lainnya" has to find "Other" rather than
 * create a second "Lainnya" next to it.
 */
function resolveSubName(typed, existing, t) {
  const name = typed.trim();
  const lower = name.toLowerCase();
  return existing.find((s) => s.toLowerCase() === lower || subcategoryLabel(s, t).toLowerCase() === lower) || name;
}

/** A subcategory the user made: tap the name to rename it, × to remove it. */
function CustomSubChip({ name, onRename, onRemove }) {
  const t = useT();
  return (
    <span className="flex items-center gap-1 rounded-full border border-dashed border-border py-1 pl-2.5 pr-2 text-[11.5px] text-muted-foreground">
      <button
        type="button"
        onClick={onRename}
        title={t('categories.renameSub')}
        className="flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {subcategoryLabel(name, t)}
        <Icon name="edit" size={12} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('common.delete')}
        className="rounded-sm transition-colors hover:text-danger"
      >
        <Icon name="close" size={13} />
      </button>
    </span>
  );
}

/**
 * Renames a user-made subcategory. Its transactions and budget limits follow
 * the new name; picking a name the category already has merges the two.
 */
function RenameSubDialog({ category, from, count, existing, onClose, onConfirm }) {
  const t = useT();
  const [value, setValue] = useState(from);
  const name = resolveSubName(value, existing, t);
  const merging = name !== from && existing.includes(name);

  const submit = (e) => {
    e.preventDefault();
    if (!name || name === from) return;
    onConfirm(name);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('categories.renameSubTitle')}</DialogTitle>
          <DialogDescription>
            {t('categories.renameSubBody', { count, category })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          {merging && (
            <p className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber">
              {t('categories.renameSubMerge', { name: subcategoryLabel(name, t) })}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!name || name === from}>{t('categories.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryCard({ category, isBuiltIn, customSubs, onAddSub, onRemoveSub, onRenameSub, onEdit, onDelete }) {
  const t = useT();
  const typeBadge = TYPE_BADGES[category.type] || TYPE_BADGES.expense;
  const defaultSubs = category.subcategories || [];

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-(--shadow-card)">
      <div className="h-1.5" style={{ backgroundColor: category.hex }} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: category.hex }} />
            <h3 className="text-sm font-bold truncate">{categoryLabel(category, t)}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <SoftBadge tone={typeBadge.tone}>{t(typeBadge.labelKey)}</SoftBadge>
            {!isBuiltIn && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.edit')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.delete')}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('categories.subcategories')}</p>

          {isBuiltIn && (
            <div className="flex flex-wrap gap-1.5">
              {defaultSubs.map((sub) => (
                <span key={sub} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11.5px] text-muted-foreground">
                  {subcategoryLabel(sub, t)}
                </span>
              ))}
              {customSubs.map((sub) => (
                <CustomSubChip key={sub} name={sub} onRename={() => onRenameSub(sub)} onRemove={() => onRemoveSub(sub)} />
              ))}
            </div>
          )}

          {!isBuiltIn && (
            <div className="flex flex-wrap gap-1.5">
              {defaultSubs.length > 0 ? defaultSubs.map((sub) => (
                <CustomSubChip key={sub} name={sub} onRename={() => onRenameSub(sub)} onRemove={() => onRemoveSub(sub)} />
              )) : (
                <p className="text-xs italic text-muted-foreground">{t('budget.noCustomSubcategories')}</p>
              )}
            </div>
          )}
        </div>

        <SubcategoryInput onAdd={onAddSub} />
      </div>
    </div>
  );
}

export default function Categories() {
  const t = useT();
  const {
    customSubcategories, customCategories, transactions,
    addCustomSubcategory, removeCustomSubcategory,
    addCustomCategory, updateCustomCategory, deleteCustomCategory,
    addSubcategoryToCustomCategory, removeSubcategoryFromCustomCategory, reassignCategories,
    renameSubcategory,
  } = useStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  // { id, count } for a category being deleted that still has transactions.
  const [deleting, setDeleting] = useState(null);
  // { category, from } while the rename dialog is open.
  const [renaming, setRenaming] = useState(null);
  const [fixingOrphans, setFixingOrphans] = useState(false);

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const builtInEntries = Object.entries(CATEGORIES);
  const customEntries = Object.entries(customCategories);

  const handleCreateCategory = (form) => {
    const id = form.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!id || allCategories[id]) {
      alert(t('categories.exists'));
      return;
    }
    addCustomCategory(id, {
      label: form.label.trim(),
      type: form.type,
      color: `var(--chart-5)`,
      hex: form.hex,
      subcategories: [],
      isCustom: true,
    });
  };

  const handleEditCategory = (form) => {
    if (!editingCategory) return;
    updateCustomCategory(editingCategory, {
      label: form.label.trim(),
      type: form.type,
      hex: form.hex,
    });
    setEditingCategory(null);
  };

  /** Skips a name the category already has, including a built-in one typed in translation. */
  const addSubIfNew = (category, typed, add) => {
    const existing = getSubcategories(category, customSubcategories, customCategories);
    const name = resolveSubName(typed, existing, t);
    if (existing.includes(name)) return;
    add(category, name);
  };

  const subCount = (category, sub) =>
    transactions.filter((x) => x.category === category && (x.subcategory || 'Other') === sub).length;

  /** Removing a subcategory that's in use moves its transactions; say where first. */
  const handleRemoveSub = (category, name, remove) => {
    const count = subCount(category, name);
    if (count > 0) {
      const left = getSubcategories(category, customSubcategories, customCategories).filter((s) => s !== name);
      const target = left.includes('Other') ? 'Other' : left[0] || 'Other';
      const ok = window.confirm(t('categories.removeSubConfirm', {
        name, count, target: subcategoryLabel(target, t),
      }));
      if (!ok) return;
    }
    remove();
  };

  const handleDeleteCategory = (id) => {
    const count = transactions.filter((x) => x.category === id).length;
    if (count > 0) {
      setDeleting({ id, count });
      return;
    }
    if (window.confirm(t('categories.deleteConfirm'))) deleteCustomCategory(id);
  };

  // Transactions whose category was deleted by an older version.
  const orphans = useMemo(() => {
    const missing = new Set();
    let count = 0;
    for (const x of transactions) {
      if (allCategories[x.category]) continue;
      missing.add(x.category);
      count += 1;
    }
    return { ids: [...missing], count };
  }, [transactions, allCategories]);

  /** Every category a transaction can live in, except `excludeId`. */
  const categoryOptions = (excludeId) => Object.entries(allCategories)
    .filter(([key, cat]) => key !== excludeId && !isNeutralType(cat.type))
    .map(([key, cat]) => ({ value: key, label: categoryLabel(cat, t) }));

  const openNew = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const openEdit = (key) => {
    setEditingCategory(key);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={openNew}
            className="rounded-xl px-4 py-2.5 font-bold shadow-[0_4px_14px_var(--primary-soft)]"
          >
            <Icon name="add" size={18} /> {t('categories.add')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
      {orphans.count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-amber/40 bg-amber-soft px-4 py-3">
          <Icon name="link_off" size={20} className="text-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold">{t('categories.orphanTitle', { count: orphans.count })}</p>
            <p className="text-xs text-muted-foreground">{t('categories.orphanBody')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setFixingOrphans(true)}>
            {t('reassign.fix')}
          </Button>
        </div>
      )}

      {/* Built-in Categories */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('categories.builtIn')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInEntries.map(([key, cat]) => (
            <CategoryCard
              key={key}
              categoryKey={key}
              category={cat}
              isBuiltIn
              customSubs={customSubcategories[key] || []}
              onAddSub={(name) => addSubIfNew(key, name, addCustomSubcategory)}
              onRemoveSub={(name) => handleRemoveSub(key, name, () => removeCustomSubcategory(key, name))}
              onRenameSub={(name) => setRenaming({ category: key, from: name })}
            />
          ))}
        </div>
      </div>

      {/* Custom Categories */}
      {customEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('categories.custom')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {customEntries.map(([key, cat]) => (
              <CategoryCard
                key={key}
                categoryKey={key}
                category={cat}
                isBuiltIn={false}
                customSubs={[]}
                onAddSub={(name) => addSubIfNew(key, name, addSubcategoryToCustomCategory)}
                onRemoveSub={(name) => handleRemoveSub(key, name, () => removeSubcategoryFromCustomCategory(key, name))}
                onRenameSub={(name) => setRenaming({ category: key, from: name })}
                onEdit={() => openEdit(key)}
                onDelete={() => handleDeleteCategory(key)}
              />
            ))}
          </div>
        </div>
      )}

      {customEntries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Tags className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{t('categories.emptyCustomTitle')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              {t('categories.emptyCustomBody')}
            </p>
            <Button variant="outline" onClick={openNew}>
              <Plus data-icon="inline-start" /> {t('categories.createCustom')}
            </Button>
          </CardContent>
        </Card>
      )}

      {dialogOpen && (
        <CategoryFormDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCategory(null); }}
          category={editingCategory ? customCategories[editingCategory] : null}
          onSubmit={editingCategory ? handleEditCategory : handleCreateCategory}
        />
      )}

      {renaming && (
        <RenameSubDialog
          category={categoryLabel(allCategories[renaming.category], t)}
          from={renaming.from}
          count={subCount(renaming.category, renaming.from)}
          existing={getSubcategories(renaming.category, customSubcategories, customCategories)}
          onClose={() => setRenaming(null)}
          onConfirm={(to) => renameSubcategory(renaming.category, renaming.from, to)}
        />
      )}

      {deleting && (
        <ReassignDialog
          open
          onOpenChange={(v) => { if (!v) setDeleting(null); }}
          title={t('categories.deleteTitle', { name: customCategories[deleting.id]?.label || deleting.id })}
          description={t('categories.deleteHasTx', { count: deleting.count })}
          count={deleting.count}
          options={categoryOptions(deleting.id)}
          defaultTarget={DEFAULT_TARGET[customCategories[deleting.id]?.type]}
          confirmLabel={t('common.delete')}
          onConfirm={(moveTo) => deleteCustomCategory(deleting.id, { moveTo })}
        />
      )}

      {fixingOrphans && (
        <ReassignDialog
          open
          onOpenChange={setFixingOrphans}
          title={t('categories.orphanDialogTitle')}
          description={t('categories.orphanBody')}
          count={orphans.count}
          options={categoryOptions()}
          defaultTarget="expenses"
          confirmLabel={t('reassign.fix')}
          onConfirm={(moveTo) => reassignCategories(orphans.ids, moveTo)}
        />
      )}
      </div>
    </>
  );
}

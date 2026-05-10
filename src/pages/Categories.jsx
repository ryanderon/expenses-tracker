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
import { CATEGORIES, CATEGORY_TYPES, CATEGORY_COLORS, getAllCategories } from '@/lib/constants';
import { cn } from '@/lib/utils';

const TYPE_BADGES = {
  income: { label: 'Income', className: 'bg-chart-1/15 text-chart-1 border-chart-1/30' },
  expense: { label: 'Expense', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  savings: { label: 'Savings', className: 'bg-chart-3/15 text-chart-3 border-chart-3/30' },
  investment: { label: 'Investment', className: 'bg-chart-4/15 text-chart-4 border-chart-4/30' },
  transfer: { label: 'Transfer', className: 'bg-muted text-muted-foreground border-border' },
};

function CategoryFormDialog({ open, onOpenChange, category, onSubmit }) {
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
          <DialogTitle>{category ? 'Edit Category' : 'New Category'}</DialogTitle>
          <DialogDescription>
            {category ? 'Update your category details.' : 'Create a custom category to organize your transactions.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Category Name</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Entertainment, Education"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(CATEGORY_TYPES)
                    .filter(([key]) => key !== 'transfer')
                    .map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Determines how this category affects your balance calculations.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{category ? 'Update' : 'Create Category'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubcategoryInput({ onAdd }) {
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
        placeholder="Add subcategory..."
        className="h-8 text-sm"
      />
      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdd} disabled={!value.trim()}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function CategoryCard({ categoryKey, category, isBuiltIn, customSubs, onAddSub, onRemoveSub, onEdit, onDelete }) {
  const typeBadge = TYPE_BADGES[category.type] || TYPE_BADGES.expense;
  const defaultSubs = category.subcategories || [];

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: category.hex }} />
      <CardContent className="p-4 pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: category.hex }} />
            <h3 className="text-sm font-semibold truncate">{category.label}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', typeBadge.className)}>
              {typeBadge.label}
            </Badge>
            {!isBuiltIn && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Subcategories</p>

          {isBuiltIn && (
            <div className="flex flex-wrap gap-1.5">
              {defaultSubs.map((sub) => (
                <Badge key={sub} variant="secondary" className="text-xs font-normal gap-1">
                  {sub}
                </Badge>
              ))}
              {customSubs.map((sub) => (
                <Badge key={sub} variant="outline" className="text-xs font-normal gap-1 pr-1 border-dashed">
                  {sub}
                  <button
                    onClick={() => onRemoveSub(sub)}
                    className="ml-0.5 hover:text-destructive rounded-sm p-0.5 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {!isBuiltIn && (
            <div className="flex flex-wrap gap-1.5">
              {defaultSubs.length > 0 ? defaultSubs.map((sub) => (
                <Badge key={sub} variant="outline" className="text-xs font-normal gap-1 pr-1 border-dashed">
                  {sub}
                  <button
                    onClick={() => onRemoveSub(sub)}
                    className="ml-0.5 hover:text-destructive rounded-sm p-0.5 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              )) : (
                <p className="text-xs text-muted-foreground italic">No subcategories yet</p>
              )}
            </div>
          )}
        </div>

        <SubcategoryInput onAdd={onAddSub} />
      </CardContent>
    </Card>
  );
}

export default function Categories() {
  const {
    customSubcategories, customCategories, transactions,
    addCustomSubcategory, removeCustomSubcategory,
    addCustomCategory, updateCustomCategory, deleteCustomCategory,
    addSubcategoryToCustomCategory, removeSubcategoryFromCustomCategory,
  } = useStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories]);

  const builtInEntries = Object.entries(CATEGORIES);
  const customEntries = Object.entries(customCategories);

  const handleCreateCategory = (form) => {
    const id = form.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (allCategories[id]) {
      alert('A category with this name already exists.');
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

  const handleDeleteCategory = (id) => {
    const hasTx = transactions.some((t) => t.category === id);
    const msg = hasTx
      ? 'This category has transactions. Deleting it will leave those transactions with an unknown category. Continue?'
      : 'Are you sure you want to delete this category?';
    if (!window.confirm(msg)) return;
    deleteCustomCategory(id);
  };

  const openNew = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const openEdit = (key) => {
    setEditingCategory(key);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Categories</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Manage your transaction categories and subcategories</p>
        </div>
        <Button onClick={openNew} size="sm" className="shrink-0 self-start sm:self-auto">
          <Plus data-icon="inline-start" /> Add Category
        </Button>
      </div>

      {/* Built-in Categories */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Built-in Categories</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInEntries.map(([key, cat]) => (
            <CategoryCard
              key={key}
              categoryKey={key}
              category={cat}
              isBuiltIn
              customSubs={customSubcategories[key] || []}
              onAddSub={(name) => addCustomSubcategory(key, name)}
              onRemoveSub={(name) => removeCustomSubcategory(key, name)}
            />
          ))}
        </div>
      </div>

      {/* Custom Categories */}
      {customEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Custom Categories</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {customEntries.map(([key, cat]) => (
              <CategoryCard
                key={key}
                categoryKey={key}
                category={cat}
                isBuiltIn={false}
                customSubs={[]}
                onAddSub={(name) => addSubcategoryToCustomCategory(key, name)}
                onRemoveSub={(name) => removeSubcategoryFromCustomCategory(key, name)}
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
            <h3 className="text-lg font-semibold mb-1">No custom categories</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Built-in categories cover most needs. Create custom ones for specific tracking.
            </p>
            <Button variant="outline" onClick={openNew}>
              <Plus data-icon="inline-start" /> Create Custom Category
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
    </div>
  );
}

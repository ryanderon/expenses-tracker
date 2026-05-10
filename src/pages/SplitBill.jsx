import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Camera, Plus, Trash2, Users, Receipt, ScanLine, Loader2,
  Share2, X, UserPlus, ImagePlus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import CurrencyInput from '@/components/ui/currency-input';
import useStore from '@/store/useStore';
import { formatCurrency, cn } from '@/lib/utils';

const PERSON_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#87CEEB', '#FFB6C1', '#90EE90', '#D4A574',
];

let nextItemId = 1;
let nextPersonId = 1;

function parseReceiptText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  const skipWords = /^(subtotal|sub total|total|tax|pajak|ppn|pb1|service|servis|change|kembalian|tunai|cash|debit|credit|card|kartu|no\.|tanggal|date|time|waktu|kasir|cashier|receipt|nota|struk|terima kasih|thank)/i;
  const pricePattern = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)$/;

  for (const line of lines) {
    if (skipWords.test(line)) continue;
    if (line.length < 3) continue;

    const match = line.match(pricePattern);
    if (match) {
      const priceStr = match[1].replace(/\./g, '').replace(/,/g, '');
      const price = parseInt(priceStr, 10);
      if (price <= 0 || price > 100000000) continue;

      let name = line.substring(0, match.index).trim();
      // Remove trailing quantity patterns like "x1", "x2", "1x", "2x"
      name = name.replace(/\s*[x×]\s*\d+\s*$/i, '').replace(/\s*\d+\s*[x×]\s*$/i, '').trim();
      // Remove trailing separators
      name = name.replace(/[\s._-]+$/, '').trim();

      if (name.length >= 1 && price >= 100) {
        items.push({ id: nextItemId++, name, price, qty: 1, assignedTo: [] });
      }
    }
  }
  return items;
}

function PersonAvatar({ person, size = 'md', selected, onClick, showRemove, onRemove }) {
  const sizeClasses = size === 'sm' ? 'size-7 text-[10px]' : 'size-9 text-xs';
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-full flex items-center justify-center font-bold text-white transition-all',
          sizeClasses,
          selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105',
          onClick ? 'cursor-pointer' : 'cursor-default'
        )}
        style={{ backgroundColor: person.color }}
        title={person.name}
      >
        {person.name.charAt(0).toUpperCase()}
      </button>
      {showRemove && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 size-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}

function BillItemCard({ item, people, onUpdate, onDelete, onTogglePerson }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-xl p-3 bg-background transition-all">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-7 text-sm font-medium border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
              placeholder="Item name"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CurrencyInput
            name={`item-${item.id}`}
            value={item.price || ''}
            onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
            className="h-7 w-28 text-sm text-right border-0 p-0 pr-1 shadow-none focus-visible:ring-0 bg-transparent font-semibold tabular-nums"
          />
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10 shrink-0" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Qty</Label>
            <Input
              type="number"
              min="1"
              value={item.qty}
              onChange={(e) => onUpdate({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
              className="h-7 w-16 text-sm text-center"
            />
            <span className="text-xs text-muted-foreground ml-auto">
              Total: {formatCurrency(item.price * item.qty)}
            </span>
          </div>
        </div>
      )}

      {people.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Split:</span>
          {people.map((p) => {
            const isAssigned = item.assignedTo.includes(p.id);
            return (
              <PersonAvatar
                key={p.id}
                person={p}
                size="sm"
                selected={isAssigned}
                onClick={() => onTogglePerson(p.id)}
              />
            );
          })}
          {item.assignedTo.length > 0 && (
            <span className="text-[11px] text-muted-foreground ml-1">
              ({formatCurrency(Math.round((item.price * item.qty) / item.assignedTo.length))}/person)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SplitBill() {
  const { userName } = useStore();
  const [mode, setMode] = useState('manual');
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState(() => {
    const me = { id: `p${nextPersonId++}`, name: userName || 'Me', color: PERSON_COLORS[0] };
    return [me];
  });
  const [extras, setExtras] = useState({ tax: '', serviceCharge: '', discount: '' });
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const fileInputRef = useRef(null);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { id: nextItemId++, name: '', price: 0, qty: 1, assignedTo: [] }]);
  }, []);

  const updateItem = useCallback((id, updates) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const deleteItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const togglePersonOnItem = useCallback((itemId, personId) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const isAssigned = item.assignedTo.includes(personId);
      return {
        ...item,
        assignedTo: isAssigned
          ? item.assignedTo.filter((id) => id !== personId)
          : [...item.assignedTo, personId],
      };
    }));
  }, []);

  const assignAllToEveryone = useCallback(() => {
    const allIds = people.map((p) => p.id);
    setItems((prev) => prev.map((item) => ({ ...item, assignedTo: allIds })));
  }, [people]);

  const addPerson = useCallback(() => {
    if (!newPersonName.trim()) return;
    const colorIndex = people.length % PERSON_COLORS.length;
    setPeople((prev) => [...prev, { id: `p${nextPersonId++}`, name: newPersonName.trim(), color: PERSON_COLORS[colorIndex] }]);
    setNewPersonName('');
    setShowAddPerson(false);
  }, [newPersonName, people.length]);

  const removePerson = useCallback((id) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setItems((prev) => prev.map((item) => ({
      ...item,
      assignedTo: item.assignedTo.filter((pid) => pid !== id),
    })));
  }, []);

  const handleOcrUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrError('');

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ind+eng');
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const parsed = parseReceiptText(data.text);
      if (parsed.length === 0) {
        setOcrError('Could not find any items. Try a clearer photo or add items manually.');
      } else {
        setItems((prev) => [...prev, ...parsed]);
        setMode('manual');
      }
    } catch {
      setOcrError('Failed to process image. Please try again or add items manually.');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  }, []);

  const subtotal = useMemo(() =>
    items.reduce((sum, item) => sum + item.price * item.qty, 0),
  [items]);

  const taxAmount = useMemo(() => {
    const val = parseFloat(extras.tax) || 0;
    return val > 0 && val <= 100 ? Math.round(subtotal * val / 100) : val;
  }, [subtotal, extras.tax]);

  const serviceAmount = useMemo(() => {
    const val = parseFloat(extras.serviceCharge) || 0;
    return val > 0 && val <= 100 ? Math.round(subtotal * val / 100) : val;
  }, [subtotal, extras.serviceCharge]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(extras.discount) || 0;
    return val > 0 && val <= 100 ? Math.round(subtotal * val / 100) : val;
  }, [subtotal, extras.discount]);

  const grandTotal = useMemo(() =>
    subtotal + taxAmount + serviceAmount - discountAmount,
  [subtotal, taxAmount, serviceAmount, discountAmount]);

  const personTotals = useMemo(() => {
    const totals = {};
    people.forEach((p) => { totals[p.id] = 0; });

    items.forEach((item) => {
      if (item.assignedTo.length === 0) return;
      const itemTotal = item.price * item.qty;
      const perPerson = itemTotal / item.assignedTo.length;
      item.assignedTo.forEach((pid) => {
        if (totals[pid] !== undefined) totals[pid] += perPerson;
      });
    });

    // Distribute extras proportionally
    const assignedSubtotal = Object.values(totals).reduce((s, v) => s + v, 0);
    if (assignedSubtotal > 0) {
      const multiplier = (grandTotal) / (subtotal || 1);
      people.forEach((p) => {
        totals[p.id] = Math.round(totals[p.id] * multiplier);
      });
    }

    return totals;
  }, [items, people, grandTotal, subtotal]);

  const unassignedItems = items.filter((item) => item.assignedTo.length === 0);

  const handleShare = useCallback(() => {
    let text = '🧾 Split Bill Summary\n';
    text += `━━━━━━━━━━━━━━━\n`;
    items.forEach((item) => {
      text += `${item.name} × ${item.qty} — ${formatCurrency(item.price * item.qty)}\n`;
    });
    text += `━━━━━━━━━━━━━━━\n`;
    text += `Subtotal: ${formatCurrency(subtotal)}\n`;
    if (taxAmount) text += `Tax: ${formatCurrency(taxAmount)}\n`;
    if (serviceAmount) text += `Service: ${formatCurrency(serviceAmount)}\n`;
    if (discountAmount) text += `Discount: -${formatCurrency(discountAmount)}\n`;
    text += `Total: ${formatCurrency(grandTotal)}\n\n`;
    text += `💰 Each person owes:\n`;
    people.forEach((p) => {
      text += `${p.name}: ${formatCurrency(personTotals[p.id] || 0)}\n`;
    });

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => alert('Summary copied to clipboard!'));
    }
  }, [items, people, personTotals, subtotal, taxAmount, serviceAmount, discountAmount, grandTotal]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Split Bill</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Split expenses with friends easily</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="ocr" className="text-xs sm:text-sm gap-1.5">
                <ScanLine className="size-3.5" /> Scan
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs sm:text-sm gap-1.5">
                <Receipt className="size-3.5" /> Manual
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* OCR Upload Section */}
      {mode === 'ocr' && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            {ocrLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-10 text-primary animate-spin" />
                <p className="text-sm font-medium">Scanning receipt...</p>
                <p className="text-xs text-muted-foreground">This may take a few seconds</p>
              </div>
            ) : (
              <>
                <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <ImagePlus className="text-primary size-7" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Scan a Receipt</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Take a photo or upload an image of your receipt. We'll extract the items automatically.
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Camera data-icon="inline-start" /> Upload Photo
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleOcrUpload}
                />
                {ocrError && (
                  <p className="text-sm text-destructive mt-3">{ocrError}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* People Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">People ({people.length})</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddPerson(true)}>
              <UserPlus className="size-3.5 mr-1" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/50 border border-border/50">
                <PersonAvatar person={p} size="sm" showRemove={people.length > 1} onRemove={() => removePerson(p.id)} />
                <span className="text-xs font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Items Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Items ({items.length})</span>
            </div>
            <div className="flex gap-2">
              {items.length > 0 && people.length > 1 && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={assignAllToEveryone}>
                  Split All Equally
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                <Plus className="size-3.5 mr-1" /> Add Item
              </Button>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <BillItemCard
                  key={item.id}
                  item={item}
                  people={people}
                  onUpdate={(updates) => updateItem(item.id, updates)}
                  onDelete={() => deleteItem(item.id)}
                  onTogglePerson={(personId) => togglePersonOnItem(item.id, personId)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <Receipt className="size-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No items yet. Add items or scan a receipt.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extras */}
      {items.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <span className="text-sm font-semibold mb-3 block">Additional Charges</span>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Tax (%)</Label>
                <Input
                  type="number"
                  min="0"
                  value={extras.tax}
                  onChange={(e) => setExtras((prev) => ({ ...prev, tax: e.target.value }))}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Service (%)</Label>
                <Input
                  type="number"
                  min="0"
                  value={extras.serviceCharge}
                  onChange={(e) => setExtras((prev) => ({ ...prev, serviceCharge: e.target.value }))}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Discount (%)</Label>
                <Input
                  type="number"
                  min="0"
                  value={extras.discount}
                  onChange={(e) => setExtras((prev) => ({ ...prev, discount: e.target.value }))}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({extras.tax}%)</span>
                  <span className="tabular-nums">+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {serviceAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service ({extras.serviceCharge}%)</span>
                  <span className="tabular-nums">+{formatCurrency(serviceAmount)}</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount ({extras.discount}%)</span>
                  <span className="tabular-nums text-chart-1">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Grand Total</span>
                <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-person Summary */}
      {items.length > 0 && people.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">Per Person</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleShare}>
                <Share2 className="size-3.5 mr-1" /> Share
              </Button>
            </div>

            {unassignedItems.length > 0 && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2 mb-3">
                {unassignedItems.length} item(s) not assigned to anyone yet
              </div>
            )}

            <div className="flex flex-col gap-2">
              {people.map((p) => {
                const total = personTotals[p.id] || 0;
                const pctOfTotal = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                    <PersonAvatar person={p} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{pctOfTotal}% of total</p>
                    </div>
                    <span className="text-base font-bold tabular-nums">{formatCurrency(total)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Person Dialog */}
      <Dialog open={showAddPerson} onOpenChange={setShowAddPerson}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Add Person</DialogTitle>
            <DialogDescription>Add someone to split the bill with.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addPerson(); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Enter name..."
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddPerson(false)}>Cancel</Button>
              <Button type="submit" disabled={!newPersonName.trim()}>Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

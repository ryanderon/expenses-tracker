import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Plus, RefreshCw, Loader2, Search, Trash2, TrendingUp, TrendingDown,
  AlertTriangle, KeyRound, Settings as SettingsIcon, ChevronDown, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import CurrencyInput from '@/components/ui/currency-input';
import useStore from '@/store/useStore';
import usePrices from '@/hooks/usePrices';
import { useT, useDateFormat } from '@/hooks/useT';
import { searchSymbols, lotSizeFor, priceKey } from '@/lib/prices';
import { buildPortfolio } from '@/lib/portfolio';
import PageHeader from '@/components/PageHeader';
import { DateField } from '@/components/ui/date-fields';
import { cn } from '@/lib/utils';

/** Prices are per-share and often small, so IDR formatting needs decimals. */
function formatMoney(value, currency = 'IDR', maxDecimals = 0) {
  if (value == null) return '—';
  return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

function formatPct(value) {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function Gain({ value, pct, currency }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  return (
    <span className={cn('tabular-nums', up ? 'text-chart-1' : 'text-destructive')}>
      {up ? '+' : '−'}{formatMoney(Math.abs(value), currency)}
      {pct != null && <span className="text-xs ml-1">({formatPct(pct)})</span>}
    </span>
  );
}

/**
 * Symbol picker.
 *
 * Search hits Twelve Data's reference endpoint, which costs no API credits —
 * so typing freely here never eats into the quote budget. The exchange is
 * always shown because the same ticker exists on several: `BBCA` is Bank
 * Central Asia on IDX and a Canadian ETF on three others.
 */
function SymbolSearch({ onPick, t }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);

  const run = (value) => {
    setQuery(value);
    setErr(null);
    clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchSymbols(value));
      } catch (e) {
        setErr(t(e.i18nKey || 'prices.errGeneric'));
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => run(e.target.value)}
          placeholder={t('portfolio.searchPlaceholder')}
          className="pl-9"
          autoFocus
        />
        {loading && (
          <Loader2 className="size-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
          {results.map((r) => (
            <button
              key={`${r.exchange}-${r.symbol}-${r.micCode}`}
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {r.symbol}
                  <span className="text-muted-foreground font-normal"> · {r.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.exchange} · {r.currency} · {r.country}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{r.exchange}</Badge>
            </button>
          ))}
        </div>
      )}

      {query.trim().length >= 2 && !loading && results.length === 0 && !err && (
        <p className="text-xs text-muted-foreground">{t('portfolio.noResults')}</p>
      )}
    </div>
  );
}

function AddHoldingDialog({ open, onOpenChange }) {
  const t = useT();
  const holdings = useStore((s) => s.holdings);
  const addHolding = useStore((s) => s.addHolding);
  const addBuyToHolding = useStore((s) => s.addBuyToHolding);

  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState(null);

  const lotSize = picked ? lotSizeFor(picked.exchange) : 1;
  const usesLots = lotSize > 1;
  const shares = Number(qty || 0) * lotSize;

  const reset = () => {
    setPicked(null); setQty(''); setPrice(''); setFee('');
    setDate(format(new Date(), 'yyyy-MM-dd')); setError(null);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!picked) return setError(t('portfolio.errPickSymbol'));
    if (!qty || Number(qty) <= 0) return setError(t('portfolio.errQty'));
    if (!price || Number(price) <= 0) return setError(t('portfolio.errPrice'));

    const buy = {
      date,
      shares,
      price: Number(price),
      fee: Number(fee || 0),
    };

    // Buying more of something already held averages into it rather than
    // creating a second row for the same instrument.
    const existing = holdings.find(
      (h) => h.symbol === picked.symbol && h.exchange === picked.exchange
    );

    if (existing) {
      addBuyToHolding(existing.id, buy);
    } else {
      addHolding({
        symbol: picked.symbol,
        exchange: picked.exchange,
        micCode: picked.micCode,
        name: picked.name,
        currency: picked.currency,
        type: picked.type,
        lotSize,
        buys: [{ ...buy, id: `${Date.now()}` }],
      });
    }

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('portfolio.addTitle')}</DialogTitle>
          <DialogDescription>{t('portfolio.addBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {picked ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{picked.symbol} · {picked.name}</p>
                <p className="text-xs text-muted-foreground">
                  {picked.exchange} · {picked.currency}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setPicked(null)}>
                <X data-icon />
              </Button>
            </div>
          ) : (
            <SymbolSearch onPick={(r) => { setPicked(r); setError(null); }} t={t} />
          )}

          {picked && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {usesLots ? t('portfolio.lots') : t('portfolio.shares')}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={qty}
                    onChange={(e) => { setQty(e.target.value); setError(null); }}
                    placeholder="0"
                  />
                  {usesLots && Number(qty) > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {t('portfolio.sharesHint', { shares: shares.toLocaleString('id-ID') })}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t('portfolio.buyPrice')}</Label>
                  <CurrencyInput
                    name="price"
                    value={price}
                    onChange={(e) => { setPrice(e.target.value); setError(null); }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('portfolio.perShare')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t('portfolio.date')}</Label>
                  <DateField value={date} onChange={setDate} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {t('portfolio.fee')}{' '}
                    <span className="text-muted-foreground font-normal">
                      ({t('common.optional')})
                    </span>
                  </Label>
                  <CurrencyInput name="fee" value={fee} onChange={(e) => setFee(e.target.value)} />
                </div>
              </div>

              {Number(qty) > 0 && Number(price) > 0 && (
                <div className="rounded-lg bg-secondary/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t('portfolio.totalCost')}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(shares * Number(price) + Number(fee || 0), picked.currency)}
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!picked}>{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HoldingRow({ row, t, dates, quoteError }) {
  const [open, setOpen] = useState(false);
  const deleteHolding = useStore((s) => s.deleteHolding);
  const removeBuy = useStore((s) => s.removeBuyFromHolding);
  const { stats } = row;

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{row.symbol}</p>
              <Badge variant="secondary" className="text-[10px] shrink-0">{row.exchange}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{row.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.lots != null
                ? t('portfolio.lotsHeld', { lots: stats.lots.toLocaleString('id-ID') })
                : t('portfolio.sharesHeld', { shares: stats.shares.toLocaleString('id-ID') })}
              {' · '}
              {t('portfolio.avgAt', { price: formatMoney(stats.avgPrice, row.currency, 2) })}
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm font-semibold tabular-nums">
              {stats.hasQuote ? formatMoney(stats.marketValue, row.currency) : '—'}
            </p>
            <p className="text-xs">
              <Gain value={stats.pl} pct={stats.plPct} currency={row.currency} />
            </p>
          </div>

          <ChevronDown className={cn('size-4 text-muted-foreground shrink-0 mt-1 transition-transform', open && 'rotate-180')} />
        </button>

        {quoteError && (
          <p className="mt-2 text-xs text-chart-2 flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 mt-px shrink-0" /> {t(quoteError)}
          </p>
        )}

        {open && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">{t('portfolio.lastPrice')}</p>
                <p className="font-medium tabular-nums">
                  {formatMoney(stats.price, row.currency, 2)}
                  {stats.dayChangePct != null && (
                    <span className={cn('ml-1.5', stats.dayChangePct >= 0 ? 'text-chart-1' : 'text-destructive')}>
                      {formatPct(stats.dayChangePct)}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('portfolio.costBasis')}</p>
                <p className="font-medium tabular-nums">{formatMoney(stats.costBasis, row.currency)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('portfolio.buyHistory')}</Label>
              {(row.buys || []).map((buy) => (
                <div key={buy.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-20 shrink-0">{dates.short(buy.date)}</span>
                  <span className="flex-1 tabular-nums">
                    {stats.lotSize > 1
                      ? t('portfolio.lotsAt', {
                          lots: (buy.shares / stats.lotSize).toLocaleString('id-ID'),
                          price: formatMoney(buy.price, row.currency, 2),
                        })
                      : t('portfolio.sharesAt', {
                          shares: buy.shares.toLocaleString('id-ID'),
                          price: formatMoney(buy.price, row.currency, 2),
                        })}
                  </span>
                  {(row.buys || []).length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeBuy(row.id, buy.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(t('portfolio.deleteConfirm', { symbol: row.symbol }))) {
                  deleteHolding(row.id);
                }
              }}
            >
              <Trash2 data-icon="inline-start" /> {t('portfolio.removeHolding')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Portfolio() {
  const t = useT();
  const dates = useDateFormat();
  const [addOpen, setAddOpen] = useState(false);

  const holdings = useStore((s) => s.holdings);
  const priceCache = useStore((s) => s.priceCache);
  const priceRates = useStore((s) => s.priceRates);
  const baseCurrency = useStore((s) => s.priceMeta.baseCurrency) || 'IDR';

  const prices = usePrices();

  const portfolio = useMemo(
    () => buildPortfolio(holdings, priceCache, priceRates, baseCurrency),
    [holdings, priceCache, priceRates, baseCurrency]
  );

  const hasHoldings = holdings.length > 0;

  return (
    <>
      <PageHeader
        actions={
          <>
          {hasHoldings && prices.hasKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={prices.refresh}
              disabled={prices.status === 'loading'}
            >
              {prices.status === 'loading'
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <RefreshCw data-icon="inline-start" />}
              {t('portfolio.refresh')}
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} className="rounded-xl px-4 py-2.5 font-bold">
            <Plus data-icon="inline-start" /> {t('portfolio.add')}
          </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">

      {!prices.hasKey && (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3 text-center">
            <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <KeyRound className="text-primary size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('portfolio.setupTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {t('portfolio.setupBody')}
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/settings">
                <SettingsIcon data-icon="inline-start" /> {t('portfolio.setupAction')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {hasHoldings && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {t('portfolio.totalValue')}
            </p>
            <p className="text-3xl font-bold tabular-nums mt-1">
              {formatMoney(portfolio.marketValue, baseCurrency)}
            </p>
            <p className="text-sm mt-1">
              <Gain value={portfolio.pl} pct={portfolio.plPct} currency={baseCurrency} />
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border text-xs">
              <div>
                <p className="text-muted-foreground">{t('portfolio.costBasis')}</p>
                <p className="font-medium tabular-nums">
                  {formatMoney(portfolio.costBasis, baseCurrency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('portfolio.lastUpdated')}</p>
                <p className="font-medium">
                  {portfolio.quotedAt
                    ? t('common.ago', { time: dates.distance(portfolio.quotedAt) })
                    : t('portfolio.neverFetched')}
                </p>
              </div>
            </div>

            {portfolio.pricedCount < portfolio.totalCount && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('portfolio.partialPrices', {
                  priced: portfolio.pricedCount,
                  total: portfolio.totalCount,
                })}
              </p>
            )}

            {portfolio.unconvertible > 0 && (
              <p className="mt-1 text-xs text-chart-2">
                {t('portfolio.noRate', { count: portfolio.unconvertible })}
              </p>
            )}

            {prices.hasKey && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t('portfolio.budgetLine', {
                  used: prices.usedToday,
                  perDay: prices.perDay,
                  credits: prices.creditsPerRefresh,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {prices.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-2">
            <AlertTriangle className="text-destructive size-4 mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{t(prices.error)}</p>
          </CardContent>
        </Card>
      )}

      {hasHoldings ? (
        <div className="flex flex-col gap-3">
          {portfolio.rows.map((row) => (
            <HoldingRow
              key={row.id}
              row={row}
              t={t}
              dates={dates}
              quoteError={prices.quoteErrors[priceKey(row.exchange, row.symbol)]}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 flex flex-col items-center gap-3 text-center">
            <div className="size-11 rounded-2xl bg-secondary flex items-center justify-center">
              <TrendingUp className="text-muted-foreground size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('portfolio.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {t('portfolio.emptyBody')}
              </p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" /> {t('portfolio.add')}
            </Button>
          </CardContent>
        </Card>
      )}

      <AddHoldingDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    </>
  );
}

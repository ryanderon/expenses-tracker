import { lotSizeFor, priceKey } from '@/lib/prices';

/**
 * Turns buy entries into the numbers a holder actually wants to see.
 *
 * Average price is weighted by shares and includes fees, so averaging down
 * across several buys lands on the real break-even rather than a plain mean
 * of the prices paid.
 */
function holdingStats(holding, quote, rate = 1) {
  const lotSize = holding.lotSize ?? lotSizeFor(holding.exchange);

  let shares = 0;
  let costBasis = 0;
  for (const buy of holding.buys || []) {
    shares += buy.shares;
    costBasis += buy.shares * buy.price + (buy.fee || 0);
  }

  const avgPrice = shares > 0 ? costBasis / shares : 0;
  const price = quote?.price ?? null;
  const marketValue = price != null ? shares * price : null;
  const pl = marketValue != null ? marketValue - costBasis : null;
  const plPct = pl != null && costBasis > 0 ? (pl / costBasis) * 100 : null;

  return {
    shares,
    lots: lotSize > 1 ? shares / lotSize : null,
    lotSize,
    costBasis,
    avgPrice,
    price,
    marketValue,
    pl,
    plPct,
    // Same figures converted into the display currency for portfolio totals.
    costBasisBase: costBasis * rate,
    marketValueBase: marketValue != null ? marketValue * rate : null,
    dayChangePct: quote?.changePct ?? null,
    quotedAt: quote?.at ?? null,
    hasQuote: price != null,
  };
}

/**
 * Portfolio roll-up in one display currency.
 *
 * Holdings whose price hasn't been fetched yet are counted at cost rather than
 * dropped — showing a total that silently omits a position is worse than
 * showing one that hasn't moved yet. `pricedCount` lets the UI say so.
 */
export function buildPortfolio(holdings, priceCache = {}, rates = {}, baseCurrency = 'IDR') {
  const rows = holdings.map((holding) => {
    const key = priceKey(holding.exchange, holding.symbol);
    const quote = priceCache[key];
    const rate = holding.currency === baseCurrency ? 1 : (rates[holding.currency] ?? null);

    return {
      ...holding,
      key,
      // Without an FX rate we can't express this holding in the base currency.
      convertible: rate != null,
      stats: holdingStats(holding, quote, rate ?? 1),
    };
  });

  let costBasis = 0;
  let marketValue = 0;
  let pricedCount = 0;
  let unconvertible = 0;

  for (const row of rows) {
    if (!row.convertible) {
      unconvertible += 1;
      continue;
    }
    costBasis += row.stats.costBasisBase;
    marketValue += row.stats.marketValueBase ?? row.stats.costBasisBase;
    if (row.stats.hasQuote) pricedCount += 1;
  }

  const pl = marketValue - costBasis;

  return {
    rows: rows.sort((a, b) => (b.stats.marketValueBase ?? 0) - (a.stats.marketValueBase ?? 0)),
    baseCurrency,
    costBasis,
    marketValue,
    pl,
    plPct: costBasis > 0 ? (pl / costBasis) * 100 : 0,
    pricedCount,
    totalCount: rows.length,
    unconvertible,
    // Oldest quote in the set — that's what "as of" honestly means.
    quotedAt: rows.reduce((oldest, r) => {
      const at = r.stats.quotedAt;
      if (at == null) return oldest;
      return oldest == null || at < oldest ? at : oldest;
    }, null),
  };
}

/** Currencies that need an FX rate to sit in the same total. */
export function foreignCurrencies(holdings, baseCurrency = 'IDR') {
  return [...new Set(
    holdings.map((h) => h.currency).filter((c) => c && c !== baseCurrency)
  )];
}

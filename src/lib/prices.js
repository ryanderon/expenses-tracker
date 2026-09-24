/**
 * Price client with two sources.
 *
 * Twelve Data's free plan only covers US listings — anything on IDX comes
 * back as "your plan doesn't cover this exchange". So holdings on exchanges
 * Yahoo Finance knows go through `/api/quote` (a thin proxy, see api/quote.js)
 * and need no key; everything else uses Twelve Data with the user's own key,
 * called straight from the browser.
 *
 * Twelve Data quotes are deliberately rationed — see `PRICE_BUDGET`. Symbol
 * search stays on Twelve Data because it's free and needs no key.
 */

const BASE = 'https://api.twelvedata.com';
const YAHOO_PROXY = '/api/quote';
const YAHOO_BATCH = 20;

/**
 * Free plan gives 800 credits/day; we use a tiny slice of it on purpose.
 * A refresh that spends no credits (Yahoo only) can run far more often.
 */
export const PRICE_BUDGET = {
  autoPerDay: 4,
  minGapMs: 6 * 60 * 60 * 1000, // 24h / 4
  freeGapMs: 15 * 60 * 1000,
};

/** Twelve Data exchange → Yahoo ticker suffix (`BBCA` on IDX is `BBCA.JK`). */
const YAHOO_SUFFIXES = {
  IDX: 'JK',
  LSE: 'L',
  TSX: 'TO',
  ASX: 'AX',
  SGX: 'SI',
  XETR: 'DE',
  NSE: 'NS',
  BSE: 'BO',
  JPX: 'T',
  KRX: 'KS',
};

/** The Yahoo ticker for a holding, or null when it has to go to Twelve Data. */
export function yahooSymbolFor(holding) {
  const suffix = YAHOO_SUFFIXES[holding.exchange?.toUpperCase()];
  return suffix ? `${holding.symbol}.${suffix}`.toUpperCase() : null;
}

/** IDX quotes 1 lot = 100 shares. Everything else is per share. */
const LOT_SIZES = { IDX: 100 };

export function lotSizeFor(exchange) {
  return LOT_SIZES[exchange] ?? 1;
}

export function priceKey(exchange, symbol) {
  return `${exchange}:${symbol}`.toUpperCase();
}

class PriceError extends Error {
  constructor(key, cause) {
    super(key);
    this.i18nKey = key;
    this.cause = cause;
  }
}

/**
 * Twelve Data reports failures in the body with HTTP 200 as often as with a
 * real status code, so both paths funnel through here.
 */
function mapError(code, message = '') {
  const text = message.toLowerCase();
  if (code === 401 || text.includes('api key')) return 'prices.errKey';
  if (code === 429 || text.includes('api credits') || text.includes('run out')) {
    return 'prices.errQuota';
  }
  // 403 on Twelve Data means "your plan doesn't include this market".
  if (code === 403 || text.includes('grow') || text.includes('plan')) {
    return 'prices.errPlan';
  }
  if (code === 404 || text.includes('not found')) return 'prices.errSymbol';
  return 'prices.errGeneric';
}

async function getJson(path, params) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new PriceError('prices.errConnection', err);
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new PriceError('prices.errGeneric', err);
  }

  if (!res.ok || body?.status === 'error') {
    throw new PriceError(mapError(body?.code ?? res.status, body?.message));
  }
  return body;
}

/**
 * Symbol lookup. This is reference data and costs no API credits, so the
 * picker can search freely without eating the quote budget.
 */
export async function searchSymbols(query) {
  if (!query || query.trim().length < 2) return [];
  const body = await getJson('symbol_search', { symbol: query.trim(), outputsize: 20 });

  return (body.data || []).map((item) => ({
    symbol: item.symbol,
    name: item.instrument_name,
    exchange: item.exchange,
    micCode: item.mic_code,
    currency: item.currency,
    country: item.country,
    type: item.instrument_type,
  }));
}

function normaliseQuote(raw) {
  const price = Number.parseFloat(raw.close);
  if (!Number.isFinite(price)) return null;
  return {
    price,
    previousClose: Number.parseFloat(raw.previous_close) || null,
    changePct: Number.parseFloat(raw.percent_change) || 0,
    currency: raw.currency,
    isMarketOpen: raw.is_market_open ?? null,
    at: Date.now(),
  };
}

/**
 * Yahoo quotes via the same-origin proxy, keyed by Yahoo ticker. Tickers
 * Yahoo doesn't know are simply absent from the result.
 */
async function fetchYahoo(symbols) {
  const out = {};
  for (let i = 0; i < symbols.length; i += YAHOO_BATCH) {
    const batch = symbols.slice(i, i + YAHOO_BATCH);
    let res;
    try {
      res = await fetch(`${YAHOO_PROXY}?symbols=${batch.map(encodeURIComponent).join(',')}`);
    } catch (err) {
      throw new PriceError('prices.errYahoo', err);
    }
    if (!res.ok) throw new PriceError('prices.errYahoo');

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new PriceError('prices.errYahoo', err);
    }
    Object.assign(out, body.quotes);
  }
  return out;
}

async function yahooQuotes(holdings, quotes, errors) {
  const byTicker = new Map(holdings.map((h) => [yahooSymbolFor(h), h]));

  let found;
  try {
    found = await fetchYahoo([...byTicker.keys()]);
  } catch (err) {
    for (const h of holdings) errors[priceKey(h.exchange, h.symbol)] = err.i18nKey;
    return;
  }

  for (const [ticker, h] of byTicker) {
    const key = priceKey(h.exchange, h.symbol);
    if (found[ticker]) quotes[key] = { ...found[ticker], at: Date.now() };
    else errors[key] = 'prices.errSymbol';
  }
}

/**
 * Twelve Data quotes, grouped by exchange because `BBCA` exists on IDX, CBOE,
 * IEX and BMV as four different instruments — without the exchange filter you
 * get whichever one Twelve Data picks.
 */
async function twelveDataQuotes(apiKey, holdings, quotes, errors) {
  if (!apiKey) {
    for (const h of holdings) errors[priceKey(h.exchange, h.symbol)] = 'prices.errNoKey';
    return;
  }

  const byExchange = new Map();
  for (const h of holdings) {
    const list = byExchange.get(h.exchange) || [];
    list.push(h);
    byExchange.set(h.exchange, list);
  }

  for (const [exchange, group] of byExchange) {
    const symbols = [...new Set(group.map((h) => h.symbol))];
    try {
      const body = await getJson('quote', {
        symbol: symbols.join(','),
        exchange,
        apikey: apiKey,
      });

      // One symbol returns a flat object; several return a keyed map.
      const entries = symbols.length === 1 ? { [symbols[0]]: body } : body;

      for (const symbol of symbols) {
        const raw = entries?.[symbol];
        const key = priceKey(exchange, symbol);

        if (!raw || raw.status === 'error') {
          errors[key] = mapError(raw?.code, raw?.message);
          continue;
        }
        const quote = normaliseQuote(raw);
        if (quote) quotes[key] = quote;
        else errors[key] = 'prices.errSymbol';
      }
    } catch (err) {
      // A whole-group failure (bad key, quota) applies to every symbol in it.
      for (const symbol of symbols) {
        errors[priceKey(exchange, symbol)] = err.i18nKey || 'prices.errGeneric';
      }
      // Quota and key problems will hit every remaining group too.
      if (err.i18nKey === 'prices.errQuota' || err.i18nKey === 'prices.errKey') break;
    }
  }
}

/**
 * Fetches quotes for many holdings at once, each from the source that covers
 * its exchange.
 *
 * Returns `{ quotes, errors }` rather than throwing, so one dead ticker — or
 * one source being down — can't blank out the whole portfolio.
 */
export async function fetchQuotes(apiKey, holdings) {
  const quotes = {};
  const errors = {};

  const viaYahoo = holdings.filter((h) => yahooSymbolFor(h));
  const viaTwelveData = holdings.filter((h) => !yahooSymbolFor(h));

  await Promise.all([
    viaYahoo.length && yahooQuotes(viaYahoo, quotes, errors),
    viaTwelveData.length && twelveDataQuotes(apiKey, viaTwelveData, quotes, errors),
  ]);

  return { quotes, errors };
}

/**
 * FX rates into `base`, used only when holdings span currencies. Yahoo first
 * since it costs nothing; Twelve Data (one credit each) only as a fallback.
 * A currency missing from the result just stays out of the combined total.
 */
export async function fetchRates(apiKey, currencies, base) {
  const rates = {};
  if (currencies.length === 0) return rates;

  try {
    const found = await fetchYahoo(currencies.map((c) => `${c}${base}=X`));
    for (const c of currencies) {
      const price = found[`${c}${base}=X`.toUpperCase()]?.price;
      if (price) rates[c] = price;
    }
  } catch {
    // Fall through to Twelve Data.
  }

  if (!apiKey) return rates;
  for (const c of currencies.filter((x) => !rates[x])) {
    try {
      const body = await getJson('exchange_rate', { symbol: `${c}/${base}`, apikey: apiKey });
      const rate = Number.parseFloat(body.rate);
      if (Number.isFinite(rate)) rates[c] = rate;
    } catch {
      // Leave it out.
    }
  }
  return rates;
}

/** How many Twelve Data credits a refresh of these holdings would cost. */
export function estimateCredits(holdings) {
  return new Set(
    holdings.filter((h) => !yahooSymbolFor(h)).map((h) => priceKey(h.exchange, h.symbol))
  ).size;
}

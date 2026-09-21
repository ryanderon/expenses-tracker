/**
 * Twelve Data price client, called straight from the browser.
 *
 * Same bring-your-own-key shape as the Claude integration: the key lives on
 * this device, requests go direct, and there's no backend in the middle.
 *
 * Quotes are deliberately rationed — see `PRICE_BUDGET`. A portfolio's value
 * doesn't change meaningfully between refreshes, and the free plan's daily
 * credit pool is worth protecting.
 */

const BASE = 'https://api.twelvedata.com';

/** Free plan gives 800 credits/day; we use a tiny slice of it on purpose. */
export const PRICE_BUDGET = {
  autoPerDay: 4,
  minGapMs: 6 * 60 * 60 * 1000, // 24h / 4
};

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
 * Fetches quotes for many holdings at once.
 *
 * Symbols are grouped by exchange because `BBCA` exists on IDX, CBOE, IEX and
 * BMV as four different instruments — without the exchange filter you get
 * whichever one Twelve Data picks.
 *
 * Returns `{ quotes, errors }` rather than throwing, so one dead ticker can't
 * blank out the whole portfolio.
 */
export async function fetchQuotes(apiKey, holdings) {
  if (!apiKey) throw new PriceError('prices.errNoKey');
  if (holdings.length === 0) return { quotes: {}, errors: {} };

  const byExchange = new Map();
  for (const h of holdings) {
    const list = byExchange.get(h.exchange) || [];
    list.push(h);
    byExchange.set(h.exchange, list);
  }

  const quotes = {};
  const errors = {};

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

  return { quotes, errors };
}

/**
 * FX rate, used only when holdings span currencies. One extra credit per
 * foreign currency per refresh.
 */
export async function fetchRate(apiKey, from, to) {
  if (from === to) return 1;
  const body = await getJson('exchange_rate', { symbol: `${from}/${to}`, apikey: apiKey });
  const rate = Number.parseFloat(body.rate);
  return Number.isFinite(rate) ? rate : null;
}

/** How many credits a refresh of these holdings would cost. */
export function estimateCredits(holdings, baseCurrency = 'IDR') {
  const symbols = new Set(holdings.map((h) => priceKey(h.exchange, h.symbol)));
  const currencies = new Set(
    holdings.map((h) => h.currency).filter((c) => c && c !== baseCurrency)
  );
  return symbols.size + currencies.size;
}

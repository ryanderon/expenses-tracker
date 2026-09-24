/**
 * Same-origin proxy for Yahoo Finance quotes: GET /api/quote?symbols=BBCA.JK,USDIDR=X
 *
 * Twelve Data's free plan only covers US listings, so IDX and other non-US
 * holdings are priced from Yahoo instead. Yahoo sends no CORS headers and
 * rejects most browser-shaped requests, so the browser can't call it directly
 * — this handler makes the call with a minimal header set and returns only
 * the fields the app needs.
 *
 * Runs as a Vercel function in production and as Vite middleware in dev
 * (see vite.config.js), so it sticks to plain Node req/res.
 */

const UPSTREAM = 'https://query1.finance.yahoo.com/v7/finance/spark';
const SYMBOL = /^[A-Z0-9.=^-]{1,24}$/;
export const MAX_SYMBOLS = 20;

function send(res, status, data, maxAge = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Cache-Control',
    maxAge ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` : 'no-store'
  );
  res.end(JSON.stringify(data));
}

function normalise(meta, nowSec) {
  const price = meta.regularMarketPrice;
  if (!Number.isFinite(price)) return null;

  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const changePct = Number.isFinite(meta.regularMarketChangePercent)
    ? meta.regularMarketChangePercent
    : previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
  const session = meta.currentTradingPeriod?.regular;

  return {
    price,
    previousClose,
    changePct,
    currency: meta.currency,
    isMarketOpen: session ? nowSec >= session.start && nowSec < session.end : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });

  const params = new URL(req.url, 'http://localhost').searchParams;
  const symbols = [...new Set(
    (params.get('symbols') || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => SYMBOL.test(s))
  )].slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) return send(res, 400, { error: 'symbols required' });

  let upstream;
  try {
    upstream = await fetch(
      `${UPSTREAM}?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1d&interval=1d`,
      // A bare UA gets through; a full browser UA or an Origin header gets 429'd.
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    );
  } catch {
    return send(res, 502, { error: 'upstream unreachable' });
  }

  // Spark answers 404 only when *none* of the symbols exist.
  if (upstream.status === 404) return send(res, 200, { quotes: {} }, 60);
  if (!upstream.ok) {
    return send(res, upstream.status === 429 ? 429 : 502, { error: `upstream ${upstream.status}` });
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    return send(res, 502, { error: 'bad upstream response' });
  }

  const nowSec = Date.now() / 1000;
  const quotes = {};
  for (const item of body?.spark?.result || []) {
    const meta = item.response?.[0]?.meta;
    const quote = meta && normalise(meta, nowSec);
    if (quote) quotes[item.symbol.toUpperCase()] = quote;
  }

  return send(res, 200, { quotes }, 60);
}

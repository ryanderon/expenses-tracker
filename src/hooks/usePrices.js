import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@/store/useStore';
import {
  fetchQuotes, fetchRates, estimateCredits, yahooSymbolFor, PRICE_BUDGET,
} from '@/lib/prices';
import { foreignCurrencies } from '@/lib/portfolio';

/**
 * Keeps quotes fresh without burning the free plan's credits.
 *
 * When a refresh spends Twelve Data credits, automatic refreshes are capped at
 * four a day and spaced at least six hours apart. When it doesn't (every
 * holding is priced from Yahoo), it can refresh every 15 minutes. The cache
 * survives reloads either way, so reopening the app costs nothing.
 *
 * A manual refresh is always allowed: it's an explicit request, and a handful
 * of extra calls is nothing against an 800/day pool.
 */
export default function usePrices() {
  const holdings = useStore((s) => s.holdings);
  const priceMeta = useStore((s) => s.priceMeta);
  const setQuotes = useStore((s) => s.setQuotes);
  const countAutoFetch = useStore((s) => s.countAutoFetch);
  const setPriceSettings = useStore((s) => s.setPriceSettings);

  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const hasKey = !!priceMeta.apiKey;
  // Holdings only Twelve Data can price — these are the ones that need a key.
  const needsKey = holdings.some((h) => !yahooSymbolFor(h));
  const creditsPerRefresh = hasKey ? estimateCredits(holdings) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const usedToday = priceMeta.dayKey === today ? priceMeta.autoFetchesToday : 0;
  const remainingToday = Math.max(PRICE_BUDGET.autoPerDay - usedToday, 0);

  const sinceLast = priceMeta.lastAutoFetchAt ? Date.now() - priceMeta.lastAutoFetchAt : Infinity;
  const canAutoRefresh =
    holdings.length > 0 &&
    (hasKey || holdings.some((h) => yahooSymbolFor(h))) &&
    (creditsPerRefresh > 0
      ? remainingToday > 0 && sinceLast >= PRICE_BUDGET.minGapMs
      : sinceLast >= PRICE_BUDGET.freeGapMs);

  const refresh = useCallback(async ({ auto = false } = {}) => {
    const state = useStore.getState();
    const list = state.holdings;
    const apiKey = state.priceMeta.apiKey;

    if (inFlight.current || list.length === 0) return;

    inFlight.current = true;
    setStatus('loading');
    setError(null);

    try {
      const { quotes, errors } = await fetchQuotes(apiKey, list);

      // Only fetch FX for currencies actually held.
      const base = state.priceMeta.baseCurrency || 'IDR';
      const rates = await fetchRates(apiKey, foreignCurrencies(list, base), base);

      setQuotes(quotes, rates, errors);
      if (auto) {
        // Only credit-spending refreshes count against the daily cap.
        if (apiKey && estimateCredits(list) > 0) countAutoFetch();
        else setPriceSettings({ lastAutoFetchAt: Date.now() });
      }

      const firstError = Object.values(errors)[0];
      if (Object.keys(quotes).length === 0 && firstError) {
        setError(firstError);
        setStatus('error');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      setError(err.i18nKey || 'prices.errGeneric');
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, [setQuotes, countAutoFetch, setPriceSettings]);

  // One automatic attempt per mount, only when the budget allows it.
  useEffect(() => {
    if (!canAutoRefresh) return;
    refresh({ auto: true });
    // `canAutoRefresh` flips to false as soon as `lastAutoFetchAt` is stamped,
    // so this can't loop.
  }, [canAutoRefresh, refresh]);

  return {
    status,
    error,
    refresh: () => refresh({ auto: false }),
    hasKey,
    needsKey,
    usedToday,
    remainingToday,
    perDay: PRICE_BUDGET.autoPerDay,
    lastFetchAt: priceMeta.lastFetchAt,
    quoteErrors: priceMeta.errors || {},
    creditsPerRefresh,
  };
}

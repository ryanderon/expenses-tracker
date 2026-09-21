import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@/store/useStore';
import {
  fetchQuotes, fetchRate, estimateCredits, PRICE_BUDGET,
} from '@/lib/prices';
import { foreignCurrencies } from '@/lib/portfolio';

/**
 * Keeps quotes fresh without burning the free plan's credits.
 *
 * Automatic refreshes are capped at four a day and spaced at least six hours
 * apart. A portfolio's value simply doesn't move enough between those points
 * to justify more, and the cache survives reloads — so opening the app ten
 * times in an afternoon costs nothing.
 *
 * A manual refresh is always allowed: it's an explicit request, and a handful
 * of extra calls is nothing against an 800/day pool.
 */
export default function usePrices() {
  const holdings = useStore((s) => s.holdings);
  const priceMeta = useStore((s) => s.priceMeta);
  const setQuotes = useStore((s) => s.setQuotes);
  const countAutoFetch = useStore((s) => s.countAutoFetch);

  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const today = new Date().toISOString().slice(0, 10);
  const usedToday = priceMeta.dayKey === today ? priceMeta.autoFetchesToday : 0;
  const remainingToday = Math.max(PRICE_BUDGET.autoPerDay - usedToday, 0);

  const sinceLast = priceMeta.lastAutoFetchAt ? Date.now() - priceMeta.lastAutoFetchAt : Infinity;
  const canAutoRefresh =
    holdings.length > 0 &&
    !!priceMeta.apiKey &&
    remainingToday > 0 &&
    sinceLast >= PRICE_BUDGET.minGapMs;

  const refresh = useCallback(async ({ auto = false } = {}) => {
    const state = useStore.getState();
    const list = state.holdings;
    const apiKey = state.priceMeta.apiKey;

    if (inFlight.current || list.length === 0) return;
    if (!apiKey) {
      setError('prices.errNoKey');
      setStatus('error');
      return;
    }

    inFlight.current = true;
    setStatus('loading');
    setError(null);

    try {
      const { quotes, errors } = await fetchQuotes(apiKey, list);

      // Only pay for FX on currencies actually held.
      const base = state.priceMeta.baseCurrency || 'IDR';
      const rates = {};
      for (const currency of foreignCurrencies(list, base)) {
        try {
          const rate = await fetchRate(apiKey, currency, base);
          if (rate) rates[currency] = rate;
        } catch {
          // A missing rate just leaves that holding out of the combined total.
        }
      }

      setQuotes(quotes, rates, errors);
      if (auto) countAutoFetch();

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
  }, [setQuotes, countAutoFetch]);

  // One automatic attempt per mount, only when the budget allows it.
  useEffect(() => {
    if (!canAutoRefresh) return;
    refresh({ auto: true });
    // `canAutoRefresh` flips to false as soon as the fetch is counted, so this
    // can't loop.
  }, [canAutoRefresh, refresh]);

  return {
    status,
    error,
    refresh: () => refresh({ auto: false }),
    hasKey: !!priceMeta.apiKey,
    usedToday,
    remainingToday,
    perDay: PRICE_BUDGET.autoPerDay,
    lastFetchAt: priceMeta.lastFetchAt,
    quoteErrors: priceMeta.errors || {},
    creditsPerRefresh: estimateCredits(holdings, priceMeta.baseCurrency || 'IDR'),
  };
}

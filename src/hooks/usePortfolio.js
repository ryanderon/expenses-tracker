import { useMemo } from 'react';
import useStore from '@/store/useStore';
import { buildPortfolio } from '@/lib/portfolio';

/** The portfolio valued from cached prices. Reads only — never fetches. */
export default function usePortfolio() {
  const holdings = useStore((s) => s.holdings);
  const priceCache = useStore((s) => s.priceCache);
  const priceRates = useStore((s) => s.priceRates);
  const baseCurrency = useStore((s) => s.priceMeta.baseCurrency) || 'IDR';

  return useMemo(
    () => buildPortfolio(holdings, priceCache, priceRates, baseCurrency),
    [holdings, priceCache, priceRates, baseCurrency]
  );
}

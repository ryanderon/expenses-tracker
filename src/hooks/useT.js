import { useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';
import useStore from '@/store/useStore';
import { translate, DEFAULT_LOCALE } from '@/lib/i18n';

const DATE_LOCALES = { id: idLocale, en: enUS };

/**
 * Translation function bound to the active locale.
 *
 * Reading locale from the store means a language change re-renders every
 * subscribed component for free — no context provider needed.
 */
export function useT() {
  const locale = useStore((s) => s.locale) || DEFAULT_LOCALE;
  return useMemo(() => (key, vars) => translate(locale, key, vars), [locale]);
}

function useLocale() {
  return useStore((s) => s.locale) || DEFAULT_LOCALE;
}

/** Locale-aware date helpers. Currency stays IDR regardless of language. */
export function useDateFormat() {
  const locale = useLocale();

  return useMemo(() => {
    const dateLocale = DATE_LOCALES[locale] || DATE_LOCALES[DEFAULT_LOCALE];
    return {
      dateLocale,
      /** e.g. "21 Agu 2026" / "21 Aug 2026" */
      short: (value) => format(new Date(value), 'd MMM yyyy', { locale: dateLocale }),
      /** e.g. "Agustus 2026" / "August 2026" */
      month: (value) => format(new Date(value), 'MMMM yyyy', { locale: dateLocale }),
      /** e.g. "Agu 2026" / "Aug 2026" */
      monthShort: (value) => format(new Date(value), 'MMM yyyy', { locale: dateLocale }),
      /** e.g. "Kamis, 21 Agustus" */
      dayLong: (value) => format(new Date(value), 'EEEE, d MMMM', { locale: dateLocale }),
      distance: (value) => formatDistanceToNow(new Date(value), { locale: dateLocale }),
    };
  }, [locale]);
}

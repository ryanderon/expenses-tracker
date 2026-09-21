import id from '@/locales/id';
import en from '@/locales/en';

/**
 * Small hand-rolled i18n layer.
 *
 * An off-the-shelf library would bring a provider, a plugin system, and a
 * loader for a use case that is two static locale objects and dot-path lookup.
 * This is the whole feature in ~60 lines.
 */

const LOCALES = { id, en };

export const LOCALE_OPTIONS = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'id', label: 'Bahasa Indonesia', short: 'ID' },
];

export const DEFAULT_LOCALE = 'en';

function lookup(tree, path) {
  let node = tree;
  for (const part of path) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Fills `{name}` placeholders. Values are inserted verbatim — every caller
 * passes already-formatted strings or numbers, never markup.
 */
function interpolate(template, vars) {
  if (!vars) return template;
  return template.replaceAll(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match
  );
}

/**
 * Resolves `key` for `locale`, falling back to English and then to the key
 * itself. A missing string should look wrong in development without blanking
 * the UI in production.
 */
export function translate(locale, key, vars) {
  const path = key.split('.');
  const value =
    lookup(LOCALES[locale], path) ??
    lookup(LOCALES[DEFAULT_LOCALE], path);

  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

/**
 * Built-in categories carry a `labelKey`; user-created ones only have the
 * label the user typed, which is never translated.
 */
export function categoryLabel(category, t) {
  if (!category) return '';
  return category.labelKey ? t(category.labelKey) : category.label;
}

/**
 * Default subcategory names are stored on transactions as English strings, so
 * they can't be renamed without rewriting user data. Translate them for
 * display only and pass anything unrecognised straight through.
 */
export function subcategoryLabel(name, t) {
  if (!name) return '';
  const key = `subcategories.${name}`;
  const translated = t(key);
  // `translate` echoes the key back when there's no entry — that's the signal
  // this is a user-created name, so show it as typed.
  return translated === key ? name : translated;
}

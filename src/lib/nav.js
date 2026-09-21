/**
 * Navigation, ordered exactly as the redesign's sidebar.
 *
 * Icons are Material Symbols names, matching the design. Two entries the
 * design predates — Today and Portfolio — are slotted next to their nearest
 * relatives rather than dropped.
 */
export const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { to: '/today', labelKey: 'nav.today', icon: 'wb_sunny' },
  { to: '/transactions', labelKey: 'nav.transactions', icon: 'swap_horiz' },
  { to: '/insights', labelKey: 'nav.insights', icon: 'auto_awesome' },
  { to: '/analytics', labelKey: 'nav.analytics', icon: 'donut_large' },
  { to: '/budget', labelKey: 'nav.budget', icon: 'track_changes' },
  { to: '/reports', labelKey: 'nav.reports', icon: 'description' },
  { to: '/portfolio', labelKey: 'nav.portfolio', icon: 'trending_up' },
  { to: '/accounts', labelKey: 'nav.accounts', icon: 'account_balance_wallet' },
  { to: '/categories', labelKey: 'nav.categories', icon: 'sell' },
  { to: '/split-bill', labelKey: 'nav.splitBill', icon: 'content_cut' },
  { to: '/settings', labelKey: 'nav.settings', icon: 'settings' },
];

/**
 * The design is desktop-only. On a phone the full list lives behind the menu
 * button; these four plus that button make up the bottom bar.
 */
export const MOBILE_NAV = NAV_ITEMS.filter((i) =>
  ['/', '/transactions', '/budget', '/insights'].includes(i.to)
);

/** Page subtitles, as written in the design's `titles` map. */
export const NAV_SUBTITLES = {
  '/': 'dashboard.subtitle',
  '/today': 'today.subtitle',
  '/transactions': 'transactions.subtitle',
  '/insights': 'insights.subtitle',
  '/analytics': 'analytics.subtitle',
  '/budget': 'budget.subtitle',
  '/reports': 'reports.subtitle',
  '/portfolio': 'portfolio.subtitle',
  '/accounts': 'accounts.subtitle',
  '/categories': 'categories.subtitle',
  '/split-bill': 'splitBill.subtitle',
  '/settings': 'settings.subtitle',
};

export function navItemForPath(pathname) {
  return NAV_ITEMS.find((item) => item.to === pathname);
}

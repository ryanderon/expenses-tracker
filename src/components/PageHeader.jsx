import { useLocation } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import { navItemForPath, NAV_SUBTITLES } from '@/lib/nav';

/**
 * Title block at the top of every page — 26px bold heading with a muted
 * subtitle, and page-specific actions on the right, as in the design.
 */
export default function PageHeader({ actions, title, subtitle }) {
  const t = useT();
  const { pathname } = useLocation();
  const item = navItemForPath(pathname);
  const subtitleKey = NAV_SUBTITLES[pathname];

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
          {title ?? (item ? t(item.labelKey) : 'Penny')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ?? (subtitleKey ? t(subtitleKey) : '')}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

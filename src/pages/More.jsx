import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/hooks/useT';
import { SECONDARY_NAV } from '@/lib/nav';

/**
 * Destination for the "More" tab. The secondary surfaces live here so the
 * bottom bar can stay at five items without hiding anything.
 */
export default function More() {
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold">{t('nav.moreTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('nav.moreSubtitle')}</p>
      </div>

      <Card data-tour="more-list">
        <CardContent className="p-2">
          <div className="divide-y divide-border/60">
            {SECONDARY_NAV.map(({ to, labelKey, descriptionKey, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="size-9 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t(labelKey)}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {t(descriptionKey)}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

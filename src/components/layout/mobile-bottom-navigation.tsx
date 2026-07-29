'use client';

import { useTranslations } from 'next-intl';
import { Building2, LayoutDashboard, MapPin, Menu, ScrollText } from 'lucide-react';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { hasPermission, type PermissionKey } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import type { AuthContext } from '@/types/database';

const primaryItems: Array<{
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: 'dashboard' | 'locations' | 'units' | 'contracts';
  permission: PermissionKey | null;
}> = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', permission: null },
  { href: '/locations', icon: MapPin, labelKey: 'locations', permission: 'locations.view' },
  { href: '/units', icon: Building2, labelKey: 'units', permission: 'units.view' },
  { href: '/contracts', icon: ScrollText, labelKey: 'contracts', permission: 'contracts.view' },
];

export function MobileBottomNavigation({
  auth,
  onOpenMenu,
}: {
  auth: AuthContext;
  onOpenMenu: () => void;
}) {
  const t = useTranslations('common');
  const tNav = useTranslations('common.nav');
  const pathname = usePathname();
  const visibleItems = primaryItems.filter(
    (item) => item.permission === null || hasPermission(auth, item.permission),
  );

  return (
    <nav
      aria-label={t('mobileNavigation')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-flow-col auto-cols-fr px-2">
        {visibleItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.6875rem] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                isActive ? 'text-primary' : 'text-muted-foreground active:bg-accent',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="max-w-full truncate">{tNav(labelKey)}</span>
              {isActive && (
                <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t('navOpen')}
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="max-w-full truncate">{tNav('more')}</span>
        </button>
      </div>
    </nav>
  );
}

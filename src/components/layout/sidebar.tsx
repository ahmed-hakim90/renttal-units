'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n/navigation';
import {
  LayoutDashboard, MapPin, Building2, Calendar, FileText,
  CreditCard, CheckCircle, History, BarChart3, Upload, Users, Settings,
  PanelLeftClose, PanelLeftOpen, X, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo, LogoMark } from '@/components/brand/logo';
import { LanguageSwitcher } from './language-switcher';
import { signOut } from '@/lib/actions/auth';
import { useCurrentLocale } from '@/lib/i18n/hooks';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/locations', icon: MapPin, labelKey: 'locations' as const },
  { href: '/units', icon: Building2, labelKey: 'units' as const },
  { href: '/due-this-month', icon: Calendar, labelKey: 'dueThisMonth' as const },
  { href: '/invoices', icon: FileText, labelKey: 'invoices' as const },
  { href: '/partial-payments', icon: CreditCard, labelKey: 'partialPayments' as const },
  { href: '/fully-paid', icon: CheckCircle, labelKey: 'fullyPaid' as const },
  { href: '/payments', icon: History, labelKey: 'payments' as const },
  { href: '/reports/debt-aging', icon: BarChart3, labelKey: 'debtAging' as const },
  { href: '/import', icon: Upload, labelKey: 'import' as const },
  { href: '/users', icon: Users, labelKey: 'users' as const },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const },
];

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
}) {
  const tNav = useTranslations('common.nav');
  const t = useTranslations('common');
  const pathname = usePathname();
  const locale = useCurrentLocale();

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-border bg-card transition-transform duration-200 lg:z-40 lg:translate-x-0',
          !mobileOpen && '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0',
          collapsed && 'lg:w-20'
        )}
      >
      <div className={cn('flex h-16 items-center justify-between border-b border-border px-4', collapsed && 'lg:justify-center')}>
        {collapsed ? (
          <LogoMark size="sm" className="hidden lg:flex" />
        ) : (
          <Logo size="sm" className="min-w-0" />
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" type="button" className="lg:hidden" onClick={onCloseMobile}>
            <X className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" type="button" className="hidden lg:inline-flex" onClick={onToggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              title={tNav(labelKey)}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'lg:justify-center lg:px-2',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && 'lg:hidden')}>{tNav(labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <div
        className={cn(
          'space-y-3 border-t border-border p-4',
          collapsed && 'lg:flex lg:flex-col lg:items-center lg:space-y-2 lg:p-2'
        )}
      >
        <LanguageSwitcher collapsed={collapsed} />
        <form action={signOut.bind(null, locale)} className={cn(collapsed && 'lg:w-full')}>
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            title={t('logout')}
            className={cn(
              'w-full justify-start gap-3 text-muted-foreground hover:text-foreground',
              collapsed && 'lg:justify-center lg:px-2'
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>{t('logout')}</span>
          </Button>
        </form>
      </div>
    </aside>
    </>
  );
}

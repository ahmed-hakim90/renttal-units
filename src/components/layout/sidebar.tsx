'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n/navigation';
import {
  LayoutDashboard, MapPin, Building2, Calendar, FileText,
  CreditCard, CheckCircle, History, BarChart3, Upload, Users, UserRound, Settings,
  PanelLeftClose, PanelLeftOpen, X, LogOut, ScrollText, Flag, Shield, Files,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo, LogoMark } from '@/components/brand/logo';
import { signOut } from '@/lib/actions/auth';
import { useCurrentLocale } from '@/lib/i18n/hooks';
import { hasPermission, NAV_PERMISSIONS, type PermissionKey } from '@/lib/auth/permissions';
import type { FeatureFlagKey, FeatureFlags } from '@/lib/features';
import type { AuthContext } from '@/types/database';

const navItems: Array<{
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: 'dashboard' | 'locations' | 'units' | 'tenants' | 'contracts' | 'documents' | 'dueThisMonth' | 'invoices' | 'partialPayments' | 'fullyPaid' | 'payments' | 'debtAging' | 'locationStatement' | 'import' | 'users' | 'roles' | 'auditLogs' | 'featureFlags' | 'settings';
  flagKey?: FeatureFlagKey;
}> = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/locations', icon: MapPin, labelKey: 'locations' },
  { href: '/units', icon: Building2, labelKey: 'units' },
  { href: '/tenants', icon: UserRound, labelKey: 'tenants' },
  { href: '/contracts', icon: ScrollText, labelKey: 'contracts' },
  { href: '/documents', icon: Files, labelKey: 'documents' },
  { href: '/due-this-month', icon: Calendar, labelKey: 'dueThisMonth' },
  { href: '/invoices', icon: FileText, labelKey: 'invoices' },
  { href: '/partial-payments', icon: CreditCard, labelKey: 'partialPayments', flagKey: 'invoices_payment_status_pages' },
  { href: '/fully-paid', icon: CheckCircle, labelKey: 'fullyPaid', flagKey: 'invoices_payment_status_pages' },
  { href: '/payments', icon: History, labelKey: 'payments' },
  { href: '/reports/debt-aging', icon: BarChart3, labelKey: 'debtAging', flagKey: 'reports_operational' },
  { href: '/reports/location-statement', icon: BarChart3, labelKey: 'locationStatement', flagKey: 'reports_operational' },
  { href: '/import', icon: Upload, labelKey: 'import' },
  { href: '/users', icon: Users, labelKey: 'users' },
  { href: '/roles', icon: Shield, labelKey: 'roles' },
  { href: '/audit-logs', icon: History, labelKey: 'auditLogs' },
  { href: '/feature-flags', icon: Flag, labelKey: 'featureFlags' },
  { href: '/settings', icon: Settings, labelKey: 'settings' },
];

export type InvoiceNavigationCounts = {
  dueNow: number;
  awaitingPayment: number;
  partialPayments: number;
  fullyPaid: number;
};

function getInvoiceNavigationCount(href: string, counts: InvoiceNavigationCounts): number | null {
  switch (href) {
    case '/due-this-month':
      return counts.dueNow;
    case '/invoices':
      return counts.awaitingPayment;
    case '/partial-payments':
      return counts.partialPayments;
    case '/fully-paid':
      return counts.fullyPaid;
    default:
      return null;
  }
}

function canSeeNavItem(auth: AuthContext, href: string, featureFlags: FeatureFlags) {
  const required = NAV_PERMISSIONS[href];
  if (required && !hasPermission(auth, required as PermissionKey)) return false;

  if (href === '/import') {
    return featureFlags.odoo_import_center
      || featureFlags.import_excel_contracts
      || featureFlags.master_data_mutations;
  }

  const item = navItems.find((navItem) => navItem.href === href);
  if (item?.flagKey) return featureFlags[item.flagKey];
  return true;
}

export function Sidebar({
  auth,
  invoiceNavigationCounts,
  featureFlags,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
}: {
  auth: AuthContext;
  invoiceNavigationCounts: InvoiceNavigationCounts;
  featureFlags: FeatureFlags;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
}) {
  const tNav = useTranslations('common.nav');
  const t = useTranslations('common');
  const format = useFormatter();
  const pathname = usePathname();
  const locale = useCurrentLocale();
  const visibleNavItems = navItems.filter((item) => canSeeNavItem(auth, item.href, featureFlags));

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label={t('navClose')}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-border bg-card transition-transform duration-200 lg:z-40 lg:translate-x-0',
          !mobileOpen && 'invisible -translate-x-full rtl:translate-x-full lg:visible lg:translate-x-0 rtl:lg:translate-x-0',
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
          <Button variant="ghost" size="icon-sm" type="button" className="lg:hidden" onClick={onCloseMobile} aria-label={t('navClose')}>
            <X />
          </Button>
          <Button variant="ghost" size="icon-sm" type="button" className="hidden lg:inline-flex" onClick={onToggleCollapsed} aria-label={t(collapsed ? 'sidebarExpand' : 'sidebarCollapse')}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleNavItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const invoiceCount = getInvoiceNavigationCount(href, invoiceNavigationCounts);
          return (
            <Link
              key={href}
              href={href}
              title={tNav(labelKey)}
              onClick={onCloseMobile}
              className={cn(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'lg:justify-center lg:px-2',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {isActive && (
                <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-primary" aria-hidden="true" />
              )}
              <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
              <span className={cn(collapsed && 'lg:hidden')}>{tNav(labelKey)}</span>
              {invoiceCount != null && invoiceCount > 0 ? (
                <span
                  aria-label={tNav('invoiceCount', {
                    count: format.number(invoiceCount),
                    page: tNav(labelKey),
                  })}
                  className={cn(
                    'ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold leading-none text-white',
                    collapsed && 'lg:absolute lg:end-1 lg:top-1 lg:ms-0 lg:h-4 lg:min-w-4 lg:px-1 lg:text-[10px]'
                  )}
                >
                  {format.number(invoiceCount)}
                </span>
              ) : null}
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
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>{t('logout')}</span>
          </Button>
        </form>
      </div>
    </aside>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { MobileBottomNavigation } from '@/components/layout/mobile-bottom-navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { SessionNotifications } from '@/components/notifications/session-notifications';
import { cn } from '@/lib/utils';
import type { FeatureFlags } from '@/lib/features';
import type { ActionableNotification } from '@/lib/notifications/guards';
import type { AuthContext } from '@/types/database';
import type { InvoiceNavigationCounts } from '@/components/layout/sidebar';

export function DashboardShell({
  auth,
  invoiceNavigationCounts,
  featureFlags,
  headerNotifications,
  sessionNotifications,
  locale,
  children,
}: {
  auth: AuthContext;
  invoiceNavigationCounts: InvoiceNavigationCounts;
  featureFlags: FeatureFlags;
  headerNotifications: ActionableNotification[];
  sessionNotifications: ActionableNotification[];
  locale: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const originalOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <SessionNotifications notifications={sessionNotifications} locale={locale} />
      <Sidebar
        auth={auth}
        invoiceNavigationCounts={invoiceNavigationCounts}
        featureFlags={featureFlags}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      <div className={cn('min-w-0 transition-[padding] duration-200 lg:ps-64', collapsed && 'lg:ps-20')}>
        <Header auth={auth} notifications={headerNotifications} locale={locale} />
        <main className="dashboard-content w-full px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:p-8">
          {children}
        </main>
      </div>
      <MobileBottomNavigation auth={auth} onOpenMenu={() => setMobileOpen(true)} />
    </div>
  );
}

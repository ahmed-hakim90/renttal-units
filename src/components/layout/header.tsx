'use client';

import { useTranslations } from 'next-intl';
import { InstallAppHint } from '@/components/pwa/install-app-button';
import { LogoMark } from '@/components/brand/logo';
import { GlobalSearch } from './global-search';
import { LanguageSwitcher } from './language-switcher';
import { hasAnyPermission } from '@/lib/auth/permissions';
import type { AuthContext } from '@/types/database';
import { Eye } from 'lucide-react';

export function Header({ auth }: { auth: AuthContext }) {
  const t = useTranslations('common');
  const isViewOnly = !hasAnyPermission(auth, [
    'locations.create', 'locations.update', 'locations.delete',
    'units.create', 'units.update', 'units.delete',
    'contracts.create', 'contracts.update', 'contracts.delete',
    'invoices.create', 'invoices.update', 'invoices.delete',
    'payments.record',
    'imports.manage', 'odoo.manage',
    'users.manage', 'roles.manage',
    'settings.manage', 'feature_flags.manage',
  ]);

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/90 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-sm backdrop-blur-xl sm:px-6 lg:pt-3">
      <div className="flex items-center gap-3">
        <LogoMark size="sm" className="lg:hidden" />
        {isViewOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-100">
            <Eye className="h-3.5 w-3.5" />
            {t('viewOnly')}
          </span>
        )}
      </div>
      <GlobalSearch />
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <InstallAppHint />
      </div>
    </header>
  );
}

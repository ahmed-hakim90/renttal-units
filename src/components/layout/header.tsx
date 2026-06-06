'use client';

import { useTranslations } from 'next-intl';
import { InstallAppHint } from '@/components/pwa/install-app-button';
import { GlobalSearch } from './global-search';
import { Button } from '@/components/ui/button';
import type { AuthContext } from '@/types/database';
import { Eye, Menu } from 'lucide-react';

export function Header({ auth, onMenuClick }: { auth: AuthContext; onMenuClick: () => void }) {
  const t = useTranslations('common');

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" type="button" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="h-4 w-4" />
        </Button>
        {!auth.isAdminEditor && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <Eye className="h-3 w-3" />
            {t('viewOnly')}
          </span>
        )}
      </div>
      <GlobalSearch />
      <div className="flex items-center gap-4">
        <InstallAppHint />
      </div>
    </header>
  );
}

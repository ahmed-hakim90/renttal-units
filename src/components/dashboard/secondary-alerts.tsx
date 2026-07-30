import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { DashboardOdooHealth } from '@/types/database';
import { FilePenLine, CloudAlert } from 'lucide-react';

export async function DashboardSecondaryAlerts({
  draftContracts,
  odooHealth,
  locale,
  canViewContracts,
  canManageOdoo,
}: {
  draftContracts: number;
  odooHealth: DashboardOdooHealth | null;
  locale: string;
  canViewContracts: boolean;
  canManageOdoo: boolean;
}) {
  const t = await getTranslations('dashboard');
  const loc = locale as Locale;
  const odooIssueCount = odooHealth
    ? odooHealth.failedCount + odooHealth.needsReviewCount
    : 0;
  const showDrafts = draftContracts > 0 && canViewContracts;
  const showOdoo = Boolean(canManageOdoo && odooHealth && odooIssueCount > 0);

  if (!showDrafts && !showOdoo) return null;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {showDrafts && (
        <Link
          href="/contracts"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-shadow hover:shadow-sm"
        >
          <div className="icon-tile bg-amber-100 text-amber-800">
            <FilePenLine className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950">{t('draftContractsTitle')}</p>
            <p className="mt-0.5 text-sm text-amber-900/80">
              {t('draftContractsDescription', { count: formatNumber(draftContracts, loc) })}
            </p>
          </div>
        </Link>
      )}

      {showOdoo && odooHealth && (
        <Link
          href="/invoices"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 transition-shadow hover:shadow-sm"
        >
          <div className="icon-tile bg-red-100 text-red-800">
            <CloudAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-950">{t('odooHealthTitle')}</p>
            <p className="mt-0.5 text-sm text-red-900/80">
              {t('odooHealthDescription', {
                failed: formatNumber(odooHealth.failedCount, loc),
                needsReview: formatNumber(odooHealth.needsReviewCount, loc),
              })}
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}

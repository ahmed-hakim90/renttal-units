import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { buttonStyles } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { DashboardDebtAgingSummary } from '@/types/database';
import { AlertTriangle } from 'lucide-react';

const BUCKETS = [
  { key: 'days1to30' as const, reportKey: 'days1to30' },
  { key: 'days31to60' as const, reportKey: 'days31to60' },
  { key: 'days61to90' as const, reportKey: 'days61to90' },
  { key: 'over90' as const, reportKey: 'over90' },
];

export async function DebtAgingSummary({
  summary,
  locale,
  canNavigate = true,
}: {
  summary: DashboardDebtAgingSummary;
  locale: string;
  canNavigate?: boolean;
}) {
  const t = await getTranslations('dashboard');
  const tr = await getTranslations('reports');
  const loc = locale as Locale;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="icon-tile bg-red-50 text-red-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">{t('debtAgingTitle')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('totalOutstanding')}:{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(summary.totalOutstanding, loc)}
              </span>
            </p>
          </div>
        </div>
        {canNavigate && (
          <Link href="/reports/debt-aging" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
            {t('viewDebtAging')}
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BUCKETS.map(({ key, reportKey }) => {
          const bucket = summary[key];
          return (
            <Card key={key} className="p-4">
              <CardDescription>{tr(reportKey)}</CardDescription>
              <CardTitle className="mt-1 text-xl tabular-nums tracking-tight">
                {formatCurrency(bucket.totalAmount, loc)}
              </CardTitle>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {t('agingInvoiceCount', { count: formatNumber(bucket.count, loc) })}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

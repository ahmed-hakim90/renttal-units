import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { DashboardPortfolioSummary, DashboardStats } from '@/types/database';
import { CalendarClock, CalendarDays, CalendarRange, ScrollText, Wallet } from 'lucide-react';

export async function PortfolioSummary({
  summary,
  locale,
  canViewContracts = false,
  canViewInvoices = false,
  dueBuckets,
}: {
  summary: DashboardPortfolioSummary;
  locale: string;
  canViewContracts?: boolean;
  canViewInvoices?: boolean;
  dueBuckets: DashboardStats['dueBuckets'];
}) {
  const t = await getTranslations('dashboard');
  const loc = locale as Locale;

  const cards = [
    ...(canViewInvoices ? dueBuckets.map((bucket, index) => ({
      key: `due-${bucket.fromDay}-${bucket.toDay}`,
      label: index === 0
        ? t('dueWithinDays', { days: bucket.toDay })
        : t('dueBetweenDays', { from: bucket.fromDay, to: bucket.toDay }),
      value: formatNumber(bucket.count, loc),
      href: '/due-this-month' as const,
      icon: index === 0 ? CalendarDays : CalendarRange,
      iconColor: index === 0
        ? 'bg-sky-50 text-sky-700'
        : index === 1
          ? 'bg-amber-50 text-amber-700'
          : 'bg-orange-50 text-orange-700',
      canOpen: true,
    })) : []),
    {
      key: 'activeContractsLabel',
      label: t('activeContractsLabel'),
      value: formatNumber(summary.activeContracts, loc),
      href: '/contracts' as const,
      icon: ScrollText,
      iconColor: 'bg-indigo-50 text-indigo-700',
      canOpen: canViewContracts,
    },
    ...(canViewContracts ? [{
      key: 'expiringContracts',
      label: t('expiringContracts'),
      value: formatNumber(summary.expiringContracts, loc),
      href: '/contracts' as const,
      icon: CalendarClock,
      iconColor: 'bg-rose-50 text-rose-700',
      canOpen: true,
    }] : []),
    {
      key: 'monthlyRevenue',
      label: t('monthlyRevenue'),
      value: formatCurrency(summary.monthlyRevenue, loc),
      href: '/contracts' as const,
      icon: Wallet,
      iconColor: 'bg-emerald-50 text-emerald-700',
      canOpen: canViewContracts,
    },
  ];

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const content = (
          <Card className={`h-full p-4 ${card.canOpen ? 'transition-shadow hover:shadow-md' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="mt-1.5 text-2xl tabular-nums tracking-tight">{card.value}</CardTitle>
              </div>
              <div className={`icon-tile ${card.iconColor}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        );

        if (!card.canOpen) {
          return <div key={card.key}>{content}</div>;
        }

        return (
          <Link key={card.key} href={card.href} className="block">
            {content}
          </Link>
        );
      })}
    </div>
  );
}

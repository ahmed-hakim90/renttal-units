import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import { ScrollText } from 'lucide-react';

export async function PortfolioSummary({
  summary,
  locale,
  canNavigate = true,
}: {
  summary: {
    totalUnits: number;
    totalLocations: number;
    occupancyRate: number;
    monthlyRevenue: number;
    totalContracts: number;
    totalContractsValue: number;
    activeContracts: number;
  };
  locale: string;
  canNavigate?: boolean;
}) {
  const t = await getTranslations('dashboard');
  const loc = locale as Locale;

  const cards = [
    { key: 'totalUnits', value: summary.totalUnits, href: '/units' as const },
    { key: 'totalLocations', value: summary.totalLocations, href: '/locations' as const },
    { key: 'occupancyRate', value: `${summary.occupancyRate}%`, href: '/units' as const },
    { key: 'monthlyRevenue', value: formatCurrency(summary.monthlyRevenue, loc), href: '/contracts' as const },
    {
      key: 'totalContracts',
      value: summary.totalContracts,
      href: '/contracts' as const,
      subtitle: t('activeContracts', { count: summary.activeContracts }),
      icon: ScrollText,
      iconColor: 'text-indigo-600 bg-indigo-50',
    },
    {
      key: 'totalContractsValue',
      value: formatCurrency(summary.totalContractsValue, loc),
      href: '/contracts' as const,
      icon: ScrollText,
      iconColor: 'text-violet-600 bg-violet-50',
    },
  ];

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const content = (
          <Card className={canNavigate ? 'h-full transition-shadow hover:shadow-md' : 'h-full'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardDescription>{t(card.key)}</CardDescription>
                <CardTitle className="mt-2 text-3xl">{card.value}</CardTitle>
                {'subtitle' in card && card.subtitle && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">{card.subtitle}</p>
                )}
              </div>
              {'icon' in card && card.icon && (
                <div className={`rounded-xl p-2.5 ${card.iconColor}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              )}
            </div>
          </Card>
        );

        if (!canNavigate) {
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

import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { DashboardPortfolioSummary } from '@/types/database';
import { Building2, CalendarClock, DoorOpen, Wrench, ScrollText, Wallet } from 'lucide-react';

export async function PortfolioSummary({
  summary,
  locale,
  canNavigate = true,
  canViewContracts = false,
}: {
  summary: DashboardPortfolioSummary;
  locale: string;
  canNavigate?: boolean;
  canViewContracts?: boolean;
}) {
  const t = await getTranslations('dashboard');
  const loc = locale as Locale;

  const cards = [
    {
      key: 'occupancyRate',
      value: `${formatNumber(summary.occupancyRate, loc)}%`,
      href: '/units' as const,
      icon: Building2,
      iconColor: 'bg-sky-50 text-sky-700',
      canOpen: canNavigate,
    },
    {
      key: 'vacantUnits',
      value: formatNumber(summary.vacantUnits, loc),
      href: '/units' as const,
      icon: DoorOpen,
      iconColor: 'bg-amber-50 text-amber-700',
      canOpen: canNavigate,
    },
    {
      key: 'maintenanceUnits',
      value: formatNumber(summary.maintenanceUnits, loc),
      href: '/units' as const,
      icon: Wrench,
      iconColor: 'bg-orange-50 text-orange-700',
      canOpen: canNavigate,
    },
    {
      key: 'activeContractsLabel',
      value: formatNumber(summary.activeContracts, loc),
      href: '/contracts' as const,
      icon: ScrollText,
      iconColor: 'bg-indigo-50 text-indigo-700',
      canOpen: canViewContracts,
    },
    ...(canViewContracts ? [{
      key: 'expiringContracts',
      value: formatNumber(summary.expiringContracts, loc),
      href: '/contracts' as const,
      icon: CalendarClock,
      iconColor: 'bg-rose-50 text-rose-700',
      canOpen: true,
    }] : []),
    {
      key: 'monthlyRevenue',
      value: formatCurrency(summary.monthlyRevenue, loc),
      href: '/contracts' as const,
      icon: Wallet,
      iconColor: 'bg-emerald-50 text-emerald-700',
      canOpen: canViewContracts,
    },
  ];

  return (
    <div className={`mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${canViewContracts ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
      {cards.map((card) => {
        const content = (
          <Card className={`h-full p-4 ${card.canOpen ? 'transition-shadow hover:shadow-md' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardDescription>{t(card.key)}</CardDescription>
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

'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Calendar, FileText, CreditCard, CheckCircle, Clock } from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';

const cards = [
  { key: 'dueThisMonth' as const, href: '/due-this-month', icon: Calendar, color: 'text-blue-600 bg-blue-50' },
  { key: 'awaitingPayment' as const, href: '/invoices', icon: FileText, color: 'text-amber-600 bg-amber-50' },
  { key: 'partialPayments' as const, href: '/partial-payments', icon: CreditCard, color: 'text-orange-600 bg-orange-50' },
  { key: 'fullyPaid' as const, href: '/fully-paid', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
  { key: 'upcomingPayments' as const, href: '/invoices', icon: Clock, color: 'text-purple-600 bg-purple-50' },
];

export function DashboardStatsCards({
  stats,
  locale,
  canNavigate = true,
}: {
  stats: DashboardStats;
  locale: string;
  canNavigate?: boolean;
}) {
  const t = useTranslations('dashboard');
  const loc = locale as Locale;
  const statValues = {
    dueThisMonth: stats.dueThisMonth,
    awaitingPayment: stats.awaitingPayment,
    partialPayments: stats.partialPayments,
    fullyPaid: stats.fullyPaid,
    upcomingPayments: stats.upcomingPayments,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map(({ key, href, icon: Icon, color }) => {
        const card = (
          <Card className={canNavigate ? 'transition-shadow hover:shadow-md cursor-pointer' : undefined}>
            <div className="flex items-start justify-between">
              <div>
                <CardDescription>{t(key)}</CardDescription>
                <CardTitle className="mt-2 text-3xl">{statValues[key]}</CardTitle>
                {key === 'dueThisMonth' && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {formatCurrency(stats.dueThisMonthAmount, loc)}
                  </p>
                )}
                {key === 'upcomingPayments' && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {formatCurrency(stats.upcomingPaymentsAmount, loc)}
                  </p>
                )}
              </div>
              <div className={`rounded-xl p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        );

        return canNavigate ? (
          <Link key={key} href={href}>
            {card}
          </Link>
        ) : (
          <div key={key}>{card}</div>
        );
      })}
    </div>
  );
}

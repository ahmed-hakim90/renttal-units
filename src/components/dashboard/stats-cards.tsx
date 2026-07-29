'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Calendar, FileText, CreditCard, CheckCircle, Clock } from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';

const cards = [
  { key: 'dueThisMonth' as const, href: '/due-this-month', icon: Calendar, color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100' },
  { key: 'awaitingPayment' as const, href: '/invoices', icon: FileText, color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100' },
  { key: 'partialPayments' as const, href: '/partial-payments', icon: CreditCard, color: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-100' },
  { key: 'fullyPaid' as const, href: '/fully-paid', icon: CheckCircle, color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100' },
  { key: 'upcomingPayments' as const, href: '/invoices', icon: Clock, color: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100' },
];

export function DashboardStatsCards({
  stats,
  locale,
  canNavigate = true,
  showPaymentStatusPages = true,
}: {
  stats: DashboardStats;
  locale: string;
  canNavigate?: boolean;
  showPaymentStatusPages?: boolean;
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
  const visibleCards = cards.filter((card) => (
    showPaymentStatusPages
    || (card.href !== '/partial-payments' && card.href !== '/fully-paid')
  ));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {visibleCards.map(({ key, href, icon: Icon, color }) => {
        const card = (
          <Card className={canNavigate ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardDescription>{t(key)}</CardDescription>
                <CardTitle className="mt-2 text-3xl tabular-nums tracking-tight">
                  {formatNumber(statValues[key], loc)}
                </CardTitle>
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
              <div className={`icon-tile ${color}`}>
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

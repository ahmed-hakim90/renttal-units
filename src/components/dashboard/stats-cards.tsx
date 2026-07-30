'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Calendar, FileText, CreditCard } from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';

const cards = [
  {
    key: 'overdue' as const,
    href: '/invoices',
    icon: AlertTriangle,
    color: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-100',
  },
  {
    key: 'dueThisMonth' as const,
    href: '/due-this-month',
    icon: Calendar,
    color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
  },
  {
    key: 'awaitingPayment' as const,
    href: '/invoices',
    icon: FileText,
    color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100',
  },
  {
    key: 'partialPayments' as const,
    href: '/partial-payments',
    icon: CreditCard,
    color: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-100',
  },
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
    overdue: stats.overdueCount,
    dueThisMonth: stats.dueThisMonth,
    awaitingPayment: stats.awaitingPayment,
    partialPayments: stats.partialPayments,
  };
  const visibleCards = cards.filter((card) => (
    showPaymentStatusPages || card.href !== '/partial-payments'
  ));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibleCards.map(({ key, href, icon: Icon, color }) => {
        const card = (
          <Card className={`p-4 ${canNavigate ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardDescription>{t(key)}</CardDescription>
                <CardTitle className="mt-1.5 text-2xl tabular-nums tracking-tight">
                  {formatNumber(statValues[key], loc)}
                </CardTitle>
                {key === 'overdue' && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {formatCurrency(stats.overdueAmount, loc)}
                  </p>
                )}
                {key === 'dueThisMonth' && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {formatCurrency(stats.dueThisMonthAmount, loc)}
                  </p>
                )}
              </div>
              <div className={`icon-tile ${color}`}>
                <Icon className="h-4 w-4" />
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

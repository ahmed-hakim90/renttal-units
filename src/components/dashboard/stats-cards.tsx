'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Calendar, FileText, CreditCard, CheckCircle } from 'lucide-react';
import type { DashboardStats } from '@/types/database';

const cards = [
  { key: 'dueThisMonth' as const, href: '/due-this-month', icon: Calendar, color: 'text-blue-600 bg-blue-50' },
  { key: 'awaitingPayment' as const, href: '/invoices', icon: FileText, color: 'text-amber-600 bg-amber-50' },
  { key: 'partialPayments' as const, href: '/partial-payments', icon: CreditCard, color: 'text-orange-600 bg-orange-50' },
  { key: 'fullyPaid' as const, href: '/fully-paid', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
];

export function DashboardStatsCards({ stats }: { stats: DashboardStats; locale: string }) {
  const t = useTranslations('dashboard');
  const statValues = {
    dueThisMonth: stats.dueThisMonth,
    awaitingPayment: stats.awaitingPayment,
    partialPayments: stats.partialPayments,
    fullyPaid: stats.fullyPaid,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ key, href, icon: Icon, color }) => (
        <Link key={key} href={href}>
          <Card className="transition-shadow hover:shadow-md cursor-pointer">
            <div className="flex items-start justify-between">
              <div>
                <CardDescription>{t(key)}</CardDescription>
                <CardTitle className="mt-2 text-3xl">{statValues[key]}</CardTitle>
              </div>
              <div className={`rounded-xl p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

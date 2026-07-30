'use client';

import { useTranslations } from 'next-intl';
import { FilePlus2, CreditCard, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/lib/i18n/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import { syncDueInvoices } from '@/lib/actions/invoices';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';

export function DashboardQuickActions({
  locale,
  canCreateContract,
  canRecordPayment,
  canSyncDue,
  paymentHref,
}: {
  locale: string;
  canCreateContract: boolean;
  canRecordPayment: boolean;
  canSyncDue: boolean;
  paymentHref: '/partial-payments' | '/invoices';
}) {
  const t = useTranslations('dashboard');
  const ti = useTranslations('invoices');
  const tp = useTranslations('payments');
  const tc = useTranslations('contracts');
  const tCommon = useTranslations('common');
  const { isSubmitting, runOnce } = useSingleSubmit();

  if (!canCreateContract && !canRecordPayment && !canSyncDue) {
    return null;
  }

  async function handleSyncDue() {
    await runOnce(async () => {
      const result = await syncDueInvoices(locale);
      if (result.success) {
        toast.success(ti('dueSynced'));
      } else {
        toast.error(tCommon('error'));
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {canCreateContract && (
        <Link href="/contracts/new" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
          <FilePlus2 />
          {tc('create')}
        </Link>
      )}
      {canRecordPayment && (
        <Link href={paymentHref} className={buttonStyles({ variant: 'payment', size: 'sm' })}>
          <CreditCard />
          {tp('create')}
        </Link>
      )}
      {canSyncDue && (
        <Button
          type="button"
          variant="issue"
          size="sm"
          disabled={isSubmitting}
          onClick={handleSyncDue}
          aria-label={t('syncDueInvoices')}
        >
          <RefreshCw className={isSubmitting ? 'animate-spin' : undefined} />
          {isSubmitting ? ti('syncingDue') : ti('syncDue')}
        </Button>
      )}
    </div>
  );
}

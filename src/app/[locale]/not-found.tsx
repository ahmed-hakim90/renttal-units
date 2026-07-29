import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('notFoundDescription')}</p>
        </div>
        <Link href="/dashboard" className={buttonStyles()}>
          {t('backToDashboard')}
        </Link>
      </Card>
    </div>
  );
}

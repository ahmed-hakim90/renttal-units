'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('errorTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('errorDescription')}</p>
        </div>
        <Button type="button" onClick={reset}>
          {t('retry')}
        </Button>
      </Card>
    </div>
  );
}

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Logo } from '@/components/brand/logo';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });
  if (!auth) {
    redirect({ href: '/login', locale });
  }

  if (!auth!.mustChangePassword) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('common');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Logo size="lg" />
            <div>
              <p className="font-medium">{t('changePasswordTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('changePasswordHint')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <ChangePasswordForm locale={locale} />
      </Card>
    </div>
  );
}

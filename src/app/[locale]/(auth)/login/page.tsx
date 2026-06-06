import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Logo } from '@/components/brand/logo';
import { LoginForm } from '@/components/auth/login-form';
import { createClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n/navigation';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('common');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Logo size="lg" />
            <p className="text-sm text-muted-foreground">{t('login')}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <LoginForm locale={locale} />
      </Card>
    </div>
  );
}

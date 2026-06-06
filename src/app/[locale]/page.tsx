import { createClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect({ href: user ? '/dashboard' : '/login', locale });
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signIn } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('locale', locale);
    const result = await signIn(fd);

    if (!result.success) {
      setError(result.error ?? t('error'));
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Input name="email" type="email" label={t('email')} required placeholder="admin@example.com" />
      <Input name="password" type="password" label={t('password')} required />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('loading') : t('login')}
      </Button>
    </form>
  );
}

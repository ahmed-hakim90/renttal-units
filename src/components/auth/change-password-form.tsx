'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { changePassword } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChangePasswordForm({ locale }: { locale: string }) {
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
    const result = await changePassword(fd);

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
      <Input
        name="password"
        type="password"
        label={t('newPassword')}
        required
        minLength={12}
        autoComplete="new-password"
      />
      <Input
        name="confirm_password"
        type="password"
        label={t('confirmPassword')}
        required
        minLength={12}
        autoComplete="new-password"
      />
      <p className="text-xs text-muted-foreground">{t('passwordRequirements')}</p>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('loading') : t('changePassword')}
      </Button>
    </form>
  );
}

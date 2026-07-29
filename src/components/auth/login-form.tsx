'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { signIn } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function getErrorMessage(code?: string) {
    if (code === 'invalid_credentials') return t('invalidCredentials');
    return t('error');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('locale', locale);
    const result = await signIn(fd);

    if (!result.success) {
      setError(getErrorMessage(result.error));
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Input name="email" type="email" label={t('email')} required autoComplete="username" />
      <div className="relative">
        <Input
          name="password"
          type={showPassword ? 'text' : 'password'}
          label={t('password')}
          required
          autoComplete="current-password"
          className="pe-12"
        />
        <button
          type="button"
          aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((visible) => !visible)}
          className="absolute bottom-1 end-1 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('loading') : t('login')}
      </Button>
    </form>
  );
}

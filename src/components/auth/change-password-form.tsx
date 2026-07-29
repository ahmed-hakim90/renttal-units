'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { changePassword } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  isStaffPasswordValid,
  PasswordRequirements,
} from '@/components/auth/password-requirements';

export function ChangePasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirm_password: false,
  });
  const [passwordValues, setPasswordValues] = useState({
    password: '',
    confirm_password: '',
  });
  const passwordIsValid = isStaffPasswordValid(passwordValues.password);
  const passwordsMatch =
    passwordValues.confirm_password.length > 0
    && passwordValues.password === passwordValues.confirm_password;

  function getErrorMessage(code?: string) {
    if (code === 'passwords_mismatch') return t('passwordsMismatch');
    if (code === 'password_policy') return t('passwordRequirements');
    if (code === 'change_password_failed') return t('changePasswordFailed');
    return t('error');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('locale', locale);
    const result = await changePassword(fd);

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
      {[
        { name: 'password', label: t('newPassword') },
        { name: 'confirm_password', label: t('confirmPassword') },
      ].map((field) => {
        const fieldName = field.name as keyof typeof visiblePasswords;
        const isVisible = visiblePasswords[fieldName];

        return (
          <div key={field.name} className="relative">
            <Input
              name={field.name}
              type={isVisible ? 'text' : 'password'}
              label={field.label}
              required
              minLength={12}
              autoComplete="new-password"
              value={passwordValues[fieldName]}
              onChange={(event) => setPasswordValues((current) => ({
                ...current,
                [fieldName]: event.target.value,
              }))}
              className={
                `pe-12 ${
                  (fieldName === 'password' ? passwordIsValid : passwordsMatch)
                    ? 'border-emerald-500 bg-emerald-50/50 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25 dark:bg-emerald-950/20'
                    : ''
                }`
              }
            />
            <button
              type="button"
              aria-label={t(isVisible ? 'hidePassword' : 'showPassword')}
              aria-pressed={isVisible}
              onClick={() => setVisiblePasswords((current) => ({
                ...current,
                [fieldName]: !current[fieldName],
              }))}
              className="absolute bottom-1 end-1 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        );
      })}
      <PasswordRequirements
        password={passwordValues.password}
        confirmation={passwordValues.confirm_password}
      />
      <Button type="submit" className="w-full" disabled={loading || !passwordIsValid || !passwordsMatch}>
        {loading ? t('loading') : t('changePassword')}
      </Button>
    </form>
  );
}

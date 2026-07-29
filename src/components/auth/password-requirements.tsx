'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getStaffPasswordChecks } from '@/lib/validation/password-policy';

export function isStaffPasswordValid(password: string) {
  return Object.values(getStaffPasswordChecks(password)).every(Boolean);
}

export function PasswordRequirements({
  password,
  confirmation,
}: {
  password: string;
  confirmation?: string;
}) {
  const t = useTranslations('common.passwordChecklist');
  const checks = getStaffPasswordChecks(password);
  const items = [
    { key: 'minLength', met: checks.minLength },
    { key: 'uppercase', met: checks.uppercase },
    { key: 'lowercase', met: checks.lowercase },
    { key: 'number', met: checks.number },
    ...(confirmation === undefined
      ? []
      : [{ key: 'matches', met: confirmation.length > 0 && password === confirmation }]),
  ] as const;

  return (
    <ul className="grid gap-1.5 text-xs sm:grid-cols-2" aria-live="polite">
      {items.map((item) => {
        const Icon = item.met ? CheckCircle2 : Circle;
        return (
          <li
            key={item.key}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              item.met ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{t(item.key)}</span>
          </li>
        );
      })}
    </ul>
  );
}


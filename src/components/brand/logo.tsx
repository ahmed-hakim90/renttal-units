'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const iconSizes = {
  sm: 28,
  md: 36,
  lg: 44,
} as const;

export function Logo({ className, showWordmark = true, size = 'md' }: LogoProps) {
  const t = useTranslations('common');
  const iconSize = iconSizes[size];

  if (!showWordmark) {
    return (
      <Image
        src="/brand/logo-icon.svg"
        alt=""
        width={iconSize}
        height={iconSize}
        className={cn('shrink-0 rounded-xl', className)}
        priority
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <Image
        src="/brand/logo-icon.svg"
        alt=""
        width={iconSize}
        height={iconSize}
        className="shrink-0 rounded-xl"
        priority
      />
      <span className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
        {t('appName')}
      </span>
    </div>
  );
}

export function LogoMark({ className, size = 'md' }: Pick<LogoProps, 'className' | 'size'>) {
  return <Logo className={className} showWordmark={false} size={size} />;
}

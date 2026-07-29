import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? 'mb-3 flex min-w-0 flex-col gap-2 border-b border-border pb-2 sm:mb-3 sm:flex-row sm:items-start sm:justify-between sm:pb-2'
          : 'mb-5 flex min-w-0 flex-col gap-4 border-b border-border pb-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:pb-6'
      }
    >
      <div className="min-w-0 space-y-0.5">
        <h1
          className={
            compact
              ? 'text-lg font-bold tracking-tight text-foreground sm:text-xl'
              : 'text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]'
          }
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={
              compact
                ? 'max-w-2xl text-xs text-muted-foreground'
                : 'max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]'
            }
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full shrink-0 flex-col gap-2 [&>*]:w-full sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:[&>*]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

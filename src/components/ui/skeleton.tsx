import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const pulseClass = 'animate-pulse bg-muted motion-reduce:animate-none';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-xl', pulseClass, className)}
    />
  );
}

export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function PageHeaderSkeleton({
  withAction = true,
  withSubtitle = true,
}: {
  withAction?: boolean;
  withSubtitle?: boolean;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-4 border-b border-border pb-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:pb-6">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-48 sm:w-64" />
        {withSubtitle && <Skeleton className="h-4 w-64 max-w-full sm:w-80" />}
      </div>
      {withAction && <Skeleton className="h-10 w-full sm:w-32" />}
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="toolbar">
      <Skeleton className="h-10 w-full sm:max-w-sm" />
      <Skeleton className="h-10 w-full sm:w-36" />
    </div>
  );
}

export function StatsCardsSkeleton({
  count = 5,
  columns = 'dashboard',
}: {
  count?: number;
  columns?: 'dashboard' | 'detail' | 'report';
}) {
  const gridClass = columns === 'detail'
    ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
    : columns === 'report'
      ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
      : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MobileCardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 md:hidden">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="mobile-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3.5 w-28 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index}>
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (_, colIndex) => (
                <td key={colIndex}>
                  <Skeleton
                    className={cn(
                      'h-4',
                      colIndex === 0 ? 'w-28' : colIndex === columns - 1 ? 'w-16' : 'w-20',
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SurfaceSectionSkeleton({
  rows = 4,
  withHeader = true,
}: {
  rows?: number;
  withHeader?: boolean;
}) {
  return (
    <section className="surface-panel overflow-hidden">
      {withHeader && (
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <Skeleton className="h-5 w-5 rounded-md" />
          <Skeleton className="h-5 w-36" />
        </div>
      )}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function DocumentListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
        >
          <Skeleton className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-48 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({
  fields = 6,
  columns = 2,
}: {
  fields?: number;
  columns?: 1 | 2;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className={cn('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="form-actions">
        <Skeleton className="h-10 w-full sm:w-28" />
        <Skeleton className="h-10 w-full sm:w-28" />
      </div>
    </div>
  );
}

export function AuthCardSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: fields }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export function SearchResultSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-36 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogProductSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton className="mt-1 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3.5 w-32 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListPageSkeleton({
  rows = 6,
  columns = 5,
  withAction = true,
}: {
  rows?: number;
  columns?: number;
  withAction?: boolean;
}) {
  return (
    <div>
      <PageHeaderSkeleton withAction={withAction} />
      <ToolbarSkeleton />
      <MobileCardListSkeleton rows={Math.min(rows, 4)} />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}

export function DetailPageSkeleton({
  withPreview = false,
}: {
  withPreview?: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsCardsSkeleton count={4} columns="detail" />
      {withPreview ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.95fr)]">
          <div className="min-w-0 space-y-6">
            <SurfaceSectionSkeleton rows={3} />
            <SurfaceSectionSkeleton rows={4} />
          </div>
          <div className="surface-panel min-h-80 p-4 sm:p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <SurfaceSectionSkeleton rows={3} />
          <SurfaceSectionSkeleton rows={4} />
        </div>
      )}
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton withAction />
      <StatsCardsSkeleton count={4} columns="dashboard" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="mb-2 h-3.5 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <SurfaceSectionSkeleton rows={4} />
      <RecentActivitySkeleton />
    </div>
  );
}

export function RecentActivitySkeleton() {
  return (
    <div className="mt-4 space-y-3">
      <Skeleton className="h-5 w-36" />
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="mb-3 h-4 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, rowIndex) => (
                <div key={rowIndex} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-28 max-w-full" />
                    <Skeleton className="h-3.5 w-20 max-w-full" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportPageSkeleton({
  summaryCount = 12,
}: {
  summaryCount?: number;
}) {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton withAction />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full max-w-sm space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-9 w-full sm:w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <Skeleton className="mb-2 h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <ReportResultsSkeleton summaryCount={summaryCount} />
    </div>
  );
}

export function ReportResultsSkeleton({
  summaryCount = 12,
  rows = 6,
}: {
  summaryCount?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <StatsCardsSkeleton count={summaryCount} columns="report" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="space-y-2 border-b border-border px-6 py-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="p-3 md:hidden">
          <MobileCardListSkeleton rows={Math.min(rows, 3)} />
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/70">
              <tr>
                {Array.from({ length: 7 }, (_, index) => (
                  <th key={index} className="px-4 py-3 text-start">
                    <Skeleton className="h-3 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border">
                  {Array.from({ length: 7 }, (_, colIndex) => (
                    <td key={colIndex} className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function FormPageSkeleton({
  sections = 2,
}: {
  sections?: number;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction={false} />
      {Array.from({ length: sections }, (_, index) => (
        <FormSkeleton key={index} fields={index === 0 ? 6 : 4} />
      ))}
    </div>
  );
}

export function ImportPageSkeleton() {
  return (
    <div className="space-y-10">
      <div>
        <PageHeaderSkeleton withAction={false} withSubtitle={false} />
        <div className="space-y-4">
          <div className="surface-panel p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-10 w-40" />
              </div>
            </div>
          </div>
          <StatsCardsSkeleton count={5} columns="dashboard" />
          <DocumentListSkeleton rows={4} />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <FormSkeleton fields={3} columns={1} />
      </div>
    </div>
  );
}

export function RolesPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton withAction />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="surface-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3.5 w-48 max-w-full" />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            </div>
            <Skeleton className="h-9 w-full sm:w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

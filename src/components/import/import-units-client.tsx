'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { previewImport, executeImport } from '@/lib/actions/admin';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import type { UnitStatus } from '@/types/database';

interface PreviewRow {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
  valid: boolean;
}

export function ImportUnitsClient({ locale, canEdit }: { locale: string; canEdit: boolean }) {
  const t = useTranslations('units');
  const tc = useTranslations('common');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { isSubmitting, runOnce } = useSingleSubmit();
  const busy = loading || isSubmitting;

  if (!canEdit) {
    return <p className="text-muted-foreground">{tc('viewOnly')}</p>;
  }

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runOnce(async () => {
      setLoading(true);
      try {
        const fd = new FormData(e.currentTarget);
        const result = await previewImport(locale, fd);
        if (result.success && result.data) {
          setPreview(result.data as PreviewRow[]);
        } else {
          toast.error('error' in result ? result.error : tc('error'));
        }
      } finally {
        setLoading(false);
      }
    });
  }

  async function handleImport() {
    if (!preview) return;
    await runOnce(async () => {
      setLoading(true);
      try {
        const validRows = preview
          .filter((r) => r.valid)
          .map((r) => ({
            location_id: r.data.location_id as string,
            unit_number: String(r.data.unit_number),
            floor: r.data.floor ? String(r.data.floor) : undefined,
            area_sqm: r.data.area_sqm ? Number(r.data.area_sqm) : undefined,
            status: (r.data.status as UnitStatus) || 'vacant',
          }));

        const result = await executeImport(locale, validRows);
        if (result.success) {
          toast.success(t('importUnitsSuccess', {
            success: result.successCount ?? 0,
            errors: result.errorCount ?? 0,
          }));
          setPreview(null);
        } else {
          toast.error(tc('error'));
        }
      } finally {
        setLoading(false);
      }
    });
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="mb-4 text-sm text-muted-foreground">{t('importUnitsDesc')}</p>
        <form onSubmit={handlePreview} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <input type="file" name="file" accept=".xlsx,.csv" required className="block w-full text-sm" />
          </div>
          <Button type="submit" disabled={busy}>
            <Upload className="h-4 w-4" />
            {busy ? tc('loading') : tc('preview')}
          </Button>
        </form>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-start">{t('row')}</th>
                  <th className="px-4 py-3 text-start">{t('unitNumber')}</th>
                  <th className="px-4 py-3 text-start">{t('floor')}</th>
                  <th className="px-4 py-3 text-start">{t('areaSqm')}</th>
                  <th className="px-4 py-3 text-start">{t('status')}</th>
                  <th className="px-4 py-3 text-start">{t('errors')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.row} className={`border-t border-border ${row.valid ? '' : 'bg-red-50/50'}`}>
                    <td className="px-4 py-3">{row.row}</td>
                    <td className="px-4 py-3">{String(row.data.unit_number ?? '—')}</td>
                    <td className="px-4 py-3">{String(row.data.floor ?? '—')}</td>
                    <td className="px-4 py-3">{String(row.data.area_sqm ?? '—')}</td>
                    <td className="px-4 py-3">{row.valid ? '✓' : '✗'}</td>
                    <td className="px-4 py-3 text-xs text-destructive">{row.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border p-4">
            <Button onClick={handleImport} disabled={busy || validCount === 0}>
              {t('importValidRows', { count: validCount })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

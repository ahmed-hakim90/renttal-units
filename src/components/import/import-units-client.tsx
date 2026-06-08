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
      toast.success(`${result.successCount} imported, ${result.errorCount} errors`);
      setPreview(null);
    } else {
      toast.error(tc('error'));
    }
    } finally {
      setLoading(false);
    }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-2">{tc('nav.import')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload Excel with columns: unit_number, location_name (or location_id), status, floor, area_sqm
        </p>
        <form onSubmit={handlePreview} className="flex items-end gap-4">
          <div className="flex-1">
            <input type="file" name="file" accept=".xlsx,.csv" required className="block w-full text-sm" />
          </div>
          <Button type="submit" disabled={busy}>
            <Upload className="h-4 w-4" /> Preview
          </Button>
        </form>
      </div>

      {preview && (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">Row</th>
                <th className="px-4 py-3 text-start">{t('unitNumber')}</th>
                <th className="px-4 py-3 text-start">{t('floor')}</th>
                <th className="px-4 py-3 text-start">{t('areaSqm')}</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Errors</th>
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
          <div className="p-4 border-t border-border">
            <Button onClick={handleImport} disabled={busy || !preview.some((r) => r.valid)}>
              Import {preview.filter((r) => r.valid).length} valid rows
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

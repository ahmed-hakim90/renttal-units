'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { previewContractImport, executeContractImport } from '@/lib/actions/admin';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { toast } from 'sonner';
import { Upload, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { PaymentCycle } from '@/types/database';

interface ContractPreviewRow {
  row: number;
  data: {
    contract_number: string | null;
    tenant_name: string | null;
    unit_id: string | null;
    unit_number: string;
    start_date: string;
    end_date: string;
    total_amount: number;
    payment_cycle: PaymentCycle | null;
    paid_through_date: string | null;
    opening_paid_amount: number | null;
  };
  errors: string[];
  valid: boolean;
}

export function ImportContractsClient({ locale, canEdit }: { locale: string; canEdit: boolean }) {
  const t = useTranslations('units');
  const tc = useTranslations('common');
  const loc = locale as Locale;
  const [preview, setPreview] = useState<ContractPreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { isSubmitting, runOnce } = useSingleSubmit();
  const busy = loading || isSubmitting;

  if (!canEdit) {
    return <p className="text-muted-foreground">{tc('viewOnly')}</p>;
  }

  function handleDownloadTemplate() {
    const headers = [
      'رقم العقد',
      'اسم المستأجر',
      'رقم الوحدة',
      'تاريخ الإبرام',
      'تاريخ بداية الإيجار',
      'تاريخ نهاية الإيجار',
      'إجمالي قيمة العقد (ريال)',
      'قيمة الدفعة الدورية (ريال)',
      'عدد الدفعات',
      'آخر تاريخ مدفوع',
      'مبلغ مدفوع مسبقاً (ريال)',
    ];
    const exampleRow = [
      'CTR-001',
      'اسم المستأجر',
      '1',
      '2025-01-01',
      '2025-01-01',
      '2026-01-01',
      '24000',
      '12000',
      '2',
      '2025-07-01',
      '0',
    ];

    // Build CSV with BOM so Excel opens Arabic correctly
    const bom = '﻿';
    const csv = bom + [headers, exampleRow].map((row) => row.join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contracts-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runOnce(async () => {
    setLoading(true);
    try {
    const fd = new FormData(e.currentTarget);
    const result = await previewContractImport(locale, fd);
    if (result.success && result.data) {
      setPreview(result.data as ContractPreviewRow[]);
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
      .filter((r) => r.valid && r.data.unit_id && r.data.payment_cycle && r.data.contract_number && r.data.tenant_name)
      .map((r) => ({
        contract_number: String(r.data.contract_number).trim(),
        tenant_name: String(r.data.tenant_name).trim(),
        unit_id: r.data.unit_id as string,
        start_date: r.data.start_date,
        end_date: r.data.end_date,
        total_amount: r.data.total_amount,
        payment_cycle: r.data.payment_cycle as PaymentCycle,
        paid_through_date: r.data.paid_through_date,
        opening_paid_amount: r.data.opening_paid_amount,
      }));

    const result = await executeContractImport(locale, validRows);
    if (result.success) {
      toast.success(t('importContractsSuccess', {
        success: result.successCount ?? 0,
        errors: result.errorCount ?? 0,
      }));
      setPreview(null);
    } else {
      toast.error('error' in result && result.error ? result.error : tc('error'));
    }
    } finally {
      setLoading(false);
    }
    });
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const invalidCount = preview ? preview.length - validCount : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">{t('importContracts')}</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" />
            {t('downloadTemplate')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t('importContractsDesc')}</p>
        <form onSubmit={handlePreview} className="flex items-end gap-4">
          <div className="flex-1">
            <input type="file" name="file" accept=".xlsx,.csv" required className="block w-full text-sm" />
          </div>
          <Button type="submit" disabled={busy}>
            <Upload className="h-4 w-4" />
            {tc('preview') ?? 'Preview'}
          </Button>
        </form>
      </div>

      {preview && (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-sm">
              <span className="font-medium text-green-600">{validCount} {tc('valid') ?? 'valid'}</span>
              {invalidCount > 0 && (
                <span className="ms-3 font-medium text-destructive">{invalidCount} {tc('invalid') ?? 'invalid'}</span>
              )}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">#</th>
                <th className="px-4 py-3 text-start">رقم العقد</th>
                <th className="px-4 py-3 text-start">رقم الوحدة</th>
                <th className="px-4 py-3 text-start">المستأجر</th>
                <th className="px-4 py-3 text-start">البداية</th>
                <th className="px-4 py-3 text-start">النهاية</th>
                <th className="px-4 py-3 text-start">المبلغ</th>
                <th className="px-4 py-3 text-start">الدورية</th>
                <th className="px-4 py-3 text-start">آخر مدفوع</th>
                <th className="px-4 py-3 text-start">مدفوع مسبقاً</th>
                <th className="px-4 py-3 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.row} className={`border-t border-border ${row.valid ? '' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
                  <td className="px-4 py-2 text-muted-foreground">{row.row}</td>
                  <td className="px-4 py-2">{row.data.contract_number ?? '—'}</td>
                  <td className="px-4 py-2 font-medium">{row.data.unit_number || '—'}</td>
                  <td className="px-4 py-2">{row.data.tenant_name ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{row.data.start_date || '—'}</td>
                  <td className="px-4 py-2 text-xs">{row.data.end_date || '—'}</td>
                  <td className="px-4 py-2">{row.data.total_amount ? formatCurrency(row.data.total_amount, loc) : '—'}</td>
                  <td className="px-4 py-2">{row.data.payment_cycle ? tc(`paymentCycle.${row.data.payment_cycle}`) : '—'}</td>
                  <td className="px-4 py-2 text-xs">{row.data.paid_through_date || '—'}</td>
                  <td className="px-4 py-2">{row.data.opening_paid_amount ? formatCurrency(row.data.opening_paid_amount, loc) : '—'}</td>
                  <td className="px-4 py-2">
                    {row.valid ? (
                      <span className="text-green-600 font-medium">✓</span>
                    ) : (
                      <span className="text-destructive text-xs">{row.errors.join(' · ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-border">
            <Button
              onClick={handleImport}
              disabled={busy || validCount === 0}
            >
              {tc('import') ?? 'Import'} {validCount} {tc('contracts') ?? 'contracts'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

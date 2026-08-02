'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  exportContractsExcel,
  previewContractImport,
  executeContractImport,
} from '@/lib/actions/admin';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { toast } from 'sonner';
import { Upload, Download, FileDown } from 'lucide-react';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { PaymentCycle } from '@/types/database';
import {
  CONTRACT_EXCEL_EXAMPLE_ROW,
  CONTRACT_EXCEL_HEADERS,
} from '@/lib/import/contract-excel-columns';

interface ContractPreviewRow {
  row: number;
  action: 'create' | 'update';
  data: {
    contract_id: string | null;
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
    opening_payment_date: string | null;
  };
  errors: string[];
  valid: boolean;
}

function translateImportError(
  message: string,
  t: ReturnType<typeof useTranslations<'units'>>,
) {
  if (message.endsWith('featureDisabled')) return t('importFeatureDisabled');
  if (message.endsWith('odooLinkedInvoices')) return t('importOdooLinkedInvoices');
  if (message.endsWith('localPaymentsExist')) return t('importLocalPaymentsExist');
  if (message === 'odooLinkedInvoices') return t('importOdooLinkedInvoices');
  if (message === 'localPaymentsExist') return t('importLocalPaymentsExist');
  if (message === 'Unauthorized') return t('importUnauthorized');
  if (message === 'contractNotFound') return t('importContractNotFound');
  return message;
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
    const bom = '\uFEFF';
    const csv = bom + [CONTRACT_EXCEL_HEADERS, CONTRACT_EXCEL_EXAMPLE_ROW]
      .map((row) => row.join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contracts-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    await runOnce(async () => {
      setLoading(true);
      try {
        const result = await exportContractsExcel(locale);
        if (!result.success || !('data' in result) || !result.data) {
          toast.error('error' in result && result.error ? String(result.error) : tc('error'));
          return;
        }
        const binary = atob(result.data.fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('exportContractsSuccess', { count: result.data.rowCount }));
      } finally {
        setLoading(false);
      }
    });
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
          .filter((r) => (
            r.valid
            && r.data.payment_cycle
            && r.data.contract_number
            && (
              r.action === 'update'
                ? Boolean(r.data.contract_id)
                : Boolean(r.data.unit_id && r.data.tenant_name)
            )
          ))
          .map((r) => ({
            action: r.action,
            contract_id: r.data.contract_id,
            contract_number: String(r.data.contract_number).trim(),
            tenant_name: String(r.data.tenant_name ?? '').trim(),
            unit_id: (r.data.unit_id ?? '') as string,
            start_date: r.data.start_date,
            end_date: r.data.end_date,
            total_amount: r.data.total_amount,
            payment_cycle: r.data.payment_cycle as PaymentCycle,
            paid_through_date: r.data.paid_through_date,
            opening_paid_amount: r.data.opening_paid_amount,
            opening_payment_date: r.data.opening_payment_date,
          }));

        const result = await executeContractImport(locale, validRows);
        if (result.success) {
          toast.success(t('importContractsSuccess', {
            success: result.successCount ?? 0,
            created: result.createCount ?? 0,
            updated: result.updateCount ?? 0,
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
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('importContracts')}</h3>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={busy}>
              <FileDown className="h-4 w-4" />
              {t('exportContracts')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4" />
              {t('downloadTemplate')}
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{t('importContractsDesc')}</p>
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
        <div className="overflow-x-auto rounded-2xl border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
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
                <th className="px-4 py-3 text-start">{t('importAction')}</th>
                <th className="px-4 py-3 text-start">رقم العقد</th>
                <th className="px-4 py-3 text-start">رقم الوحدة</th>
                <th className="px-4 py-3 text-start">المستأجر</th>
                <th className="px-4 py-3 text-start">البداية</th>
                <th className="px-4 py-3 text-start">النهاية</th>
                <th className="px-4 py-3 text-start">المبلغ</th>
                <th className="px-4 py-3 text-start">آخر مدفوع</th>
                <th className="px-4 py-3 text-start">مدفوع مسبقاً</th>
                <th className="px-4 py-3 text-start">تاريخ آخر دفعة</th>
                <th className="px-4 py-3 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr
                  key={row.row}
                  className={`border-t border-border ${row.valid ? '' : 'bg-red-50/50 dark:bg-red-950/20'}`}
                >
                  <td className="px-4 py-2 text-muted-foreground">{row.row}</td>
                  <td className="px-4 py-2">
                    {row.action === 'update' ? t('importActionUpdate') : t('importActionCreate')}
                  </td>
                  <td className="px-4 py-2">{row.data.contract_number ?? '—'}</td>
                  <td className="px-4 py-2 font-medium">{row.data.unit_number || '—'}</td>
                  <td className="px-4 py-2">{row.data.tenant_name ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{row.data.start_date || '—'}</td>
                  <td className="px-4 py-2 text-xs">{row.data.end_date || '—'}</td>
                  <td className="px-4 py-2">
                    {row.data.total_amount ? formatCurrency(row.data.total_amount, loc) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.data.paid_through_date || '—'}</td>
                  <td className="px-4 py-2">
                    {row.data.opening_paid_amount
                      ? formatCurrency(row.data.opening_paid_amount, loc)
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.data.opening_payment_date || '—'}</td>
                  <td className="px-4 py-2">
                    {row.valid ? (
                      <span className="font-medium text-green-600">✓</span>
                    ) : (
                      <span className="text-xs text-destructive">
                        {row.errors.map((error) => translateImportError(error, t)).join(' · ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border p-4">
            <Button onClick={handleImport} disabled={busy || validCount === 0}>
              {tc('import') ?? 'Import'} {validCount} {tc('contracts') ?? 'contracts'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

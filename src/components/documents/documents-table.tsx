'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Eye, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  deleteContractPdf,
  getContractPdfPreviewUrl,
  getContractPdfUrl,
  relinkContractPdf,
} from '@/lib/actions/contract-attachments';
import { formatDate } from '@/lib/i18n/format';
import { Link } from '@/lib/i18n/navigation';
import type { Locale } from '@/lib/i18n/routing';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import type {
  ContractAttachmentListItem,
  ContractLinkOption,
} from '@/lib/repositories/contract-attachments';

function formatFileSize(bytes: number, locale: string) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / (1024 * 1024))} MB`;
}

export function DocumentsTable({
  attachments,
  locale,
  contracts,
  canManage = false,
}: {
  attachments: ContractAttachmentListItem[];
  locale: string;
  contracts: ContractLinkOption[];
  canManage?: boolean;
}) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const loc = locale as Locale;
  const router = useRouter();
  const { isSubmitting, runOnce } = useSingleSubmit();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  const contractOptions = useMemo(
    () => contracts.map((contract) => ({
      value: contract.id,
      label: contract.tenantName
        ? `${contract.contract_number} · ${contract.tenantName}`
        : contract.contract_number,
      keywords: [contract.contract_number, contract.tenantName, contract.status],
    })),
    [contracts],
  );

  async function handleDownload(item: ContractAttachmentListItem) {
    setBusyId(item.id);
    try {
      const result = await getContractPdfUrl(locale, item.contract_id, item.id);
      if (!result.success || !('data' in result) || !result.data?.url) {
        toast.error(t('downloadFailed'));
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyId(null);
    }
  }

  async function handleOpen(item: ContractAttachmentListItem) {
    setBusyId(item.id);
    try {
      const result = await getContractPdfPreviewUrl(locale, item.contract_id, item.id);
      if (!result.success || !('data' in result) || !result.data?.url) {
        toast.error(t('openFailed'));
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: ContractAttachmentListItem) {
    if (!canManage) return;
    if (!window.confirm(t('deleteConfirm'))) return;
    await runOnce(async () => {
      setBusyId(item.id);
      try {
        const result = await deleteContractPdf(locale, item.contract_id, item.id);
        if (!result.success) {
          toast.error(t('deleteFailed'));
          return;
        }
        toast.success(t('deleteSuccess'));
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  async function handleSaveLink(item: ContractAttachmentListItem) {
    if (!canManage) return;
    const nextContractId = linkDrafts[item.id] ?? item.contract_id;
    if (!nextContractId || nextContractId === item.contract_id) return;

    await runOnce(async () => {
      setBusyId(item.id);
      try {
        const result = await relinkContractPdf(locale, item.id, nextContractId);
        if (!result.success) {
          const code = 'error' in result ? String(result.error) : '';
          toast.error(
            code === 'pdfDuplicate'
              ? t('errors.pdfDuplicate')
              : code === 'contractNotEditable'
                ? t('errors.contractNotEditable')
                : t('relinkFailed'),
          );
          return;
        }
        toast.success(t('relinkSuccess'));
        setLinkDrafts((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-start">
          <tr>
            <th className="px-4 py-3 font-medium">{t('fileName')}</th>
            <th className="px-4 py-3 font-medium">{t('contract')}</th>
            <th className="px-4 py-3 font-medium">{t('size')}</th>
            <th className="px-4 py-3 font-medium">{t('uploadedAt')}</th>
            <th className="px-4 py-3 font-medium">{tc('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((item) => {
            const busy = busyId === item.id || isSubmitting;
            const draftContractId = linkDrafts[item.id] ?? item.contract_id;
            const linkDirty = draftContractId !== item.contract_id;
            return (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-medium break-all">{item.original_filename}</span>
                  </div>
                </td>
                <td className="px-4 py-3 min-w-[16rem]">
                  {canManage ? (
                    <div className="space-y-2">
                      <SearchableSelect
                        value={draftContractId}
                        onChange={(value) => {
                          setLinkDrafts((current) => ({ ...current, [item.id]: value }));
                        }}
                        options={contractOptions}
                        placeholder={t('selectContract')}
                        compact
                        searchable
                        disabled={busy}
                      />
                      {linkDirty && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleSaveLink(item)}
                        >
                          {t('saveLink')}
                        </Button>
                      )}
                    </div>
                  ) : item.contract ? (
                    <Link
                      href={`/contracts/${item.contract.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {item.contract.contract_number}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatFileSize(Number(item.byte_size), loc)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(item.created_at, loc)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleOpen(item)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {t('open')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleDownload(item)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('download')}
                    </Button>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('delete')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

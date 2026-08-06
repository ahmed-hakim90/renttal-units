'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { uploadContractPdf } from '@/lib/actions/contract-attachments';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import type { ContractLinkOption } from '@/lib/repositories/contract-attachments';

type PendingUpload = {
  key: string;
  file: File;
  contractId: string;
};

function translateUploadError(
  code: string | undefined,
  t: ReturnType<typeof useTranslations<'documents'>>,
) {
  switch (code) {
    case 'pdfRequired':
      return t('errors.pdfRequired');
    case 'pdfSizeInvalid':
      return t('errors.pdfSizeInvalid');
    case 'pdfTypeInvalid':
      return t('errors.pdfTypeInvalid');
    case 'pdfContentInvalid':
      return t('errors.pdfContentInvalid');
    case 'pdfDuplicate':
      return t('errors.pdfDuplicate');
    case 'contractNotFound':
      return t('errors.contractNotFound');
    case 'pdfUploadFailed':
      return t('errors.pdfUploadFailed');
    default:
      return t('errors.pdfUploadFailed');
  }
}

export function DocumentsUploadPanel({
  locale,
  contracts,
}: {
  locale: string;
  contracts: ContractLinkOption[];
}) {
  const t = useTranslations('documents');
  const router = useRouter();
  const { isSubmitting, runOnce } = useSingleSubmit();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [sharedContractId, setSharedContractId] = useState('');

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

  function onFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next = Array.from(fileList).map((file, index) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${index}-${Date.now()}`,
      file,
      contractId: sharedContractId,
    }));
    setPending((current) => [...current, ...next]);
  }

  function removePending(key: string) {
    setPending((current) => current.filter((row) => row.key !== key));
  }

  function applySharedContractToAll() {
    if (!sharedContractId) return;
    setPending((current) => current.map((row) => ({ ...row, contractId: sharedContractId })));
  }

  async function handleUpload() {
    if (pending.length === 0) {
      toast.error(t('errors.pdfRequired'));
      return;
    }
    if (pending.some((row) => !row.contractId)) {
      toast.error(t('contractRequired'));
      return;
    }

    await runOnce(async () => {
      let successCount = 0;
      const failedKeys = new Set<string>();
      const failures: string[] = [];

      for (const row of pending) {
        const formData = new FormData();
        formData.set('file', row.file);
        const result = await uploadContractPdf(locale, row.contractId, formData);
        if (result.success) {
          successCount += 1;
        } else {
          failedKeys.add(row.key);
          failures.push(
            `${row.file.name}: ${translateUploadError(
              'error' in result ? String(result.error) : undefined,
              t,
            )}`,
          );
        }
      }

      if (successCount > 0) {
        toast.success(t('uploadSuccess', { count: successCount }));
        router.refresh();
      }
      if (failures.length > 0) {
        toast.error(failures.slice(0, 3).join('\n'));
      }
      setPending((current) => current.filter((row) => failedKeys.has(row.key)));
    });
  }

  return (
    <section className="mb-6 space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t('uploadTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('uploadHint')}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <SearchableSelect
          label={t('sharedContract')}
          value={sharedContractId}
          onChange={setSharedContractId}
          options={contractOptions}
          placeholder={t('selectContract')}
          searchable
        />
        <Button
          type="button"
          variant="outline"
          disabled={!sharedContractId || pending.length === 0 || isSubmitting}
          onClick={applySharedContractToAll}
        >
          {t('applyContractToAll')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm hover:bg-muted/40">
          <Upload className="h-4 w-4" aria-hidden />
          {t('chooseFiles')}
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            disabled={isSubmitting}
            onChange={(event) => {
              onFilesChosen(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <Button
          type="button"
          disabled={pending.length === 0 || isSubmitting}
          onClick={handleUpload}
        >
          {t('uploadSelected', { count: pending.length })}
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-start">
              <tr>
                <th className="px-3 py-2 font-medium">{t('fileName')}</th>
                <th className="px-3 py-2 font-medium">{t('linkContract')}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-3 py-2 break-all">{row.file.name}</td>
                  <td className="px-3 py-2 min-w-[16rem]">
                    <SearchableSelect
                      value={row.contractId}
                      onChange={(value) => {
                        setPending((current) => current.map((item) => (
                          item.key === row.key ? { ...item, contractId: value } : item
                        )));
                      }}
                      options={contractOptions}
                      placeholder={t('selectContract')}
                      compact
                      searchable
                      disabled={isSubmitting}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => removePending(row.key)}
                      aria-label={t('removePending')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

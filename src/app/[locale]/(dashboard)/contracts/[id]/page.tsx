import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ContractDetail } from '@/components/contracts/contract-detail';
import { getContractPdfPreviewUrl } from '@/lib/actions/contract-attachments';
import { getContract } from '@/lib/actions/contracts';

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const contract = await getContract(locale, id);
  if (!contract) notFound();

  const attachments = [...(contract.attachments ?? [])].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const selectedAttachment = attachments.find((attachment) => attachment.id === query.document)
    ?? attachments[0]
    ?? null;
  const previewResult = selectedAttachment
    ? await getContractPdfPreviewUrl(locale, contract.id, selectedAttachment.id)
    : null;

  return (
    <ContractDetail
      contract={contract}
      selectedAttachment={selectedAttachment}
      previewUrl={previewResult?.success ? previewResult.data?.url ?? null : null}
      locale={locale}
    />
  );
}

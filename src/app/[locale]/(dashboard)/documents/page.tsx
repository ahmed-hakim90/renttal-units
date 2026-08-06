import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { DocumentsTable } from '@/components/documents/documents-table';
import { DocumentsUploadPanel } from '@/components/documents/documents-upload-panel';
import { ListPagination } from '@/components/ui/list-pagination';
import {
  getContractAttachmentsPage,
  listContractLinkOptions,
} from '@/lib/actions/contract-attachments';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { parseListPage } from '@/lib/pagination/list-page';

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: rawPage } = await searchParams;
  setRequestLocale(locale);
  const auth = await requirePermission(locale, 'contracts.view', {
    correlation_id: await getCorrelationId(),
  });
  const t = await getTranslations('documents');
  const canManage = hasPermission(auth, 'contracts.update');
  const page = parseListPage(rawPage);
  const [attachmentsPage, contractOptions] = await Promise.all([
    getContractAttachmentsPage(locale, { page }),
    listContractLinkOptions(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {canManage && (
        <DocumentsUploadPanel locale={locale} contracts={contractOptions} />
      )}
      <DocumentsTable
        attachments={attachmentsPage.items}
        locale={locale}
        contracts={contractOptions}
        canManage={canManage}
      />
      <ListPagination
        page={attachmentsPage.page}
        totalPages={attachmentsPage.totalPages}
        total={attachmentsPage.total}
      />
    </div>
  );
}

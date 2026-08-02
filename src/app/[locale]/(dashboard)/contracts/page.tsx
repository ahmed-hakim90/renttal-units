import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractsManager } from '@/components/contracts/contracts-manager';
import { ListPagination } from '@/components/ui/list-pagination';
import { getContracts, getContractsPage } from '@/lib/actions/contracts';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { parseListPage } from '@/lib/pagination/list-page';

export default async function ContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; expiring?: string; status?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'contracts.view', ctx);
  const t = await getTranslations('contracts');

  const needsFullList = query.expiring === '30' || query.status === 'draft';
  const page = parseListPage(query.page);
  const contractsPage = needsFullList
    ? null
    : await getContractsPage(locale, { page });
  const contracts = needsFullList
    ? await getContracts(locale)
    : contractsPage!.items;

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ContractsManager
        contracts={contracts}
        locale={locale}
        canEdit={canMutateModule(auth, 'contracts')}
        canDeleteDraft={canMutateModule(auth, 'contracts')}
      />
      {contractsPage && (
        <ListPagination
          page={contractsPage.page}
          totalPages={contractsPage.totalPages}
          total={contractsPage.total}
        />
      )}
    </div>
  );
}

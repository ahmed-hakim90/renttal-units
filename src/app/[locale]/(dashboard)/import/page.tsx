import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { ImportUnitsClient } from '@/components/import/import-units-client';
import { ImportContractsClient } from '@/components/import/import-contracts-client';
import { ImportOdooCenterClient } from '@/components/import/import-odoo-center-client';
import { ImportLogsHistory } from '@/components/import/import-logs-history';
import { getImportLogs } from '@/lib/actions/admin';
import { getUnits } from '@/lib/actions/units';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'imports.manage', ctx);
  const tu = await getTranslations('units');
  const [units, featureFlags, importLogs] = await Promise.all([
    getUnits(locale),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
    getImportLogs(locale),
  ]);

  const showOdooImport = featureFlags.odoo_import_center && hasPermission(auth, 'odoo.manage');
  const showUnitsImport = featureFlags.master_data_mutations;
  const showContractsImport = featureFlags.import_excel_contracts;

  if (!showOdooImport && !showUnitsImport && !showContractsImport) {
    redirect({ href: '/dashboard', locale });
  }

  return (
    <div className="space-y-10">
      {showOdooImport && (
        <div id="odoo-import-center" className="scroll-mt-24">
          <PageHeader title={tu('odooImportCenter')} />
          <ImportOdooCenterClient locale={locale} units={units} />
        </div>
      )}
      {showUnitsImport && (
        <div id="import-units" className="scroll-mt-24">
          <h2 className="mb-4 text-xl font-semibold">{tu('importUnits')}</h2>
          <ImportUnitsClient locale={locale} canEdit={canMutateModule(auth, 'units')} />
        </div>
      )}
      {showContractsImport && (
        <div id="import-contracts" className="scroll-mt-24">
          <h2 className="mb-4 text-xl font-semibold">{tu('importContracts')}</h2>
          <ImportContractsClient locale={locale} canEdit={canMutateModule(auth, 'contracts')} />
        </div>
      )}
      <ImportLogsHistory logs={importLogs} locale={locale} />
    </div>
  );
}

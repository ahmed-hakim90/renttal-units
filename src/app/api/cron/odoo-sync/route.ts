import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { odooImportRepository } from '@/lib/repositories/odoo-import';
import { odooImportService } from '@/lib/odoo/import-service';
import { odooOutboxService } from '@/lib/odoo/outbox-service';
import { odooService } from '@/lib/odoo/service';
import { withSystemDataAccess } from '@/lib/supabase/system-context';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { logger } from '@/lib/observability';
import type { AuthContext } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 300;

const systemAuth: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  email: 'odoo-cron@system.local',
  role: 'admin_editor',
  roleId: '00000000-0000-0000-0000-000000000000',
  roleSlug: 'admin_editor',
  roleNameEn: 'System',
  roleNameAr: 'النظام',
  permissions: [
    'locations.view', 'locations.create', 'locations.update', 'locations.delete',
    'units.view', 'units.create', 'units.update', 'units.delete',
    'tenants.view', 'tenants.create', 'tenants.update', 'tenants.delete',
    'contracts.view', 'contracts.create', 'contracts.update', 'contracts.delete',
    'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete',
    'payments.view', 'payments.record',
    'reports.view', 'reports.export',
    'imports.manage', 'odoo.manage',
    'users.manage', 'roles.manage',
    'settings.manage', 'feature_flags.manage',
    'audit.view',
  ],
  isAdminEditor: true,
  mustChangePassword: false,
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = {
    correlation_id: request.headers.get('x-correlation-id') ?? randomUUID(),
    service: 'odoo-cron',
    system: true,
  };

  try {
    const result = await withSystemDataAccess(async () => {
      const flags = await loadFeatureFlags(ctx);
      if (!flags.odoo_cron_sync) {
        logger.info('Odoo cron sync skipped because feature flag is disabled', {
          ...ctx,
          feature_flag: 'odoo_cron_sync',
        });
        return {
          skipped: true,
          reason: 'Odoo cron sync disabled by feature flag',
        };
      }

      const outbound = await odooOutboxService.processReady(systemAuth, ctx, 25);
      const linkedInvoices = await odooService.syncLinkedInvoices(systemAuth, ctx, 250);
      const latestWriteDate = await odooImportRepository.findLatestDocumentWriteDate(ctx);

      if (!latestWriteDate) {
        return {
          outbound,
          linkedInvoices,
          inbound: {
            skipped: true,
            reason: 'Initial Odoo import requires an admin preview and approval',
          },
        };
      }

      const preview = await odooImportService.startIncrementalPreview(systemAuth, ctx);
      const committed = preview.documents.length > 0
        ? await odooImportService.commitInvoiceImport(
            systemAuth,
            preview.runId,
            preview.documents.map((document) => document.itemId),
            ctx,
            { createContracts: false },
          )
        : { importedCount: 0, contractCount: 0, errors: [] };

      return {
        outbound,
        linkedInvoices,
        inbound: {
          skipped: false,
          runId: preview.runId,
          documentCount: preview.documents.length,
          ...committed,
        },
      };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Odoo cron sync failed', { ...ctx, error: message });
    return NextResponse.json({ ok: false, error: 'Odoo sync failed' }, { status: 500 });
  }
}

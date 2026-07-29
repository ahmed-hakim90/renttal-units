import 'server-only';

import { odooImportRepository } from '@/lib/repositories/odoo-import';
import { odooService } from '@/lib/odoo/service';
import type { AuthContext, OdooOutboxItem } from '@/types/database';
import type { LogContext } from '@/lib/observability';

function retryAt(attempts: number) {
  const delayMinutes = Math.min(2 ** Math.max(attempts - 1, 0), 60);
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

const MAX_OUTBOX_ATTEMPTS = 8;

async function processItem(auth: AuthContext, item: OdooOutboxItem, ctx: LogContext) {
  // claim_odoo_outbox_batch already marked the row processing; bump attempts here.
  const attempts = item.attempts + 1;
  await odooImportRepository.updateOutbox(item.id, {
    attempts,
    last_error: null,
  }, ctx);

  try {
    if (item.operation !== 'sync_invoice' || !item.entity_id) {
      throw new Error(`Unsupported Odoo outbox operation: ${item.operation}`);
    }
    const result = await odooService.syncInvoice(auth, item.entity_id, ctx);
    if (!result.success) throw new Error(result.error ?? 'Odoo invoice sync needs review');
    await odooImportRepository.updateOutbox(item.id, {
      status: 'succeeded',
      processed_at: new Date().toISOString(),
      last_error: null,
    }, ctx);
    return { id: item.id, success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Odoo sync failed';
    const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS;
    await odooImportRepository.updateOutbox(item.id, {
      status: 'failed',
      last_error: message,
      available_at: exhausted
        ? new Date(Date.now() + 24 * 60 * 60_000).toISOString()
        : retryAt(attempts),
    }, ctx);
    return { id: item.id, success: false as const, error: message };
  }
}

export const odooOutboxService = {
  async enqueueInvoice(auth: AuthContext, invoiceId: string, ctx: LogContext) {
    return odooImportRepository.enqueueOutbox({
      operation: 'sync_invoice',
      entity_type: 'invoice',
      entity_id: invoiceId,
      idempotency_key: `sync_invoice:${invoiceId}`,
      payload: { invoiceId },
      created_by: auth.userId,
    }, ctx);
  },

  async enqueueAndProcessInvoice(auth: AuthContext, invoiceId: string, ctx: LogContext) {
    const item = await this.enqueueInvoice(auth, invoiceId, ctx);
    return processItem(auth, item, ctx);
  },

  async processReady(auth: AuthContext, ctx: LogContext, limit = 10) {
    const items = await odooImportRepository.findReadyOutbox(Math.min(Math.max(limit, 1), 50), ctx);
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const item of items) {
      results.push(await processItem(auth, item, ctx));
    }

    return results;
  },
};

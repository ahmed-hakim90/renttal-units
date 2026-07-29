import 'server-only';

import { xmlRpcCall, type XmlRpcValue } from '@/lib/odoo/xml-rpc';
import { collectPaginated } from '@/lib/odoo/pagination';
import { assertOdooConfigured, type OdooSettings } from '@/lib/odoo/settings';

export type OdooDomain = XmlRpcValue[];
export type OdooRecord = Record<string, unknown> & { id: number };

function assertRecordArray(model: string, method: string, value: unknown): OdooRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`Odoo ${model}.${method} returned ${typeof value}; expected a record list`);
  }
  return value.filter((record): record is OdooRecord => (
    Boolean(record)
    && typeof record === 'object'
    && typeof (record as { id?: unknown }).id === 'number'
  ));
}

export class OdooClient {
  private uid: number | null = null;

  constructor(private readonly settings: OdooSettings) {}

  private commonEndpoint() {
    return `${this.settings.url}/xmlrpc/2/common`;
  }

  private objectEndpoint() {
    return `${this.settings.url}/xmlrpc/2/object`;
  }

  async authenticate() {
    assertOdooConfigured(this.settings);
    if (this.uid) return this.uid;
    const uid = await xmlRpcCall<number | false>(this.commonEndpoint(), 'authenticate', [
      this.settings.database,
      this.settings.username,
      this.settings.apiKey,
      {},
    ]);
    if (!uid) throw new Error('Odoo authentication failed');
    this.uid = uid;
    return uid;
  }

  async getUid() {
    return this.authenticate();
  }

  async executeKw<T = unknown>(model: string, method: string, args: XmlRpcValue[] = [], kwargs: Record<string, XmlRpcValue> = {}) {
    const uid = await this.authenticate();
    try {
      return await xmlRpcCall<T>(this.objectEndpoint(), 'execute_kw', [
        this.settings.database,
        uid,
        this.settings.apiKey,
        model,
        method,
        args,
        kwargs,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Odoo ${model}.${method}: ${message}`, { cause: error });
    }
  }

  async searchRead(
    model: string,
    domain: OdooDomain,
    fields: string[],
    limit = 20,
    offset = 0,
    order = 'id asc',
  ) {
    const value = await this.executeKw<unknown>(model, 'search_read', [domain], {
      fields,
      limit,
      offset,
      order,
    });
    return assertRecordArray(model, 'search_read', value);
  }

  async searchReadAll(
    model: string,
    domain: OdooDomain,
    fields: string[],
    options?: { pageSize?: number; maxRecords?: number; order?: string },
  ) {
    return collectPaginated(
      (offset, limit) => this.searchRead(
        model,
        domain,
        fields,
        limit,
        offset,
        options?.order ?? 'id asc',
      ),
      options,
    );
  }

  async create(model: string, values: Record<string, XmlRpcValue>) {
    return this.executeKw<number>(model, 'create', [values]);
  }

  async write(model: string, ids: number[], values: Record<string, XmlRpcValue>) {
    return this.executeKw<boolean>(model, 'write', [ids, values]);
  }

  async unlink(model: string, ids: number[]) {
    return this.executeKw<boolean>(model, 'unlink', [ids]);
  }

  async read(model: string, ids: number[], fields: string[]) {
    const value = await this.executeKw<unknown>(model, 'read', [ids], { fields });
    return assertRecordArray(model, 'read', value);
  }

  async fieldsGet(model: string, fields?: string[]) {
    const kwargs: Record<string, XmlRpcValue> = fields && fields.length > 0
      ? { attributes: ['string', 'type'] }
      : {};
    const args = fields && fields.length > 0 ? [fields] as XmlRpcValue[] : [];
    return this.executeKw<Record<string, { string?: string; type?: string }>>(model, 'fields_get', args, kwargs);
  }
}

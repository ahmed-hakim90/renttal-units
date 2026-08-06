import { createClient } from '@/lib/supabase/server';
import type { ContractAttachment } from '@/types/database';
import type { LogContext } from '@/lib/observability';
import {
  DEFAULT_LIST_PAGE_SIZE,
  listPageRange,
  MAX_UNBOUNDED_LIST_ROWS,
  toListPageResult,
  type ListPageResult,
} from '@/lib/pagination/list-page';

export type ContractAttachmentListItem = ContractAttachment & {
  contract?: {
    id: string;
    contract_number: string;
    status: string;
  } | null;
};

export type ContractLinkOption = {
  id: string;
  contract_number: string;
  status: string;
  tenantName: string | null;
};

export const contractAttachmentsRepository = {
  async findPage(
    _ctx: LogContext,
    filters?: { page?: number; pageSize?: number },
  ): Promise<ListPageResult<ContractAttachmentListItem>> {
    const { page, pageSize, from, to } = listPageRange(
      filters?.page ?? 1,
      filters?.pageSize ?? DEFAULT_LIST_PAGE_SIZE,
    );
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from('contract_attachments')
      .select('*, contract:contracts(id, contract_number, status)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return toListPageResult((data ?? []) as ContractAttachmentListItem[], count, page, pageSize);
  },

  async listContractLinkOptions(_ctx: LogContext): Promise<ContractLinkOption[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select('id, contract_number, status, tenant:tenants(full_name)')
      .in('status', ['active', 'draft'])
      .order('contract_number', { ascending: true })
      .limit(MAX_UNBOUNDED_LIST_ROWS);
    if (error) throw error;

    return (data ?? []).map((row) => {
      const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
      return {
        id: String(row.id),
        contract_number: String(row.contract_number),
        status: String(row.status),
        tenantName: (tenant as { full_name?: string | null } | null | undefined)?.full_name ?? null,
      };
    });
  },
};

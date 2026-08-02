import { createClient } from '@/lib/supabase/server';
import type {
  Contract,
  ContractCancellationHandling,
  ContractLineInput,
  ContractPaymentCondition,
  ContractTaxMode,
  OdooSyncStatus,
  PaymentCycle,
} from '@/types/database';
import type { LogContext } from '@/lib/observability';
import {
  DEFAULT_LIST_PAGE_SIZE,
  listPageRange,
  MAX_UNBOUNDED_LIST_ROWS,
  toListPageResult,
  type ListPageResult,
} from '@/lib/pagination/list-page';

const CONTRACT_SELECT = '*, unit:units(*, location:locations(*)), tenant:tenants(*), invoices(*, lines:invoice_lines(*)), lines:contract_lines(*, unit:units(*, location:locations(*))), attachments:contract_attachments(*)';

function toRpcLines(lines: ContractLineInput[]) {
  return lines.map((line, index) => {
    const amountBasis = line.amount_basis === 'annual_untaxed'
      ? 'annual_untaxed'
      : 'contract_total_inclusive';
    return {
      lineType: line.line_type,
      unitId: line.unit_id ?? null,
      description: line.description ?? null,
      amount: line.amount,
      amountBasis,
      annualAmountUntaxed: amountBasis === 'annual_untaxed'
        ? (line.annual_amount_untaxed ?? null)
        : null,
      periodStart: line.period_start ?? null,
      periodEnd: line.period_end ?? null,
      odooLineId: line.odoo_line_id ?? null,
      odooProductId: line.odoo_product_id ?? null,
      odooProductName: line.odoo_product_name ?? null,
      taxRate: line.tax_rate ?? 0,
      taxTreatment: line.tax_treatment ?? 'standard',
      sortOrder: line.sort_order ?? index,
    };
  });
}

function sortContract(contract: Contract): Contract {
  return {
    ...contract,
    lines: [...(contract.lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export const contractsRepository = {
  async createWithScheduleAtomic(input: {
    contract: {
      unitId: string;
      contractNumber: string;
      startDate: string;
      endDate: string;
      totalAmount: number;
      paymentCycle: PaymentCycle;
      taxMode: ContractTaxMode;
      paidThroughDate: string | null;
      openingPaidAmount: number;
      openingPaymentDate: string | null;
      openingNotes: string | null;
      openingBalanceTotal: number;
      odooTrackingStartDate: string | null;
      historicalLastPaymentAmount: number | null;
      historicalLastPaymentReference: string | null;
      notes: string | null;
    };
    tenant: {
      fullName: string;
      phone: string | null;
      email: string | null;
      nationalId: string | null;
      odooPartnerId: number | null;
      vat: string | null;
      street: string | null;
      city: string | null;
      countryCode: string | null;
    };
    schedule: Array<{
      periodStart: string;
      periodEnd: string;
      amount: number;
      amountUntaxed: number;
      amountTax: number;
      amountTotal: number;
      paidAmount: number;
      status: string;
      dueDate: string;
      lineItems: Array<{
        contractLineId: string | null;
        lineType: 'rental' | 'service';
        unitId: string | null;
        description: string;
        odooProductId: number | null;
        odooProductName: string | null;
        amountUntaxed: number;
        taxRate: number;
        taxTreatment?: 'standard' | 'zero_rated';
        amountTax: number;
        amountTotal: number;
        sortOrder: number;
      }>;
    }>;
    lines?: ContractLineInput[];
    paymentConditions: ContractPaymentCondition[];
  }, ctx: LogContext): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('create_contract_with_conditions_atomic', {
      p_contract: input.contract,
      p_tenant: input.tenant,
      p_schedule: input.schedule,
      p_lines: input.lines ? toRpcLines(input.lines) : null,
      p_payment_conditions: input.paymentConditions,
    });
    if (error) throw error;
    if (!data) throw new Error('Contract was not created');
    const hydrated = await this.findById((data as Contract).id, ctx);
    return hydrated ?? sortContract(data as Contract);
  },

  async replaceLinesAtomic(
    contractId: string,
    lines: ContractLineInput[],
    ctx: LogContext,
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc('replace_contract_lines', {
      p_contract_id: contractId,
      p_lines: toRpcLines(lines),
    });
    if (error) throw error;
  },

  async findAll(ctx: LogContext): Promise<Contract[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .order('created_at', { ascending: false })
      .limit(MAX_UNBOUNDED_LIST_ROWS);
    if (error) throw error;
    return (data ?? []).map((row) => sortContract(row as Contract));
  },

  async findPage(
    ctx: LogContext,
    filters?: { page?: number; pageSize?: number },
  ): Promise<ListPageResult<Contract>> {
    const { page, pageSize, from, to } = listPageRange(
      filters?.page ?? 1,
      filters?.pageSize ?? DEFAULT_LIST_PAGE_SIZE,
    );
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const items = (data ?? []).map((row) => sortContract(row as Contract));
    return toListPageResult(items, count, page, pageSize);
  },

  async findById(id: string, ctx: LogContext): Promise<Contract | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? sortContract(data as Contract) : null;
  },

  async findByContractNumber(contractNumber: string, ctx: LogContext): Promise<Contract | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('contract_number', contractNumber)
      .maybeSingle();
    if (error) throw error;
    return data ? sortContract(data as Contract) : null;
  },

  async findActiveByUnitId(unitId: string, ctx: LogContext): Promise<Contract | null> {
    const supabase = await createClient();
    const { data: lineRows, error: lineError } = await supabase
      .from('contract_lines')
      .select('contract_id, contract:contracts!inner(*)')
      .eq('unit_id', unitId)
      .eq('line_type', 'rental')
      .eq('contract.status', 'active')
      .limit(1);
    if (lineError) throw lineError;
    const lineContractId = lineRows?.[0]?.contract_id as string | undefined;
    if (lineContractId) {
      return this.findById(lineContractId, ctx);
    }

    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return data ? sortContract(data as Contract) : null;
  },

  async findByUnitId(unitId: string, ctx: LogContext): Promise<Contract[]> {
    const supabase = await createClient();
    const { data: lineRows, error: lineError } = await supabase
      .from('contract_lines')
      .select('contract_id')
      .eq('unit_id', unitId)
      .eq('line_type', 'rental');
    if (lineError) throw lineError;
    const lineContractIds = Array.from(new Set((lineRows ?? []).map((row) => row.contract_id as string)));

    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .or(
        lineContractIds.length > 0
          ? `unit_id.eq.${unitId},id.in.(${lineContractIds.join(',')})`
          : `unit_id.eq.${unitId}`,
      )
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => sortContract(row as Contract));
  },

  async findActive(ctx: LogContext): Promise<Contract[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('status', 'active');
    if (error) throw error;
    return (data ?? []).map((row) => sortContract(row as Contract));
  },

  async getSummaryStats(ctx: LogContext): Promise<{
    totalCount: number;
    totalValue: number;
    activeCount: number;
    draftCount: number;
  }> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('contracts').select('total_amount, status');
    if (error) throw error;
    const rows = data ?? [];
    return {
      totalCount: rows.length,
      totalValue: rows.reduce((sum, row) => sum + Number(row.total_amount), 0),
      activeCount: rows.filter((row) => row.status === 'active').length,
      draftCount: rows.filter((row) => row.status === 'draft').length,
    };
  },

  async create(input: {
    unit_id: string;
    contract_number: string;
    tenant_id?: string | null;
    start_date: string;
    end_date: string;
    total_amount: number;
    payment_cycle: PaymentCycle;
    tax_mode?: ContractTaxMode;
    status?: 'draft' | 'active' | 'cancelled' | 'completed';
    notes?: string | null;
  }, ctx: LogContext): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        ...input,
        notes: input.notes ?? null,
      })
      .select(CONTRACT_SELECT)
      .single();
    if (error) throw error;
    return sortContract(data as Contract);
  },

  async cancel(
    id: string,
    input: {
      cancellation_date: string;
      cancellation_handling: ContractCancellationHandling;
    },
    ctx: LogContext
  ): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc('cancel_contract_atomic', {
        p_contract_id: id,
        p_cancellation_date: input.cancellation_date,
        p_cancellation_handling: input.cancellation_handling,
      })
      .single();
    if (error) throw error;
    return sortContract(data as Contract);
  },

  async update(
    id: string,
    input: {
      contract_number?: string;
      tenant_id?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      total_amount?: number;
      payment_cycle?: PaymentCycle;
      tax_mode?: ContractTaxMode;
      odoo_sync_status?: OdooSyncStatus;
      odoo_sync_error?: string | null;
      notes?: string | null;
      status?: 'draft' | 'active' | 'cancelled' | 'completed';
      unit_id?: string | null;
      payment_conditions?: ContractPaymentCondition[];
      paid_through_date?: string | null;
      opening_paid_amount?: number | null;
      opening_payment_date?: string | null;
      opening_notes?: string | null;
      opening_balance_total?: number | null;
      odoo_tracking_start_date?: string | null;
      historical_last_payment_amount?: number | null;
      historical_last_payment_reference?: string | null;
    },
    ctx: LogContext
  ): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .update(input)
      .eq('id', id)
      .select(CONTRACT_SELECT)
      .single();
    if (error) throw error;
    return sortContract(data as Contract);
  },

  async markCompleted(ids: string[], ctx: LogContext): Promise<void> {
    if (ids.length === 0) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'completed' })
      .in('id', ids)
      .eq('status', 'active');
    if (error) throw error;
  },

  async saveDraftAtomic(input: {
    contractId?: string | null;
    contract: {
      contractNumber: string;
      startDate: string | null;
      endDate: string | null;
      paymentCycle: PaymentCycle;
      taxMode: ContractTaxMode;
      paidThroughDate: string | null;
      openingPaidAmount: number;
      openingPaymentDate: string | null;
      openingNotes: string | null;
      openingBalanceTotal: number;
      odooTrackingStartDate: string | null;
      historicalLastPaymentAmount: number | null;
      historicalLastPaymentReference: string | null;
      notes: string | null;
    };
    tenant: {
      fullName: string | null;
      phone: string | null;
      email: string | null;
      nationalId: string | null;
      odooPartnerId: number | null;
      vat: string | null;
      street: string | null;
      city: string | null;
      countryCode: string | null;
    } | null;
    lines?: ContractLineInput[];
    paymentConditions: ContractPaymentCondition[];
  }, ctx: LogContext): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('save_contract_draft_with_conditions_atomic', {
      p_contract_id: input.contractId ?? null,
      p_contract: {
        contractNumber: input.contract.contractNumber,
        startDate: input.contract.startDate,
        endDate: input.contract.endDate,
        paymentCycle: input.contract.paymentCycle,
        taxMode: input.contract.taxMode,
        paidThroughDate: input.contract.paidThroughDate,
        openingPaidAmount: input.contract.openingPaidAmount,
        openingPaymentDate: input.contract.openingPaymentDate,
        openingNotes: input.contract.openingNotes,
        openingBalanceTotal: input.contract.openingBalanceTotal,
        odooTrackingStartDate: input.contract.odooTrackingStartDate,
        historicalLastPaymentAmount: input.contract.historicalLastPaymentAmount,
        historicalLastPaymentReference: input.contract.historicalLastPaymentReference,
        notes: input.contract.notes,
      },
      p_tenant: input.tenant
        ? {
            fullName: input.tenant.fullName,
            phone: input.tenant.phone,
            email: input.tenant.email,
            nationalId: input.tenant.nationalId,
            odooPartnerId: input.tenant.odooPartnerId,
            vat: input.tenant.vat,
            street: input.tenant.street,
            city: input.tenant.city,
            countryCode: input.tenant.countryCode,
          }
        : {},
      p_lines: input.lines ? toRpcLines(input.lines) : [],
      p_payment_conditions: input.paymentConditions,
    });
    if (error) throw error;
    if (!data) throw new Error('Draft was not saved');
    const hydrated = await this.findById((data as Contract).id, ctx);
    return hydrated ?? sortContract(data as Contract);
  },

  async activateDraftAtomic(input: {
    contractId: string;
    contract: {
      contractNumber: string;
      startDate: string;
      endDate: string;
      totalAmount: number;
      paymentCycle: PaymentCycle;
      taxMode: ContractTaxMode;
      paidThroughDate: string | null;
      openingPaidAmount: number;
      openingPaymentDate: string | null;
      openingNotes: string | null;
      openingBalanceTotal: number;
      odooTrackingStartDate: string | null;
      historicalLastPaymentAmount: number | null;
      historicalLastPaymentReference: string | null;
      notes: string | null;
    };
    tenant: {
      fullName: string;
      phone: string | null;
      email: string | null;
      nationalId: string | null;
      odooPartnerId: number | null;
      vat: string | null;
      street: string | null;
      city: string | null;
      countryCode: string | null;
    };
    schedule: Array<{
      periodStart: string;
      periodEnd: string;
      amount: number;
      amountUntaxed: number;
      amountTax: number;
      amountTotal: number;
      paidAmount: number;
      status: string;
      dueDate: string;
      lineItems: Array<{
        contractLineId: string | null;
        lineType: 'rental' | 'service';
        unitId: string | null;
        description: string;
        odooProductId: number | null;
        odooProductName: string | null;
        amountUntaxed: number;
        taxRate: number;
        taxTreatment?: 'standard' | 'zero_rated';
        amountTax: number;
        amountTotal: number;
        sortOrder: number;
      }>;
    }>;
    lines: ContractLineInput[];
    paymentConditions: ContractPaymentCondition[];
  }, ctx: LogContext): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('activate_contract_draft_with_conditions_atomic', {
      p_contract_id: input.contractId,
      p_contract: {
        contractNumber: input.contract.contractNumber,
        startDate: input.contract.startDate,
        endDate: input.contract.endDate,
        totalAmount: input.contract.totalAmount,
        paymentCycle: input.contract.paymentCycle,
        taxMode: input.contract.taxMode,
        paidThroughDate: input.contract.paidThroughDate,
        openingPaidAmount: input.contract.openingPaidAmount,
        openingPaymentDate: input.contract.openingPaymentDate,
        openingNotes: input.contract.openingNotes,
        openingBalanceTotal: input.contract.openingBalanceTotal,
        odooTrackingStartDate: input.contract.odooTrackingStartDate,
        historicalLastPaymentAmount: input.contract.historicalLastPaymentAmount,
        historicalLastPaymentReference: input.contract.historicalLastPaymentReference,
        notes: input.contract.notes,
      },
      p_tenant: {
        fullName: input.tenant.fullName,
        phone: input.tenant.phone,
        email: input.tenant.email,
        nationalId: input.tenant.nationalId,
        odooPartnerId: input.tenant.odooPartnerId,
        vat: input.tenant.vat,
        street: input.tenant.street,
        city: input.tenant.city,
        countryCode: input.tenant.countryCode,
      },
      p_schedule: input.schedule,
      p_lines: toRpcLines(input.lines),
      p_payment_conditions: input.paymentConditions,
    });
    if (error) throw error;
    if (!data) throw new Error('Draft was not activated');
    const hydrated = await this.findById((data as Contract).id, ctx);
    return hydrated ?? sortContract(data as Contract);
  },

  async deleteDraftAtomic(contractId: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc('delete_contract_draft_atomic', {
      p_contract_id: contractId,
    });
    if (error) throw error;
  },
};

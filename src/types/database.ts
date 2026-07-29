export type UserRole = 'admin_editor' | 'viewer';
export type PaymentCycle = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';
export type InvoiceStatus = 'due' | 'invoice_issued' | 'partially_paid' | 'fully_paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'other';
export type ContractStatus = 'draft' | 'active' | 'cancelled' | 'completed';
export type ContractCancellationHandling = 'keep_current_full' | 'prorate_current';
export type OdooSyncStatus = 'not_synced' | 'local_only' | 'synced' | 'failed' | 'needs_review';
export type ContractTaxMode = 'taxable' | 'non_taxable';
export type ContractLineType = 'rental' | 'service';
export type OdooImportRunStatus = 'previewing' | 'ready' | 'committing' | 'completed' | 'failed';
export type OdooImportItemStatus = 'ready' | 'needs_review' | 'duplicate' | 'imported' | 'failed' | 'ignored';
export type OdooLineMappingStatus = 'matched' | 'unmatched' | 'needs_review' | 'service';
export type OdooOutboxStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  role_id: string;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  assigned_role?: RoleSummary | null;
}

export interface RoleSummary {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  is_system: boolean;
  is_system_owner: boolean;
  created_at: string;
  updated_at: string;
  permission_keys?: string[];
  user_count?: number;
}

export interface Location {
  id: string;
  name_en: string;
  name_ar: string;
  address: string | null;
  city: string | null;
  region: string | null;
  odoo_analytic_account_id: number | null;
  odoo_analytic_account_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  odoo_partner_id: number | null;
  vat: string | null;
  street: string | null;
  city: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  location_id: string;
  unit_number: string;
  floor: string | null;
  area_sqm: number | null;
  monthly_rent: number | null;
  payment_cycle: PaymentCycle;
  rent_start_date: string | null;
  rent_end_date: string | null;
  status: UnitStatus;
  tenant_id: string | null;
  odoo_product_id: number | null;
  odoo_product_reference: string | null;
  odoo_product_name: string | null;
  odoo_product_display_name: string | null;
  odoo_product_description: string | null;
  odoo_product_category_id: number | null;
  odoo_product_category_name: string | null;
  odoo_sync_status: OdooSyncStatus;
  odoo_last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  location?: Location;
  tenant?: Tenant;
  active_contract?: Contract | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  contract_id: string | null;
  unit_id: string;
  tenant_id: string | null;
  period_start: string;
  period_end: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  due_date: string;
  issued_at: string | null;
  notes: string | null;
  odoo_invoice_id: number | null;
  odoo_invoice_name: string | null;
  odoo_invoice_state: string | null;
  odoo_sync_status: OdooSyncStatus;
  odoo_sync_error: string | null;
  created_at: string;
  updated_at: string;
  contract?: Contract;
  unit?: Unit;
  tenant?: Tenant;
  payments?: Payment[];
  lines?: InvoiceLine[];
}

export interface ContractLine {
  id: string;
  contract_id: string;
  line_type: ContractLineType;
  unit_id: string | null;
  description: string | null;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  odoo_line_id: number | null;
  odoo_product_id: number | null;
  odoo_product_name: string | null;
  tax_rate: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  unit?: Unit | null;
}

export interface Contract {
  id: string;
  /** Primary rental unit (first rental line). Kept for compatibility. Null on incomplete drafts. */
  unit_id: string | null;
  contract_number: string;
  tenant_id: string | null;
  start_date: string | null;
  end_date: string | null;
  total_amount: number;
  payment_cycle: PaymentCycle;
  tax_mode: ContractTaxMode;
  status: ContractStatus;
  odoo_sync_status: OdooSyncStatus;
  odoo_sync_error: string | null;
  cancelled_at: string | null;
  cancellation_date: string | null;
  cancellation_handling: ContractCancellationHandling | null;
  paid_through_date: string | null;
  opening_paid_amount: number;
  opening_payment_date: string | null;
  opening_notes: string | null;
  opening_balance_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  unit?: Unit | null;
  tenant?: Tenant | null;
  invoices?: Invoice[];
  lines?: ContractLine[];
  attachments?: ContractAttachment[];
}

export type ContractLineInput = {
  line_type: ContractLineType;
  unit_id?: string | null;
  description?: string | null;
  amount: number;
  period_start?: string | null;
  period_end?: string | null;
  odoo_line_id?: number | null;
  odoo_product_id?: number | null;
  odoo_product_name?: string | null;
  tax_rate?: number;
  sort_order?: number;
};

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  contract_line_id: string | null;
  line_type: ContractLineType;
  unit_id: string | null;
  description: string;
  odoo_product_id: number | null;
  odoo_product_name: string | null;
  quantity: number;
  amount_untaxed: number;
  tax_rate: number;
  amount_tax: number;
  amount_total: number;
  period_start: string;
  period_end: string;
  sort_order: number;
  created_at: string;
}

export interface ContractAttachment {
  id: string;
  contract_id: string;
  storage_path: string;
  original_filename: string;
  content_type: 'application/pdf';
  byte_size: number;
  sha256: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  invoice?: Invoice;
}

export interface ImportLog {
  id: string;
  file_name: string;
  total_rows: number;
  success_count: number;
  error_count: number;
  errors: ImportError[];
  imported_by: string | null;
  created_at: string;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export type AuditLogDisplayValue = string | number | boolean | null;

export interface AuditLogChange {
  field: string;
  old_value: AuditLogDisplayValue;
  new_value: AuditLogDisplayValue;
}

export interface AuditLogReadModel extends AuditLog {
  actor: {
    full_name: string | null;
    email: string;
  } | null;
  changes: AuditLogChange[];
}

export interface AuditLogPage {
  items: AuditLogReadModel[];
  page: number;
  page_size: number;
  total: number;
  page_count: number;
}

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface OdooSyncLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  status: OdooSyncStatus;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface OdooImportRun {
  id: string;
  import_type: 'invoices' | 'products' | 'partners' | 'incremental_sync';
  status: OdooImportRunStatus;
  cursor: Record<string, unknown>;
  summary: Record<string, unknown>;
  error: string | null;
  requested_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OdooImportItem {
  id: string;
  run_id: string;
  item_type: 'invoice_document' | 'contract_group' | 'product' | 'partner';
  odoo_model: string;
  odoo_record_id: number;
  status: OdooImportItemStatus;
  payload: Record<string, unknown>;
  mapping: Record<string, unknown>;
  errors: string[];
  imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OdooInvoiceDocument {
  id: string;
  odoo_invoice_id: number;
  company_odoo_id: number | null;
  partner_odoo_id: number | null;
  tenant_id: string | null;
  invoice_name: string;
  reference: string | null;
  move_type: string;
  move_state: string;
  payment_state: string | null;
  currency_code: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  amount_residual: number;
  amount_paid: number;
  odoo_write_date: string | null;
  raw_payload: Record<string, unknown> | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  tenant?: Tenant | null;
  lines?: OdooInvoiceLine[];
  payments?: OdooInvoicePayment[];
}

export interface OdooInvoiceLine {
  id: string;
  document_id: string;
  odoo_line_id: number;
  product_odoo_id: number | null;
  unit_id: string | null;
  contract_id: string | null;
  local_invoice_id: string | null;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  analytic_distribution: Record<string, number> | null;
  tax_ids: number[];
  is_rental: boolean;
  mapping_status: OdooLineMappingStatus;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
  unit?: Unit | null;
  contract?: Contract | null;
}

export interface OdooInvoicePayment {
  id: string;
  document_id: string;
  odoo_partial_reconcile_id: number | null;
  odoo_payment_id: number | null;
  payment_date: string | null;
  amount: number;
  currency_code: string | null;
  reference: string | null;
  raw_payload: Record<string, unknown> | null;
  last_synced_at: string;
  created_at: string;
}

export interface OdooOutboxItem {
  id: string;
  operation: string;
  entity_type: string;
  entity_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: OdooOutboxStatus;
  attempts: number;
  last_error: string | null;
  available_at: string;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  dueThisMonth: number;
  dueThisMonthAmount: number;
  awaitingPayment: number;
  partialPayments: number;
  fullyPaid: number;
  upcomingPayments: number;
  upcomingPaymentsAmount: number;
}

export interface LocationStatementUnit {
  unitId: string;
  unitNumber: string;
  status: UnitStatus;
  tenantName: string | null;
  activeContractNumber: string | null;
  activeContractStartDate: string | null;
  activeContractEndDate: string | null;
  activeContractValue: number;
  contractCount: number;
  invoiceCount: number;
  invoiceTotal: number;
  paidTotal: number;
  remainingTotal: number;
  odooInvoiceCount: number;
  odooFailedCount: number;
  odooInvoiceNames: string[];
}

export interface LocationStatement {
  location: Location | null;
  units: LocationStatementUnit[];
  totals: {
    unitCount: number;
    occupiedUnits: number;
    vacantUnits: number;
    maintenanceUnits: number;
    activeContractCount: number;
    contractCount: number;
    contractValueTotal: number;
    invoiceTotal: number;
    paidTotal: number;
    remainingTotal: number;
    odooInvoiceCount: number;
    odooFailedCount: number;
  };
}

export interface LocationOccupancySummary {
  locationId: string;
  name_en: string;
  name_ar: string;
  totalUnits: number;
  vacantUnits: number;
  occupiedUnits: number;
  maintenanceUnits: number;
  activeContractCount: number;
}

export interface DebtAgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  totalAmount: number;
  invoices: Invoice[];
}

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  roleId: string;
  roleSlug: string;
  roleNameEn: string;
  roleNameAr: string;
  permissions: string[];
  isAdminEditor: boolean;
  mustChangePassword: boolean;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

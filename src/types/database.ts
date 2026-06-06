export type UserRole = 'admin_editor' | 'viewer';
export type PaymentCycle = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';
export type InvoiceStatus = 'due' | 'invoice_issued' | 'partially_paid' | 'fully_paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'other';
export type ContractStatus = 'active' | 'cancelled' | 'completed';
export type ContractCancellationHandling = 'keep_current_full' | 'prorate_current';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name_en: string;
  name_ar: string;
  address: string | null;
  city: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
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
  amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  due_date: string;
  issued_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contract?: Contract;
  unit?: Unit;
  tenant?: Tenant;
  payments?: Payment[];
}

export interface Contract {
  id: string;
  unit_id: string;
  contract_number: string | null;
  tenant_id: string | null;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_cycle: PaymentCycle;
  status: ContractStatus;
  cancelled_at: string | null;
  cancellation_date: string | null;
  cancellation_handling: ContractCancellationHandling | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  unit?: Unit;
  tenant?: Tenant;
  invoices?: Invoice[];
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

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
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
  isAdminEditor: boolean;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

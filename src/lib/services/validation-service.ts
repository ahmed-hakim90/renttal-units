import { z } from 'zod';

const locationSchema = z.object({
  name_en: z.string().min(1),
  name_ar: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
});

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const unitSchema = z.object({
  location_id: z.string().uuid(),
  unit_number: z.string().min(1),
  floor: z.string().optional(),
  area_sqm: z.number().positive().optional(),
  monthly_rent: z.number().positive().nullable().optional(),
  payment_cycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  rent_start_date: z.string().nullable().optional(),
  rent_end_date: z.string().nullable().optional(),
  status: z.enum(['occupied', 'vacant', 'maintenance']),
  tenant_id: z.string().uuid().nullable().optional(),
}).superRefine((unit, ctx) => {
  if (unit.rent_start_date && !isValidDateInput(unit.rent_start_date)) {
    ctx.addIssue({ code: 'custom', path: ['rent_start_date'], message: 'rent_start_date must be a valid date' });
  }

  if (unit.rent_end_date && !isValidDateInput(unit.rent_end_date)) {
    ctx.addIssue({ code: 'custom', path: ['rent_end_date'], message: 'rent_end_date must be a valid date' });
  }

  if (unit.rent_start_date && unit.rent_end_date && unit.rent_end_date < unit.rent_start_date) {
    ctx.addIssue({ code: 'custom', path: ['rent_end_date'], message: 'rent_end_date must be after rent_start_date' });
  }
});

const contractSchema = z.object({
  unit_id: z.string().uuid(),
  contract_number: z.string().nullable().optional(),
  start_date: z.string().refine(isValidDateInput, 'start_date must be a valid date'),
  end_date: z.string().refine(isValidDateInput, 'end_date must be a valid date'),
  total_amount: z.number().positive(),
  payment_cycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']),
  notes: z.string().nullable().optional(),
}).superRefine((contract, ctx) => {
  if (contract.end_date < contract.start_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must be after start_date' });
  }
});

const cancelContractSchema = z.object({
  cancellation_date: z.string().refine(isValidDateInput, 'cancellation_date must be a valid date'),
  cancellation_handling: z.enum(['keep_current_full', 'prorate_current']),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  unit_id: z.string().uuid(),
  period_start: z.string().refine(isValidDateInput, 'period_start must be a valid date'),
  period_end: z.string().refine(isValidDateInput, 'period_end must be a valid date'),
  due_date: z.string().refine(isValidDateInput, 'due_date must be a valid date'),
  notes: z.string().optional(),
}).superRefine((invoice, ctx) => {
  if (invoice.period_end < invoice.period_start) {
    ctx.addIssue({ code: 'custom', path: ['period_end'], message: 'period_end must be after period_start' });
  }

  if (invoice.due_date < invoice.period_start || invoice.due_date > invoice.period_end) {
    ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'due_date must be within invoice period' });
  }
});

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().refine(isValidDateInput, 'payment_date must be a valid date'),
  payment_method: z.enum(['cash', 'bank_transfer', 'check', 'other']),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

function formatErrors(error: z.ZodError): string[] {
  return error.issues.map((i) => i.message);
}

export const validationService = {
  validateLocation(data: unknown) {
    const result = locationSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateUnit(data: unknown) {
    const result = unitSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateContract(data: unknown) {
    const result = contractSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateCancelContract(data: unknown) {
    const result = cancelContractSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateInvoice(data: unknown) {
    const result = invoiceSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validatePayment(data: unknown) {
    const result = paymentSchema.safeParse(data);
    return result.success ? { valid: true as const, errors: [] } : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateImportRow(row: Record<string, unknown>, rowIndex: number) {
    const errors: string[] = [];
    if (!row.unit_number) errors.push(`Row ${rowIndex}: unit_number is required`);
    if (!row.location_id && !row.location_name) errors.push(`Row ${rowIndex}: location is required`);
    if (row.status && !['occupied', 'vacant', 'maintenance'].includes(String(row.status))) {
      errors.push(`Row ${rowIndex}: invalid status`);
    }
    return errors;
  },
};

import { z } from 'zod';

const locationSchema = z.object({
  name_en: z.string().min(1),
  name_ar: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
});

const unitSchema = z.object({
  location_id: z.string().uuid(),
  unit_number: z.string().min(1),
  floor: z.string().optional(),
  area_sqm: z.number().positive().optional(),
  monthly_rent: z.number().positive(),
  payment_cycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']),
  rent_start_date: z.string().nullable().optional(),
  rent_end_date: z.string().nullable().optional(),
  status: z.enum(['occupied', 'vacant', 'maintenance']),
  tenant_id: z.string().uuid().nullable().optional(),
}).superRefine((unit, ctx) => {
  if (unit.status === 'occupied') {
    if (!unit.rent_start_date) {
      ctx.addIssue({ code: 'custom', path: ['rent_start_date'], message: 'rent_start_date is required for occupied units' });
    }
    if (!unit.rent_end_date) {
      ctx.addIssue({ code: 'custom', path: ['rent_end_date'], message: 'rent_end_date is required for occupied units' });
    }
  }

  if (unit.rent_start_date && unit.rent_end_date && unit.rent_end_date < unit.rent_start_date) {
    ctx.addIssue({ code: 'custom', path: ['rent_end_date'], message: 'rent_end_date must be after rent_start_date' });
  }
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  unit_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  due_date: z.string(),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string(),
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
    if (!row.monthly_rent || Number(row.monthly_rent) <= 0) errors.push(`Row ${rowIndex}: valid monthly_rent is required`);
    if (row.status === 'occupied' && !row.rent_start_date) errors.push(`Row ${rowIndex}: rent_start_date is required for occupied units`);
    if (row.status === 'occupied' && !row.rent_end_date) errors.push(`Row ${rowIndex}: rent_end_date is required for occupied units`);
    if (row.rent_start_date && row.rent_end_date && String(row.rent_end_date) < String(row.rent_start_date)) {
      errors.push(`Row ${rowIndex}: rent_end_date must be after rent_start_date`);
    }
    return errors;
  },
};

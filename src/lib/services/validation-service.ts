import { z } from 'zod';
import { isReasonableContractDate, isValidDateInput } from '@/lib/dates/contract-dates';
import {
  isValidSaudiNationalId,
  normalizeNationalId,
} from '@/lib/validation/saudi-national-id';

const phoneSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^[+0-9][0-9\s-]{6,20}$/.test(value),
    'phone must be a valid phone number',
  )
  .optional()
  .nullable();

const tenantSchema = z.object({
  full_name: z.string().trim().min(1, 'tenant name is required'),
  phone: phoneSchema,
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.undefined(),
      z.string().trim().email('tenant email must be valid'),
    ])
    .optional(),
  national_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => isValidSaudiNationalId(normalizeNationalId(value)),
      'national_id must be a valid Saudi ID/Iqama',
    ),
  odoo_partner_id: z.number().int().positive().nullable().optional(),
  vat: z.string().trim().optional().nullable(),
  street: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  country_code: z.string().trim().max(2).optional().nullable(),
});

const locationSchema = z.object({
  name_en: z.string().min(1),
  name_ar: z.string().min(1),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  region: z.string().trim().optional().nullable(),
  odoo_analytic_account_id: z.number().int().positive().nullable().optional(),
  odoo_analytic_account_name: z.string().trim().optional().nullable(),
});

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

const contractLineSchema = z.object({
  line_type: z.enum(['rental', 'service']),
  unit_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  amount: z.number().nonnegative(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  odoo_line_id: z.number().int().positive().nullable().optional(),
  odoo_product_id: z.number().int().positive().nullable().optional(),
  odoo_product_name: z.string().trim().max(255).nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  sort_order: z.number().int().nonnegative().optional(),
}).superRefine((line, ctx) => {
  if (line.line_type === 'rental' && !line.unit_id) {
    ctx.addIssue({ code: 'custom', path: ['unit_id'], message: 'rental lines require a unit' });
  }
  if (line.amount <= 0) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: 'line amount must be greater than zero' });
  }
  if (line.line_type === 'service' && !line.odoo_product_id) {
    ctx.addIssue({ code: 'custom', path: ['odoo_product_id'], message: 'service lines require an Odoo product' });
  }
  if (line.period_start && !isReasonableContractDate(line.period_start)) {
    ctx.addIssue({ code: 'custom', path: ['period_start'], message: 'period_start must be a valid date between 1990 and 2100' });
  }
  if (line.period_end && !isReasonableContractDate(line.period_end)) {
    ctx.addIssue({ code: 'custom', path: ['period_end'], message: 'period_end must be a valid date between 1990 and 2100' });
  }
  if (line.period_start && line.period_end && line.period_end < line.period_start) {
    ctx.addIssue({ code: 'custom', path: ['period_end'], message: 'period_end must be after period_start' });
  }
});

const contractSchema = z.object({
  unit_id: z.string().uuid().optional(),
  contract_number: z
    .string()
    .trim()
    .min(1, 'contract_number is required')
    .max(64, 'contract_number must be at most 64 characters'),
  start_date: z.string().refine(isReasonableContractDate, 'start_date must be a valid date between 1990 and 2100'),
  end_date: z.string().refine(isReasonableContractDate, 'end_date must be a valid date between 1990 and 2100'),
  total_amount: z.number().positive().optional(),
  payment_cycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']),
  tax_mode: z.enum(['taxable', 'non_taxable']).optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(contractLineSchema).min(1).optional(),
}).superRefine((contract, ctx) => {
  if (contract.end_date < contract.start_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must be after start_date' });
  }
  const lines = contract.lines ?? [];
  if (lines.length === 0 && !contract.unit_id) {
    ctx.addIssue({ code: 'custom', path: ['unit_id'], message: 'unit_id is required when lines are omitted' });
  }
  if (lines.length === 0 && (contract.total_amount == null || contract.total_amount <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['total_amount'], message: 'total_amount must be greater than zero' });
  }
  if (lines.length > 0) {
    const rentalLines = lines.filter((line) => line.line_type === 'rental');
    if (rentalLines.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'at least one rental line is required' });
    }
    const unitIds = rentalLines.map((line) => line.unit_id).filter(Boolean);
    if (new Set(unitIds).size !== unitIds.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'duplicate rental units are not allowed' });
    }
    const lineTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    if (lineTotal <= 0) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'line amounts must sum to more than zero' });
    }
  }
});

const draftContractLineSchema = z.object({
  line_type: z.enum(['rental', 'service']),
  unit_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  amount: z.number().nonnegative().optional().default(0),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  odoo_line_id: z.number().int().positive().nullable().optional(),
  odoo_product_id: z.number().int().positive().nullable().optional(),
  odoo_product_name: z.string().trim().max(255).nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

const draftContractSchema = z.object({
  unit_id: z.string().uuid().nullable().optional(),
  contract_number: z
    .string()
    .trim()
    .min(1, 'contract_number is required')
    .max(64, 'contract_number must be at most 64 characters'),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  total_amount: z.number().nonnegative().optional(),
  payment_cycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  tax_mode: z.enum(['taxable', 'non_taxable']).optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(draftContractLineSchema).optional(),
}).superRefine((contract, ctx) => {
  const start = contract.start_date?.trim() || '';
  const end = contract.end_date?.trim() || '';
  if (start && !isReasonableContractDate(start)) {
    ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'start_date must be a valid date between 1990 and 2100' });
  }
  if (end && !isReasonableContractDate(end)) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must be a valid date between 1990 and 2100' });
  }
  if (start && end && isReasonableContractDate(start) && isReasonableContractDate(end) && end < start) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must be after start_date' });
  }
  const unitIds = (contract.lines ?? [])
    .filter((line) => line.line_type === 'rental' && line.unit_id)
    .map((line) => line.unit_id as string);
  if (new Set(unitIds).size !== unitIds.length) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'duplicate rental units are not allowed' });
  }
});

const optionalTenantSchema = z.object({
  full_name: z.string().trim().optional().nullable(),
  phone: phoneSchema,
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.undefined(),
      z.string().trim().email('tenant email must be valid'),
    ])
    .optional(),
  national_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => !value || isValidSaudiNationalId(normalizeNationalId(value)),
      'national_id must be a valid Saudi ID/Iqama',
    ),
  odoo_partner_id: z.number().int().positive().nullable().optional(),
  vat: z.string().trim().optional().nullable(),
  street: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  country_code: z.string().trim().max(2).optional().nullable(),
});

const cancelContractSchema = z.object({
  cancellation_date: z.string().refine(isReasonableContractDate, 'cancellation_date must be a valid date between 1990 and 2100'),
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

  validateTenant(data: unknown) {
    const result = tenantSchema.safeParse(data);
    return result.success
      ? {
          valid: true as const,
          errors: [],
          data: {
            full_name: result.data.full_name,
            phone: result.data.phone?.trim() || null,
            email: typeof result.data.email === 'string' ? (result.data.email.trim() || null) : null,
            national_id: normalizeNationalId(result.data.national_id),
            odoo_partner_id: result.data.odoo_partner_id ?? null,
            vat: result.data.vat?.trim() || null,
            street: result.data.street?.trim() || null,
            city: result.data.city?.trim() || null,
            country_code: result.data.country_code?.trim().toUpperCase() || null,
          },
        }
      : { valid: false as const, errors: formatErrors(result.error) };
  },

  validateContract(data: unknown) {
    const result = contractSchema.safeParse(data);
    if (!result.success) {
      return { valid: false as const, errors: formatErrors(result.error) };
    }
    const defaultTaxRate = result.data.tax_mode === 'non_taxable' ? 0 : 15;
    const lines = (result.data.lines ?? (
      result.data.unit_id
        ? [{
            line_type: 'rental' as const,
            unit_id: result.data.unit_id,
            description: null,
            amount: result.data.total_amount ?? 0,
            period_start: result.data.start_date,
            period_end: result.data.end_date,
            tax_rate: defaultTaxRate,
            sort_order: 0,
          }]
        : []
    )).map((line) => ({
      ...line,
      tax_rate: line.tax_rate ?? defaultTaxRate,
    }));
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const primaryUnitId = lines.find((line) => line.line_type === 'rental' && line.unit_id)?.unit_id
      ?? result.data.unit_id;
    return {
      valid: true as const,
      errors: [],
      data: {
        ...result.data,
        unit_id: primaryUnitId as string,
        total_amount: totalAmount,
        lines,
      },
    };
  },

  validateContractDraft(data: unknown) {
    const result = draftContractSchema.safeParse(data);
    if (!result.success) {
      return { valid: false as const, errors: formatErrors(result.error) };
    }
    const defaultTaxRate = result.data.tax_mode === 'non_taxable' ? 0 : 15;
    const lines = (result.data.lines ?? []).map((line, index) => ({
      ...line,
      amount: line.amount ?? 0,
      tax_rate: line.tax_rate ?? defaultTaxRate,
      sort_order: line.sort_order ?? index,
    }));
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const primaryUnitId = lines.find((line) => line.line_type === 'rental' && line.unit_id)?.unit_id
      ?? result.data.unit_id
      ?? null;
    return {
      valid: true as const,
      errors: [],
      data: {
        ...result.data,
        start_date: result.data.start_date?.trim() || null,
        end_date: result.data.end_date?.trim() || null,
        payment_cycle: result.data.payment_cycle ?? 'quarterly',
        unit_id: primaryUnitId,
        total_amount: totalAmount,
        lines,
      },
    };
  },

  validateOptionalTenant(data: unknown) {
    const result = optionalTenantSchema.safeParse(data);
    if (!result.success) {
      return { valid: false as const, errors: formatErrors(result.error) };
    }
    const fullName = result.data.full_name?.trim() || '';
    return {
      valid: true as const,
      errors: [],
      data: {
        full_name: fullName || null,
        phone: result.data.phone?.trim() || null,
        email: typeof result.data.email === 'string' ? (result.data.email.trim() || null) : null,
        national_id: normalizeNationalId(result.data.national_id),
        odoo_partner_id: result.data.odoo_partner_id ?? null,
        vat: result.data.vat?.trim() || null,
        street: result.data.street?.trim() || null,
        city: result.data.city?.trim() || null,
        country_code: result.data.country_code?.trim().toUpperCase() || null,
      },
    };
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

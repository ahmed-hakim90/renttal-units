import { z } from 'zod';
import type { ContractPaymentCondition } from '@/types/database';

const percentageIncreaseConditionSchema = z.object({
  condition_type: z.literal('percentage_increase_after'),
  enabled: z.boolean(),
  applies_after_months: z.number().int().min(1).max(1200),
  percentage: z.number().finite().positive().max(1000),
  target: z.enum(['rental', 'all']),
}).strict();

const firstYearSingleInstallmentConditionSchema = z.object({
  condition_type: z.literal('first_year_single_installment'),
  enabled: z.boolean(),
  target: z.literal('all'),
}).strict();

const contractPaymentConditionSchema = z.discriminatedUnion('condition_type', [
  percentageIncreaseConditionSchema,
  firstYearSingleInstallmentConditionSchema,
]);

const contractPaymentConditionsSchema = z.array(contractPaymentConditionSchema).max(10);

export function parseContractPaymentConditions(
  input: unknown,
): { success: true; data: ContractPaymentCondition[] } | { success: false } {
  const parsed = contractPaymentConditionsSchema.safeParse(input ?? []);
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export function contractPaymentConditionsEqual(
  left: ContractPaymentCondition[] | null | undefined,
  right: ContractPaymentCondition[] | null | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

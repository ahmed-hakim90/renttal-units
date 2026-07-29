import type { AuditLog, AuditLogChange } from '@/types/database';

const SAFE_AUDIT_FIELDS = new Set([
  'email',
  'full_name',
  'status',
  'contract_number',
  'invoice_number',
  'unit_number',
  'name_en',
  'name_ar',
  'city',
  'region',
  'start_date',
  'end_date',
  'due_date',
  'issue_date',
  'payment_date',
  'payment_method',
  'amount',
  'total_amount',
  'paid_amount',
  'balance',
  'tax_mode',
  'payment_cycle',
  'notes',
  'file_name',
  'file_size',
  'mime_type',
  'old_role_slug',
  'new_role_slug',
  'enabled',
]);

const SENSITIVE_FIELD_PATTERN =
  /(password|secret|token|credential|authorization|cookie|service_role|private_key)/i;

function safeDisplayValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAuditChanges(log: AuditLog): AuditLogChange[] {
  const oldValues = log.old_values ?? {};
  const newValues = log.new_values ?? {};

  if (log.action === 'update_role') {
    return [{
      field: 'role',
      old_value: safeDisplayValue(oldValues.old_role_slug),
      new_value: safeDisplayValue(newValues.new_role_slug),
    }];
  }

  if (log.action === 'create_user') {
    return [{
      field: 'role',
      old_value: null,
      new_value: safeDisplayValue(newValues.new_role_slug),
    }];
  }

  if (log.action === 'reset_user_password') return [];

  const fields = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changes: AuditLogChange[] = [];

  for (const field of fields) {
    if (
      changes.length >= 20
      || !SAFE_AUDIT_FIELDS.has(field)
      || SENSITIVE_FIELD_PATTERN.test(field)
      || valuesEqual(oldValues[field], newValues[field])
    ) {
      continue;
    }

    const oldValue = safeDisplayValue(oldValues[field]);
    const newValue = safeDisplayValue(newValues[field]);
    if (oldValue === null && newValue === null) continue;
    changes.push({ field, old_value: oldValue, new_value: newValue });
  }

  return changes;
}


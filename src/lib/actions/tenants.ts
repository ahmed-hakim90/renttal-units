'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { tenantsRepository, type TenantInput } from '@/lib/repositories/tenants';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { requireFeatureEnabled, loadFeatureFlags } from '@/lib/features/load-feature-flags';

const tenantIdSchema = z.string().uuid();

type TenantFormInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  vat?: string | null;
  street?: string | null;
  city?: string | null;
  country_code?: string | null;
};

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function revalidateTenantViews(locale: string) {
  revalidatePath(`/${locale}/tenants`);
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function getTenants(locale: string) {
  const auth = await requirePermission(locale, 'tenants.view', await getCtx());
  return tenantsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function getTenantsPageData(locale: string) {
  const auth = await requirePermission(locale, 'tenants.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const [tenants, featureFlags] = await Promise.all([
    tenantsRepository.findAll(ctx),
    loadFeatureFlags(ctx),
  ]);
  const mutationsEnabled = featureFlags.master_data_mutations;

  return {
    tenants,
    canCreate: hasPermission(auth, 'tenants.create') && mutationsEnabled,
    canUpdate: hasPermission(auth, 'tenants.update') && mutationsEnabled,
    canDelete: hasPermission(auth, 'tenants.delete') && mutationsEnabled,
  };
}

export async function createTenant(locale: string, data: TenantFormInput) {
  const auth = await requirePermission(locale, 'tenants.create', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;

  const validation = validationService.validateTenant(data);
  if (!validation.valid) return { success: false as const, error: validation.errors.join(', ') };

  const tenant = await tenantsRepository.create(validation.data, ctx);
  await auditService.log(auth, 'create', 'tenant', tenant.id, null, tenant, ctx);
  revalidateTenantViews(locale);
  return { success: true as const, data: tenant };
}

export async function updateTenant(locale: string, id: string, data: TenantFormInput) {
  const auth = await requirePermission(locale, 'tenants.update', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (!tenantIdSchema.safeParse(id).success) {
    return { success: false as const, error: 'invalidTenantId' };
  }

  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;

  const old = await tenantsRepository.findById(id, ctx);
  if (!old) return { success: false as const, error: 'tenantNotFound' };

  const validation = validationService.validateTenant({
    full_name: data.full_name,
    phone: data.phone,
    email: data.email,
    national_id: data.national_id,
    vat: data.vat,
    street: data.street,
    city: data.city,
    country_code: data.country_code,
    // Preserve Odoo partner link; this surface does not re-link partners.
    odoo_partner_id: old.odoo_partner_id,
  });
  if (!validation.valid) return { success: false as const, error: validation.errors.join(', ') };

  const input: TenantInput = validation.data;
  const tenant = await tenantsRepository.update(id, input, ctx);
  await auditService.log(auth, 'update', 'tenant', id, old, tenant, ctx);
  revalidateTenantViews(locale);
  return { success: true as const, data: tenant };
}

export async function deleteTenant(locale: string, id: string) {
  const auth = await requirePermission(locale, 'tenants.delete', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (!tenantIdSchema.safeParse(id).success) {
    return { success: false as const, error: 'invalidTenantId' };
  }

  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;

  const old = await tenantsRepository.findById(id, ctx);
  if (!old) return { success: false as const, error: 'tenantNotFound' };

  const [contractCount, invoiceCount] = await Promise.all([
    tenantsRepository.countLinkedContracts(id, ctx),
    tenantsRepository.countLinkedInvoices(id, ctx),
  ]);

  if (contractCount > 0) {
    return { success: false as const, error: 'tenantHasContracts', errorCode: 'CONFLICT' as const };
  }
  if (invoiceCount > 0) {
    return { success: false as const, error: 'tenantHasInvoices', errorCode: 'CONFLICT' as const };
  }

  await tenantsRepository.delete(id, ctx);
  await auditService.log(auth, 'delete', 'tenant', id, old, null, ctx);
  revalidateTenantViews(locale);
  return { success: true as const };
}

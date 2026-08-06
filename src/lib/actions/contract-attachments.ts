'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { contractsRepository } from '@/lib/repositories/contracts';
import { contractAttachmentsRepository } from '@/lib/repositories/contract-attachments';
import { auditService } from '@/lib/services/audit-service';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { DEFAULT_LIST_PAGE_SIZE, parseListPage, parseListPageSize } from '@/lib/pagination/list-page';

const BUCKET = 'contract-documents';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const idSchema = z.string().uuid();

async function context() {
  return { correlation_id: await getCorrelationId() };
}

export async function getContractAttachmentsPage(
  locale: string,
  filters?: { page?: number; pageSize?: number },
) {
  const auth = await requirePermission(locale, 'contracts.view', await context());
  const page = parseListPage(filters?.page);
  const pageSize = parseListPageSize(filters?.pageSize, DEFAULT_LIST_PAGE_SIZE);
  return contractAttachmentsRepository.findPage(
    { ...(await context()), user_id: auth.userId, role: auth.role },
    { page, pageSize },
  );
}

export async function listContractLinkOptions(locale: string) {
  const auth = await requirePermission(locale, 'contracts.view', await context());
  return contractAttachmentsRepository.listContractLinkOptions({
    ...(await context()),
    user_id: auth.userId,
    role: auth.role,
  });
}

function validatePdf(file: File, bytes: Uint8Array) {
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) return 'pdfSizeInvalid';
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'pdfTypeInvalid';
  if (file.type && file.type !== 'application/pdf' && file.type !== 'application/octet-stream') {
    return 'pdfTypeInvalid';
  }
  const magic = new TextDecoder('ascii').decode(bytes.subarray(0, 5));
  if (magic !== '%PDF-') return 'pdfContentInvalid';
  return null;
}

export async function uploadContractPdf(locale: string, contractId: string, formData: FormData) {
  const auth = await requirePermission(locale, 'contracts.update', await context());
  if (!idSchema.safeParse(contractId).success) return { success: false, error: 'contractNotFound' };
  const ctx = { ...(await context()), user_id: auth.userId, role: auth.role };
  const contract = await contractsRepository.findById(contractId, ctx);
  if (!contract) return { success: false, error: 'contractNotFound' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { success: false, error: 'pdfRequired' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validationError = validatePdf(file, bytes);
  if (validationError) return { success: false, error: validationError };

  const attachmentId = randomUUID();
  const path = `contracts/${contractId}/${attachmentId}.pdf`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { success: false, error: 'pdfUploadFailed' };

  const { data, error } = await supabase
    .from('contract_attachments')
    .insert({
      id: attachmentId,
      contract_id: contractId,
      storage_path: path,
      original_filename: file.name.slice(0, 255),
      content_type: 'application/pdf',
      byte_size: file.size,
      sha256,
      uploaded_by: auth.userId,
    })
    .select('id, contract_id, original_filename, content_type, byte_size, created_at')
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { success: false, error: error.code === '23505' ? 'pdfDuplicate' : 'pdfUploadFailed' };
  }

  await auditService.log(auth, 'upload', 'contract_attachment', attachmentId, null, {
    contract_id: contractId,
    original_filename: file.name.slice(0, 255),
    byte_size: file.size,
    sha256,
  }, ctx);
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/contracts/${contractId}`);
  revalidatePath(`/${locale}/documents`);
  return { success: true, data };
}

async function createContractPdfSignedUrl(
  locale: string,
  contractId: string,
  attachmentId: string,
  disposition: 'download' | 'inline',
) {
  await requirePermission(locale, 'contracts.view', await context());
  if (!idSchema.safeParse(contractId).success || !idSchema.safeParse(attachmentId).success) {
    return { success: false, error: 'pdfNotFound' };
  }
  const supabase = await createClient();
  const { data: attachment, error } = await supabase
    .from('contract_attachments')
    .select('storage_path, original_filename')
    .eq('id', attachmentId)
    .eq('contract_id', contractId)
    .maybeSingle();
  if (error || !attachment) return { success: false, error: 'pdfNotFound' };

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      attachment.storage_path,
      600,
      disposition === 'download' ? { download: attachment.original_filename } : undefined,
    );
  if (signError || !data?.signedUrl) return { success: false, error: 'pdfDownloadFailed' };
  return { success: true, data: { url: data.signedUrl, expiresIn: 600 } };
}

export async function getContractPdfUrl(locale: string, contractId: string, attachmentId: string) {
  return createContractPdfSignedUrl(locale, contractId, attachmentId, 'download');
}

export async function getContractPdfPreviewUrl(locale: string, contractId: string, attachmentId: string) {
  return createContractPdfSignedUrl(locale, contractId, attachmentId, 'inline');
}

export async function deleteContractPdf(locale: string, contractId: string, attachmentId: string) {
  const auth = await requirePermission(locale, 'contracts.update', await context());
  if (!idSchema.safeParse(contractId).success || !idSchema.safeParse(attachmentId).success) {
    return { success: false, error: 'pdfNotFound' };
  }
  const ctx = { ...(await context()), user_id: auth.userId, role: auth.role };
  const supabase = await createClient();
  const { data: attachment, error } = await supabase
    .from('contract_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('contract_id', contractId)
    .maybeSingle();
  if (error || !attachment) return { success: false, error: 'pdfNotFound' };

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  if (storageError) return { success: false, error: 'pdfDeleteFailed' };
  const { error: deleteError } = await supabase.from('contract_attachments').delete().eq('id', attachmentId);
  if (deleteError) return { success: false, error: 'pdfDeleteFailed' };

  await auditService.log(auth, 'delete', 'contract_attachment', attachmentId, attachment, null, ctx);
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/contracts/${contractId}`);
  revalidatePath(`/${locale}/documents`);
  return { success: true };
}

/** Move an uploaded PDF from one contract to another (storage path + DB link). */
export async function relinkContractPdf(
  locale: string,
  attachmentId: string,
  newContractId: string,
) {
  const auth = await requirePermission(locale, 'contracts.update', await context());
  if (!idSchema.safeParse(attachmentId).success || !idSchema.safeParse(newContractId).success) {
    return { success: false, error: 'pdfNotFound' };
  }
  const ctx = { ...(await context()), user_id: auth.userId, role: auth.role };
  const supabase = await createClient();

  const { data: attachment, error } = await supabase
    .from('contract_attachments')
    .select('*')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error || !attachment) return { success: false, error: 'pdfNotFound' };
  if (attachment.contract_id === newContractId) {
    return { success: true, data: attachment };
  }

  const targetContract = await contractsRepository.findById(newContractId, ctx);
  if (!targetContract) return { success: false, error: 'contractNotFound' };
  if (targetContract.status !== 'active' && targetContract.status !== 'draft') {
    return { success: false, error: 'contractNotEditable' };
  }

  const oldPath = attachment.storage_path as string;
  const newPath = `contracts/${newContractId}/${attachmentId}.pdf`;
  const { error: moveError } = await supabase.storage.from(BUCKET).move(oldPath, newPath);
  if (moveError) return { success: false, error: 'pdfRelinkFailed' };

  const { data: updated, error: updateError } = await supabase
    .from('contract_attachments')
    .update({
      contract_id: newContractId,
      storage_path: newPath,
    })
    .eq('id', attachmentId)
    .select('*')
    .single();

  if (updateError) {
    await supabase.storage.from(BUCKET).move(newPath, oldPath);
    return {
      success: false,
      error: updateError.code === '23505' ? 'pdfDuplicate' : 'pdfRelinkFailed',
    };
  }

  await auditService.log(
    auth,
    'update',
    'contract_attachment',
    attachmentId,
    attachment,
    updated,
    ctx,
  );
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/contracts/${attachment.contract_id}`);
  revalidatePath(`/${locale}/contracts/${newContractId}`);
  revalidatePath(`/${locale}/documents`);
  return { success: true, data: updated };
}

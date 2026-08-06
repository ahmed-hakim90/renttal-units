import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Mirrors soft draft rules from validateContractForm(..., { mode: 'draft' })
 * for regression coverage without path-alias TS imports.
 */
function validateDraftForm(values) {
  const errors = {};
  if (!String(values.contract_number ?? '').trim()) {
    errors.contract_number = 'contractNumberRequired';
  }
  const unitIds = (values.lines ?? [])
    .filter((line) => line.line_type === 'rental')
    .map((line) => line.unit_id)
    .filter(Boolean);
  if (new Set(unitIds).size !== unitIds.length) {
    errors.lines = 'duplicateUnits';
  }
  return errors;
}

function getContractDisplayStatus(status, endDate, asOfDate = new Date()) {
  if (status === 'draft') return 'draft';
  const asOf = asOfDate.toISOString().slice(0, 10);
  if (status === 'active' && endDate && endDate < asOf) return 'expired';
  return status;
}

test('draft validation accepts contract number only', () => {
  assert.deepEqual(validateDraftForm({ contract_number: 'CTR-DRAFT-001', lines: [] }), {});
});

test('draft validation rejects empty contract number', () => {
  assert.equal(
    validateDraftForm({ contract_number: '  ', lines: [] }).contract_number,
    'contractNumberRequired',
  );
});

test('draft validation rejects duplicate rental units', () => {
  assert.equal(
    validateDraftForm({
      contract_number: 'CTR-1',
      lines: [
        { line_type: 'rental', unit_id: 'unit-a' },
        { line_type: 'rental', unit_id: 'unit-a' },
      ],
    }).lines,
    'duplicateUnits',
  );
});

test('display status keeps draft distinct from expired', () => {
  assert.equal(getContractDisplayStatus('draft', null), 'draft');
  assert.equal(getContractDisplayStatus('draft', '2020-01-01'), 'draft');
  assert.equal(getContractDisplayStatus('active', '2020-01-01', new Date('2026-07-30')), 'expired');
});

test('form validator implements draft mode soft rules', () => {
  const source = readFileSync(join(root, 'src/lib/rental/contract-form-validation.ts'), 'utf8');
  assert.match(source, /mode\?: 'strict' \| 'draft'/);
  assert.match(source, /const draftMode = options\?\.mode === 'draft'/);
  assert.match(source, /if \(draftMode\)/);
});

test('migration adds draft status and draft RPCs', () => {
  const statusMigration = readFileSync(
    join(root, 'supabase/migrations/20260730000001_contract_draft_status.sql'),
    'utf8',
  );
  const rpcMigration = readFileSync(
    join(root, 'supabase/migrations/20260730000002_contract_draft_rpcs.sql'),
    'utf8',
  );
  assert.match(statusMigration, /ADD VALUE IF NOT EXISTS 'draft'/);
  assert.match(rpcMigration, /save_contract_draft_atomic/);
  assert.match(rpcMigration, /activate_contract_draft_atomic/);
  assert.match(rpcMigration, /delete_contract_draft_atomic/);
  assert.match(rpcMigration, /status = 'draft'/);
  assert.match(rpcMigration, /non_draft_contract_complete/);
  assert.match(rpcMigration, /v_soft := v_status = 'draft'/);
  assert.match(rpcMigration, /IF NOT v_soft AND jsonb_array_length/);
});

test('activate RPC creates invoices; save draft RPC does not', () => {
  const rpcMigration = readFileSync(
    join(root, 'supabase/migrations/20260730000002_contract_draft_rpcs.sql'),
    'utf8',
  );
  const saveStart = rpcMigration.indexOf('CREATE OR REPLACE FUNCTION save_contract_draft_atomic');
  const activateStart = rpcMigration.indexOf('CREATE OR REPLACE FUNCTION activate_contract_draft_atomic');
  const deleteStart = rpcMigration.indexOf('CREATE OR REPLACE FUNCTION delete_contract_draft_atomic');
  assert.ok(saveStart > 0 && activateStart > saveStart && deleteStart > activateStart);
  const saveBody = rpcMigration.slice(saveStart, activateStart);
  const activateBody = rpcMigration.slice(activateStart, deleteStart);
  assert.doesNotMatch(saveBody, /INSERT INTO invoices/);
  assert.match(activateBody, /INSERT INTO invoices/);
  assert.match(activateBody, /status = 'active'/);
});

test('service exposes saveDraft activateDraft deleteDraft with fail-closed checks', () => {
  const service = readFileSync(join(root, 'src/lib/services/contract-service.ts'), 'utf8');
  assert.match(service, /async saveDraft\(/);
  assert.match(service, /async activateDraft\(/);
  assert.match(service, /async deleteDraft\(/);
  assert.match(service, /status !== 'draft'/);
  assert.match(service, /'draft_saved'/);
  assert.match(service, /'activated'/);
  assert.match(service, /'draft_deleted'/);
  assert.match(service, /activeContractExists/);
});

test('actions gate draft mutations by permission', () => {
  const actions = readFileSync(join(root, 'src/lib/actions/contracts.ts'), 'utf8');
  assert.match(actions, /export async function saveContractDraft/);
  assert.match(actions, /export async function activateContract/);
  assert.match(actions, /export async function deleteContractDraft/);
  assert.match(actions, /isCreate \? 'contracts\.create' : 'contracts\.update'/);
});

test('contract editor auto-saves valid drafts without navigating away', () => {
  const editor = readFileSync(
    join(root, 'src/components/contracts/contract-editor.tsx'),
    'utf8',
  );
  assert.match(editor, /autoSaveTimerRef/);
  assert.match(editor, /queueAutoSave/);
  assert.match(editor, /saveContractDraft\(locale/);
  assert.match(editor, /1_200/);
  assert.match(editor, /currentContractIdRef/);
  assert.match(editor, /await autoSavePromiseRef\.current/);
  assert.match(editor, /autoSavingDraft/);
});

test('contract editor selects the last fully paid installment from the preview', () => {
  const editor = readFileSync(
    join(root, 'src/components/contracts/contract-editor.tsx'),
    'utf8',
  );
  assert.match(editor, /selectLastFullyPaidPeriod/);
  assert.match(editor, /paid_through_date: periodEnd/);
  assert.match(editor, /last_fully_paid_installment/);
  assert.match(editor, /period\.periodEnd/);
  assert.match(editor, /noPaidInstallments/);
  assert.doesNotMatch(editor, /t\('openingBalanceSection'\)/);
  assert.doesNotMatch(editor, /name="opening_paid_amount"/);
  assert.doesNotMatch(editor, /name="last_payment_date"/);
  assert.doesNotMatch(editor, /name="opening_notes"/);
});

test('contract review shows opening totals and the first Odoo invoice lines', () => {
  const editor = readFileSync(
    join(root, 'src/components/contracts/contract-editor.tsx'),
    'utf8',
  );
  assert.match(editor, /previewPaidTotal/);
  assert.match(editor, /previewOutstandingTotal/);
  assert.match(editor, /firstOdooPreviewPeriod/);
  assert.match(editor, /firstOdooPreviewPeriod\.lineItems\.map/);
  assert.match(editor, /odooInvoicePreview/);
});

test('i18n includes draft keys in EN and AR', () => {
  const en = JSON.parse(readFileSync(join(root, 'src/messages/en/contracts.json'), 'utf8'));
  const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar/contracts.json'), 'utf8'));
  for (const key of [
    'draft',
    'saveDraft',
    'activate',
    'continueDraft',
    'deleteDraft',
    'linesEmptyTitle',
    'addRentalUnit',
    'addServiceFee',
    'contractNotDraft',
    'autoSavingDraft',
    'autoSavedDraft',
    'lastFullyPaid',
    'odooInvoicePreview',
  ]) {
    assert.equal(typeof en[key], 'string', `missing en key ${key}`);
    assert.equal(typeof ar[key], 'string', `missing ar key ${key}`);
  }
});

test('full-page routes exist for create and draft/active edit', () => {
  const newPage = readFileSync(
    join(root, 'src/app/[locale]/(dashboard)/contracts/new/page.tsx'),
    'utf8',
  );
  const editPage = readFileSync(
    join(root, 'src/app/[locale]/(dashboard)/contracts/[id]/edit/page.tsx'),
    'utf8',
  );
  const manager = readFileSync(join(root, 'src/components/contracts/contracts-manager.tsx'), 'utf8');
  assert.match(newPage, /ContractEditor/);
  assert.match(newPage, /contracts\.create/);
  assert.match(editPage, /getContractEditAccess/);
  assert.match(editPage, /editNotAllowedTitle/);
  assert.match(editPage, /contracts\.update/);
  assert.match(manager, /\/contracts\/new/);
  assert.match(manager, /continueDraft/);
  assert.match(manager, /\/contracts\/\$\{contract\.id\}\/edit/);
  assert.doesNotMatch(manager, /setCreateOpen\(true\)/);
  assert.doesNotMatch(manager, /setEditOpen\(true\)/);
});

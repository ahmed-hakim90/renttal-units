# Atomic contract cancellation

## Business problem

Cancelling a rental contract changes the contract lifecycle, the current invoice,
future invoice schedule, tax snapshots, and audit history. Applying those changes
through separate requests can leave inconsistent financial records after a
failure or concurrent payment.

## Decision

Use one permission-checked PostgreSQL function to lock the contract and its
invoices and apply the cancellation atomically. Proration includes the
cancellation day and updates invoice lines, tax amounts, and invoice totals
together. Issued, Odoo-linked, or paid invoices are not rewritten; cancellation
stops until their credit note or refund is handled explicitly.

The privileged implementation runs as `SECURITY DEFINER` in the unexposed
`private` schema because `contracts.update` is the permission for the complete
cancellation workflow, while its internal invoice cleanup would otherwise
require unrelated direct invoice permissions. A `SECURITY INVOKER` wrapper in
`public` preserves the Data API contract. The implementation checks
`contracts.update`, fixes `search_path`, rejects anonymous callers, and grants
execution only to authenticated and service roles.

## Rejected alternatives

- Separate service-layer updates: cannot guarantee one transaction across
  PostgREST requests.
- Silently reducing issued or paid invoices: loses accounting history and can
  diverge from Odoo.
- Updating only the invoice total: leaves line and VAT snapshots inconsistent.

## Consequences

- A failed cancellation rolls back all contract, invoice, line, and audit changes.
- Operators receive an actionable error when financial settlement is required.
- Credit notes and refunds remain separate accounting workflows.
- Existing callers continue using the same contract cancellation server action.

## Migration and compatibility

Migration `20260729223340_atomic_contract_cancellation.sql` adds the atomic
function and extends the invoice payment-field guard for this controlled path.
Migration `20260729224415_secure_contract_cancellation_rpc.sql` moves its
privileged implementation to `private` while preserving the public RPC
signature. No existing columns or records are removed.

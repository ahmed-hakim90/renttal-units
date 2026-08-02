# ADR: Contract Odoo tracking cutover

**Date:** 2026-08-02  
**Status:** Accepted

## Business problem

Operators often create active contracts that already have a history of paid installments in Odoo (or outside the system). Linking every historical Odoo invoice is slow, noisy, and can double-count amounts when local schedules already represent those periods as paid through opening balance.

Operators need:

1. A clear local schedule for the full contract term.
2. Historical periods marked settled without importing old Odoo documents.
3. Odoo matching/sync only from the first unpaid installment onward.
4. An optional reference for the last historical payment (amount/reference), without treating it as the balance source of truth.

## Decision

Use a **hybrid cutover** per contract:

- User (or optional Odoo suggest) sets **paid through date** = last fully paid installment end, and optional partial `opening_paid_amount` on the first open installment.
- System derives and stores **`odoo_tracking_start_date`** = period start of the first unpaid installment (sequential).
- Periods before that date are local-only history, settled via opening-balance rules (`paid_through_date` / `opening_paid_amount`).
- Odoo import matching, sync, and link RPCs ignore or reject local invoices with `period_start < odoo_tracking_start_date`.
- **`historical_last_payment_amount`** and **`historical_last_payment_reference`** remain nullable DB columns for compatibility but are not exposed in Excel or contract forms.
- Current-month reconciliation window remains: future months do not appear until their month starts.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Link all historical Odoo invoices | High ops cost; fragile period metadata; double-count risk with opening balance |
| Fixed global cutover date | Contracts start mid-history at different points; per-contract first unpaid is correct |
| Use last payment alone for balance | Last payment is incomplete; schedule + paid-through is the source of truth |
| Soft UI-only filter without DB guard | Links could still be forced via RPC; fail closed in DB |

## Consequences

- New nullable columns on `contracts`: `odoo_tracking_start_date`, `historical_last_payment_amount`, `historical_last_payment_reference`.
- Contract create/activate/draft wrappers persist cutover fields from contract JSON.
- `link_odoo_import_invoice_atomic` raises `LOCAL_INVOICE_BEFORE_ODOO_TRACKING` when linking before cutover.
- Matching/import services exclude historical local invoices from operational Odoo sync.
- Reporting must not sum historical Odoo documents against the same periods already covered by opening balance.
- Existing contracts without `odoo_tracking_start_date` keep prior behavior (no cutover filter) until set.

## Migration / compatibility

- Additive columns; existing rows remain NULL.
- Opening-balance feature flag (`contracts_opening_balance`) still gates input of opening fields.
- No change to RLS/permission keys; link still requires `odoo.manage`.

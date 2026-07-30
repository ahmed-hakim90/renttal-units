# ADR: Contract drafts + full-page create

## Business problem

Operators create multi-line rental contracts (units + service fees). The previous `max-w-lg` modal was too small for the lines-first workflow, and there was no way to save a partial contract and finish later. Create always wrote `status = active` and generated the full invoice schedule immediately.

## Decision

1. **Full-page editor** at `/contracts/new` and `/contracts/[id]/edit` for **draft and active** contracts, with a lines-first layout.
2. Cancelled/completed contracts do **not** open the editor: the edit route shows a clear message and back links instead.
3. **`contract_status` includes `draft`**. Drafts persist in Postgres with relaxed nullability (`unit_id`, dates may be null; `total_amount >= 0`).
4. **`contract_number` remains required** (unique identity of the draft).
5. **Save draft** uses `save_contract_draft_atomic` — no invoices, no unit occupancy.
6. **Activate** uses `activate_contract_draft_atomic` — full validation, occupancy checks, invoice schedule, `status = active`.
7. Occupancy triggers already ignore non-`active` contracts, so drafts do not block units.
8. From `/contracts/new`, Activate without a prior draft still uses `createContract` (immediate active path). After Save draft, the operator continues on the edit page and Activates there.
9. Active-contract edit uses `updateContract`; units/structure stay locked; schedule fields lock when invoices are issued or payments exist.

## Rejected alternatives

- LocalStorage-only drafts: lose data across devices/browsers; weak for ERP operators.
- Large modal only: still cramped for multi-line + tenant + preview.
- Soft-occupying units on draft: blocks inventory before the lease is real.

## Consequences

- List/detail show a Draft badge and Continue action.
- Reports and available-unit filters continue to treat only `active` as occupying.
- Two drafts may reference the same unit; only one can activate (second activate fails closed).
- Incomplete rental lines are allowed on drafts; activate enforces rental unit + amounts + tenant.

## Compatibility

Additive migration: enum value `draft`, relaxed constraints for draft rows, new RPCs. Existing active/cancelled/completed contracts unchanged.

# ADR: Payment reverse / refund design

Date: 2026-08-02  
Status: Proposed (not implemented)

## Business problem

Operators occasionally record a wrong payment amount, method, or invoice allocation. Hard-deleting a payment breaks invoice balances, audit history, and any Odoo reconciliation already performed. Rentara needs a controlled reverse/refund path that preserves ledger integrity.

## Chosen approach (design only)

When product approves the lifecycle:

1. Add a dedicated permission `payments.reverse` (depends on `payments.view`).
2. Reverse creates a new compensating payment row (negative amount or `type=reversal`) linked to the original payment id — never update/delete the original amount.
3. Require a non-empty reason; store actor, timestamps, and before/after invoice paid balance in audit (`action: reverse`, entity `payment`).
4. Recalculate invoice status from payments atomically in the same transaction/RPC.
5. Block reverse when:
   - invoice payments are Odoo-managed
   - payment already reversed
   - reverse would make paid_amount negative
6. UI: detail modal action “Reverse payment” with confirmation + reason; pending/disabled while submitting.

## Rejected alternatives

- Soft-delete / hide original payment: loses auditable money movement.
- In-place edit of amount/date: destroys forensic trail and races with concurrent payments.
- Immediate hard delete of active financial rows: forbidden by product policy for invoices/payments.

## Consequences

- Schema needs `payments.reverses_payment_id` (nullable FK) and/or `payment_type`.
- Reporting and exports must treat reverse rows as first-class money movements.
- Odoo sync policy for reverse must be decided separately (local-only vs push credit note).

## Migration / compatibility

No runtime change until this ADR is accepted. Current payments UI supports detail/receipt view only.

# ADR: Multi-line contracts (rental + service fees)

## Business problem

Odoo invoices often contain multiple rental units plus general service fees under one customer document. The local contract model was 1:1 with a single unit, so import either split units into separate contracts or dropped fees from contract value.

## Decision

Introduce `contract_lines` with `rental` and `service` line types under one contract header.

- `contracts.unit_id` remains the **primary rental unit** for backward-compatible joins and due-invoice generation.
- `contracts.total_amount` is the server-computed sum of all VAT-inclusive line amounts.
- Taxable contract amounts are entered and stored inclusive of VAT. Invoice snapshots
  extract the untaxed amount and VAT from that fixed total; VAT is never added on top.
- Active occupancy is enforced per rental unit across all contract lines (not only the primary unit).
- Payment schedules stay aggregated on the contract total and payment cycle (no per-unit local invoice split in this phase).
- Odoo payment totals remain authoritative on `odoo_invoice_documents`.

## Rejected alternatives

- One contract per unit with fees ignored: loses real lease structure and understates contract value.
- Allocating fees into unit amounts: hides fee visibility and complicates audits.
- Treating contract amounts as untaxed: overstates receivables and Odoo invoices by
  adding VAT above the amount agreed in the signed contract.
- Full invoice-line local billing now: larger accounting change than needed for import + manual create.

## Consequences

- Manual create/edit and Odoo import both accept multiple lines.
- Units secondary to a multi-unit contract are occupied via `contract_lines`, not only `contracts.unit_id`.
- Reports should attribute rental line amounts to units and keep service fees on the contract.

## Compatibility

Existing contracts are backfilled to a single rental line. Callers may keep sending a single `unit_id` during migration; the RPC synthesizes one rental line when `p_lines` is empty.

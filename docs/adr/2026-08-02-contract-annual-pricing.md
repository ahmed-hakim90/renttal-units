# ADR: Annual pre-tax contract pricing

## Business problem

Operators enter Ejar-style contracts using annual rent and service amounts before
tax, then need the system to derive contract duration installments, VAT, rent
increases, and the full contract total. The previous UI required pasting
full-contract tax-inclusive totals, which was error-prone and did not match the
source documents.

## Decision

Add an explicit pricing source on each contract line:

- `amount_basis = annual_untaxed` with `annual_amount_untaxed` for new contracts
- `amount_basis = contract_total_inclusive` for existing/legacy contracts

Keep `contract_lines.amount` and `contracts.total_amount` as full-contract
tax-inclusive totals so invoices, payments, and reports stay compatible.

The billing engine:

1. Splits the annual untaxed amount by payments per year
2. Prorates stub periods by days
3. Applies payment conditions (rent increase) to matching lines
4. Rounds ordinary installments and puts the remainder on the last period
5. Applies each line's tax treatment after the untaxed period amount

The application layer derives inclusive amounts before persistence. RPCs reject
missing annual sources on non-draft contracts and always set
`contracts.total_amount` from stored line amounts.

## Rejected alternatives

- Replace `amount` with annual-only storage: breaks invoice snapshots and
  historical reports that expect inclusive contract totals.
- Recompute and rewrite issued invoices for old contracts: destroys accounting
  history and Odoo reconciliation.
- Trust client-submitted `total_amount` / derived `amount`: allows spoofed
  financial totals.

## Consequences

- New contract forms collect annual pre-tax amounts and show a live derived
  schedule.
- Legacy contracts remain editable with the previous inclusive-total entry mode.
- Schedule locking after issued/paid invoices continues to fail closed.
- Payment-condition increases change the derived annual total; they no longer
  need to preserve a pre-entered signed total for annual lines.

## Compatibility

Existing rows default to `contract_total_inclusive` with null
`annual_amount_untaxed`. Their invoice schedules are unchanged until an operator
explicitly edits and rebuilds an unlocked schedule.

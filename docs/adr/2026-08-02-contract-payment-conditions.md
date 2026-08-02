# ADR: Contract payment conditions

## Business problem

Long rental contracts may keep the normal installment value for an initial term
and then increase later installments, such as a ten-year contract with a 10%
increase after five years. Operators need to configure and disable this behavior
per contract without manually rewriting invoice amounts.

## Decision

Store validated condition definitions in `contracts.payment_conditions` and apply
them when the immutable invoice schedule is generated.

- The first supported condition is `percentage_increase_after`.
- It records enabled state, the threshold in months, the percentage, and the
  target line type.
- The current UI manages one rental-only condition using years and percentage.
- Enabled conditions weight installments after their threshold. Allocation still
  sums to each signed contract-line total, so `contracts.total_amount` remains
  the source of truth.
- Conditions are persisted atomically with create, draft save, and draft
  activation.
- Active-contract changes rebuild only unissued, unpaid due invoices. Existing
  schedule locking continues to reject changes after financial activity.

## Rejected alternatives

- Store only `increase_after_years` and `increase_percentage` columns: simple but
  requires a schema change for every future condition type.
- Change `contracts.total_amount` when an increase is enabled: breaks the signed
  contract total and existing reporting invariants.
- Adjust invoices only in the client: bypasses server validation and creates
  different preview and persisted schedules.
- Rewrite issued or paid invoices: destroys accounting history and Odoo
  reconciliation integrity.

## Consequences

- Schedule calculations must always receive the contract conditions.
- Invoice snapshots remain immutable after issue or payment.
- JSON validation exists in both the application and database boundary.
- Additional condition types require an explicit validator and engine change
  before they can be stored.

## Compatibility

Existing contracts receive an empty condition list and keep their current
schedule. Existing RPCs remain available; new wrappers add atomic condition
persistence for updated application callers.

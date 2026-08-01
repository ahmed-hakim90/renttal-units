# Configurable dashboard due horizons

## Business problem

Collection operators need three dashboard counts for scheduled, unissued invoices that will become due soon. The periods must be configurable without deploying code, and an invoice must not appear in more than one card.

## Decision

Store the three increasing period endpoints in the existing global `settings` table under `dashboard_due_horizons`, defaulting to `[3, 7, 15]`. Query future invoices in `due` status once through the largest endpoint, then group them server-side into inclusive, non-overlapping windows: `0–3`, `4–7`, and `8–15` by default.

The settings action validates administrator permission, exactly three whole-day values, strict ascending order, and a 1–90 day range. Existing invoice RLS remains the data-access boundary.

## Rejected alternatives

- Three independent setting rows: easier to save partially and harder to validate atomically as one business rule.
- Cumulative cards: the same invoice would appear in multiple counts.
- Client-side grouping: it would expose unnecessary invoice data and duplicate business logic in the UI.

## Consequences

- Changing the endpoints immediately changes dashboard labels and counts after revalidation.
- The cards count scheduled local invoices only (`status = 'due'`); issued, paid, and overdue invoices remain in their existing dashboard cards.
- The location filter applies before grouping.
- The new composite `(status, due_date)` index supports the bounded dashboard query.

## Migration and compatibility

The migration is additive: it inserts the default setting only when absent and adds a non-destructive index. Invalid or missing legacy values safely fall back to `[3, 7, 15]`.

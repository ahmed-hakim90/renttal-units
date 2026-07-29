# Odoo-owned metadata for linked units

## Business problem

Operators identify imported rental units by the Odoo product name, ID, reference,
category, and description. Keeping only a shortened local unit number loses that
context and can create false duplicates between different product types.

## Decision

Store the trusted Odoo product metadata on each linked unit. Linking, creating
from Odoo, and refreshing the Odoo catalog update these fields from Odoo.
Odoo-managed names are read-only in the local unit form.

## Rejected alternatives

- Loading Odoo on every units-page request would make the core workflow depend
  on Odoo availability and add avoidable latency.
- Letting operators edit copied Odoo metadata locally would create two sources
  of truth.
- Storing the full product response as JSON would retain unnecessary provider
  data and weaken the application contract.

## Consequences

- The units table gains explicit nullable product metadata columns.
- Existing linked units receive their current local name as a safe migration
  fallback and are refreshed from Odoo on the next catalog refresh.
- Local location, floor, area, and operational status remain locally managed.
- No RLS policy changes are required because the fields remain on `units`.

## Compatibility and rollout

Apply the additive migration before deploying the application changes. Rollback
can stop writing and displaying the new fields; dropping populated columns is
intentionally not part of the rollback path.

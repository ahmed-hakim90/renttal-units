# Local Odoo service product catalog

## Problem

Contract operators currently wait for a live Odoo request the first time they add a service line. The request can load hundreds of products and makes contract entry depend on Odoo latency and availability.

## Decision

Treat the configured Odoo `serviceCategoryId` as the allowlisted source for service products. Users with `odoo.manage` can synchronize that category from the existing unit product-linking page. Store the resulting product identifiers and display metadata in `odoo_service_products`; contract forms read active rows from this local catalog during server rendering.

The `odoo_service_catalog_button` feature flag controls both visibility of the service-catalog control and execution of its synchronization action.

Synchronization is atomic and idempotent. It marks the previous catalog inactive, upserts the current category products, records a shared synchronization timestamp, and writes an Odoo sync log. Database RLS allows contract and unit readers to view the catalog while only `odoo.manage` can mutate it.

If the catalog migration has not reached an instance or no products have been synchronized yet, contract entry preserves the existing live Odoo fallback.

## Rejected alternatives

- Browser storage is per-device, untrusted, and can become inconsistent between operators.
- Maintaining individual product IDs duplicates the category membership already managed in Odoo.
- An in-memory Next.js cache is not durable or shared reliably across function instances.
- A scheduled privileged endpoint adds operational and security overhead for a small operator-managed catalog.

## Consequences

- Service dropdowns render immediately after the first synchronization.
- Odoo remains the source of truth for category membership; local rows are a read model.
- Administrators must resynchronize after changing service products or the configured category.
- Contract activation continues to validate selected service products against Odoo, so stale catalog data cannot silently create an invalid active contract.

## Compatibility

Existing contracts retain their stored Odoo product IDs and names. Existing deployments continue using the live fallback until the migration is applied and the service category is synchronized.

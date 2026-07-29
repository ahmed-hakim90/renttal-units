# Database-backed feature flags

## Problem

Administrators need to show or hide optional operational controls without rebuilding or redeploying the application. The controlled features now include Odoo tools, imports, reports, payment-status pages, contract options, and master-data mutations.

## Decision

Store feature flags in the existing `settings` table using the `feature_flag.<name>` key convention. Expose a dedicated admin Feature Flags page driven by a typed registry in `src/lib/features.ts`. Resolve missing or malformed values to explicit code defaults. Enforce every flag in UI and server actions (and Cron for Odoo sync).

### Registry (all default `true`)

| Key | Controls |
|-----|----------|
| `contracts_opening_balance` | Opening balance fields on create/import |
| `contracts_multi_line` | Creating/expanding multi-unit/service contracts |
| `odoo_import_center` | Odoo import preview/commit |
| `units_create_odoo_product` | Create Odoo product from unit |
| `units_link_odoo_product` | Link unit to Odoo product / create unit from product |
| `units_odoo_catalog_button` | Load Odoo Products catalog button |
| `odoo_cron_sync` | Scheduled Odoo cron side effects |
| `odoo_invoices_documents` | Odoo documents UI and invoice sync retries (local issue/pay remain) |
| `import_excel_contracts` | Excel/CSV contract import |
| `reports_operational` | Debt aging + location statement pages |
| `invoices_payment_status_pages` | Partial/fully paid pages |
| `master_data_mutations` | Unit/location create/edit/delete/import |
| `admin_experimental` | Advanced Odoo setup tools in Settings |

### Enforcement paths

| Layer | Path |
|-------|------|
| Loader | `src/lib/features/load-feature-flags.ts` (request-cached, `feature_flag.*` keys only) |
| Pure guards | `src/lib/features/guards.ts` |
| Admin UI | `/[locale]/feature-flags` + `updateFeatureFlag` allowlist + audit |
| Navigation | Dashboard layout → DashboardShell → Sidebar (`flagKey` / import composite) |
| Contracts | `src/lib/actions/contracts.ts` + Excel import in `admin.ts` |
| Units / locations | `units.ts`, `locations.ts`, related Odoo product actions |
| Odoo | `odoo.ts` actions; invoice-service skips Odoo enqueue when documents flag is off |
| Cron | `src/app/api/cron/odoo-sync/route.ts` returns `{ skipped: true }` after `CRON_SECRET` check |

## Rejected alternatives

- Environment variables require a deployment for every change.
- Browser storage is user-specific, untrusted, and cannot provide a system-wide setting.
- A new feature-flags table adds schema and policy overhead before the application needs flag targeting or rollout rules.

## Consequences

- Flag changes are system-wide, audited, and take effect after Next.js path revalidation.
- Only users with `feature_flags.manage` can view or update flags.
- New flags must be added to the typed registry, translations, UI groups, and server guards.
- Existing settings RLS policies continue to protect persistence; no migration is required.
- `admin_experimental` never hides the Feature Flags page itself, to avoid self-lockout.

## Compatibility

All flags default to enabled when settings rows do not exist, preserving current workflows until an administrator explicitly disables them. Existing multi-line contracts remain viewable when `contracts_multi_line` is off; only new multi-line creation/expansion is blocked. Disabling `odoo_invoices_documents` keeps local invoice issue and payment recording available.

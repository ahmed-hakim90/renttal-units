# Granular role permissions (RBAC)

## Problem

Staff access was limited to two fixed roles (`admin_editor` / `viewer`). Operators need to create custom roles and grant specific actions (view, create, update, delete, record payment, manage imports, etc.) without giving full system access.

## Decision

Introduce database-backed RBAC:

- Global permission catalog keyed by action (`units.view`, `payments.record`, …).
- Custom roles with a many-to-many grant table.
- Each profile references one role (`profiles.role_id`).
- Enforce permissions in three layers: Postgres RLS/RPCs, server actions/services, and UI visibility.
- Permissions are **system-wide** (not location-scoped) in this phase.

System roles:

- `admin_editor` — protected owner role with every permission; cannot be deleted; last assignee cannot be demoted.
- `viewer` — seeded read permissions for operational modules; editable grants only through role management for custom roles (system role grants are editable only for custom copies).

`profiles.role` enum remains as a compatibility shim synced from the assigned role slug (`admin_editor` vs everything else → `viewer`).

## Rejected alternatives

- Module-only access (enter/deny a section) — too coarse for payment, import, and settings workflows.
- Location-scoped roles in v1 — large schema/RLS change; deferred until product requires it.
- JWT/`user_metadata` permission claims — editable by the client and unsafe for authorization.

## Consequences

- New pages and actions must call `requirePermission` / `has_permission`, not only `isAdminEditor`.
- New permission keys must be added to the typed catalog, seeded in migration (or follow-up migration), and localized.
- Write permissions always imply the matching view permission when saving a role.
- Cron/service-role paths remain outside user RBAC and continue to use trusted system credentials.

## Compatibility

Existing `admin_editor` and `viewer` users are backfilled onto the seeded system roles so access does not change on deploy. `is_admin_editor()` remains for legacy call sites and returns true only for the system owner role.

## Remote migration history note

The local migration file `supabase/migrations/20260729221934_granular_role_permissions.sql` is monolithic. On the linked production project it was applied as split history entries (`granular_role_permissions`, `granular_role_permissions_rpc_guards`, `revoke_assert_permission_rpc_from_clients`) plus later `atomic_contract_cancellation`. Do not re-run the full local file blindly against that project; reconcile with `supabase migration list` before any `db push`.

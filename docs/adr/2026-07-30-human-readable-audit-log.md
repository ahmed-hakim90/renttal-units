# Human-readable audit log

## Status

Accepted.

## Problem

Business mutations already write append-only JSON snapshots to `audit_logs`, but operators
cannot review them in the application. Rendering those snapshots directly would expose
internal fields, produce unclear details, and make future secret-bearing fields easy to leak.
User email and password administration also need a traceable security history.

## Decision

- Audit reads are exposed only through server actions guarded by `audit.view`.
- The trusted server read repository uses the Supabase admin client only after that
  application permission check. It returns a minimal actor projection and never reaches a
  client directly.
- A formatter allowlists safe, primitive business fields and limits each event to 20 changes.
  Unknown, nested, and secret-like fields are omitted instead of being rendered as raw JSON.
- User name and email changes record their old and new values. Password events record only
  that a change succeeded; password values and password characteristics are never logged.
- Global history is paginated newest-first. User activity is bounded and filtered to the
  target profile.

## Rejected alternatives

- Rendering JSONB directly was rejected because it is unclear and unsafe.
- Granting `audit.view` broad profile-table access was rejected; actor lookup remains inside
  the trusted server repository.
- Moving all existing payloads to a new schema was rejected to avoid a destructive historical
  migration.

## Consequences

- New audit fields require an explicit formatter allowlist and translation before display.
- Auth user updates and profile updates cannot share a database transaction. Email changes
  use a compensating Auth rollback if the profile update fails. Password reset clears the
  forced-change flag first and restores it if the Auth update fails.
- An index on `created_at` and an entity timeline index keep global and per-user reads bounded.


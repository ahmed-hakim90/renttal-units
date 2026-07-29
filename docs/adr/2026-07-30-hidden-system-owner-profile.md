# Hidden system-owner profile

## Status

Accepted.

## Problem

The bootstrap system-owner account is an operational recovery identity, not a staff account.
Showing it in user administration or audit details exposes its login identity and lets ordinary
user managers target it.

## Decision

- Profiles assigned to a role with `is_system_owner = true` are excluded from user lists.
- Profile RLS hides those profiles from other users, including users with `users.manage`.
- The owner may still read its own profile because session loading depends on that access.
- Only a system owner may update another protected owner profile.
- Audit events targeting protected profiles are omitted, and protected actors are shown as a
  generic system actor without name or email.
- Protection is role-based and never depends on a hardcoded email address.

## Consequences

The protected account remains usable for authentication and emergency administration but is
not discoverable through normal staff-management or audit interfaces. Database administrators
and trusted service-role code can still access it for recovery.


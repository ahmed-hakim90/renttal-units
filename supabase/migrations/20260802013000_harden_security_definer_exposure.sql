-- Keep SQL-internal contract implementations behind their permission-checked
-- public wrappers. Revoking these direct PostgREST entry points reduces the
-- SECURITY DEFINER surface without moving user mutations to service_role.
REVOKE ALL ON FUNCTION public.create_contract_with_schedule_atomic(
  JSONB,
  JSONB,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_contract_draft_atomic(
  UUID,
  JSONB,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.activate_contract_draft_atomic(
  UUID,
  JSONB,
  JSONB,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated;

-- This legacy role helper is no longer used by application code or RLS.
-- has_permission() and is_admin_editor() remain executable because policies
-- depend on them.
REVOKE ALL ON FUNCTION public.get_user_role()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_contract_with_schedule_atomic(
  JSONB,
  JSONB,
  JSONB,
  JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION public.save_contract_draft_atomic(
  UUID,
  JSONB,
  JSONB,
  JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION public.activate_contract_draft_atomic(
  UUID,
  JSONB,
  JSONB,
  JSONB,
  JSONB
) TO service_role;

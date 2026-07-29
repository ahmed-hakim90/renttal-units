-- Keep the privileged cancellation implementation outside the exposed public
-- schema. The public Data API entry point remains SECURITY INVOKER and delegates
-- to the permission-checked private implementation.

ALTER FUNCTION public.cancel_contract_atomic(UUID, DATE, TEXT)
  SET SCHEMA private;

ALTER FUNCTION private.cancel_contract_atomic(UUID, DATE, TEXT)
  RENAME TO cancel_contract_atomic_impl;

REVOKE ALL ON FUNCTION private.cancel_contract_atomic_impl(UUID, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cancel_contract_atomic_impl(UUID, DATE, TEXT)
  TO authenticated, service_role;

CREATE FUNCTION public.cancel_contract_atomic(
  p_contract_id UUID,
  p_cancellation_date DATE,
  p_cancellation_handling TEXT
)
RETURNS public.contracts
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.cancel_contract_atomic_impl(
    p_contract_id,
    p_cancellation_date,
    p_cancellation_handling
  );
$$;

REVOKE ALL ON FUNCTION public.cancel_contract_atomic(UUID, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_contract_atomic(UUID, DATE, TEXT)
  TO authenticated, service_role;

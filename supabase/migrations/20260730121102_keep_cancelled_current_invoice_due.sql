-- Keep unissued cancellation-period invoices in the persisted `due` state.
-- Overdue is derived at read time from due_date, and Due Now intentionally
-- queries persisted `due` rows.

ALTER FUNCTION private.cancel_contract_atomic_impl(UUID, DATE, TEXT)
  RENAME TO cancel_contract_atomic_core;

REVOKE ALL ON FUNCTION private.cancel_contract_atomic_core(UUID, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.cancel_contract_atomic_impl(
  p_contract_id UUID,
  p_cancellation_date DATE,
  p_cancellation_handling TEXT
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cancelled public.contracts;
BEGIN
  v_cancelled := private.cancel_contract_atomic_core(
    p_contract_id,
    p_cancellation_date,
    p_cancellation_handling
  );

  PERFORM set_config('app.cancel_contract_atomic', 'on', true);
  UPDATE public.invoices
  SET status = 'due'::public.invoice_status
  WHERE contract_id = p_contract_id
    AND period_start <= p_cancellation_date
    AND period_end >= p_cancellation_date
    AND status = 'overdue'
    AND paid_amount = 0
    AND odoo_invoice_id IS NULL
    AND odoo_invoice_state IS NULL;

  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION private.cancel_contract_atomic_impl(UUID, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cancel_contract_atomic_impl(UUID, DATE, TEXT)
  TO authenticated, service_role;

-- Repair rows produced by the previous implementation without changing issued,
-- synchronized, paid, or unrelated overdue invoices.
SELECT set_config('app.cancel_contract_atomic', 'on', true);

UPDATE public.invoices AS invoice
SET status = 'due'::public.invoice_status
FROM public.contracts AS contract
WHERE invoice.contract_id = contract.id
  AND contract.status = 'cancelled'
  AND contract.cancellation_date IS NOT NULL
  AND invoice.period_start <= contract.cancellation_date
  AND invoice.period_end >= contract.cancellation_date
  AND invoice.status = 'overdue'
  AND invoice.paid_amount = 0
  AND invoice.odoo_invoice_id IS NULL
  AND invoice.odoo_invoice_state IS NULL;

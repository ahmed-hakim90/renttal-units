-- Scheduled invoices already receive a server-generated DUE number at insert.
-- Issuing one must preserve that number rather than accepting operator input.

CREATE OR REPLACE FUNCTION public.issue_due_invoice_atomic(
  p_invoice_id UUID
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF NOT public.has_permission('invoices.update') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.status <> 'due' THEN
    RAISE EXCEPTION 'INVALID_INVOICE_STATUS' USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.invoice_number IS NULL OR btrim(v_invoice.invoice_number) = '' THEN
    RAISE EXCEPTION 'INVOICE_NUMBER_MISSING' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.issue_due_invoice_atomic', 'on', true);

  UPDATE public.invoices
  SET status = 'invoice_issued',
      issued_at = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_due_invoice_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_due_invoice_atomic(UUID) TO authenticated;

-- Retain the old signature for migration compatibility but remove client access.
REVOKE ALL ON FUNCTION public.issue_due_invoice_atomic(UUID, TEXT) FROM authenticated;

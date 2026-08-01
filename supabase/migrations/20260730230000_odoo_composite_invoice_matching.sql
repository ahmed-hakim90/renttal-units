-- A local scheduled invoice can contain rental and service lines while Odoo
-- stores those as separate invoice lines. For a single rental line, validate
-- against the full Odoo document total so attached services remain included.

CREATE OR REPLACE FUNCTION public.link_odoo_import_invoice_atomic(
  p_odoo_invoice_id BIGINT,
  p_odoo_line_id BIGINT,
  p_contract_id UUID,
  p_local_invoice_id UUID
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.odoo_invoice_documents;
  v_line public.odoo_invoice_lines;
  v_contract public.contracts;
  v_invoice public.invoices;
  v_paid NUMERIC(14, 2);
  v_expected_amount NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_permission('odoo.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_odoo_invoice_id IS NULL OR p_odoo_invoice_id <= 0
    OR p_odoo_line_id IS NULL OR p_odoo_line_id <= 0
    OR p_contract_id IS NULL OR p_local_invoice_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ODOO_INVOICE_LINK' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_document
  FROM public.odoo_invoice_documents
  WHERE odoo_invoice_id = p_odoo_invoice_id
  FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'ODOO_DOCUMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_line
  FROM public.odoo_invoice_lines
  WHERE odoo_line_id = p_odoo_line_id
    AND document_id = v_document.id
    AND is_rental = TRUE
  FOR UPDATE;
  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'ODOO_RENTAL_LINE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;
  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_local_invoice_id
  FOR UPDATE;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.contract_id IS DISTINCT FROM v_contract.id THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_CONTRACT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_line.unit_id IS NULL OR v_invoice.unit_id IS DISTINCT FROM v_line.unit_id THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_UNIT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_invoice.period_start IS DISTINCT FROM v_line.period_start
    OR v_invoice.period_end IS DISTINCT FROM v_line.period_end THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_PERIOD_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_contract.start_date IS NULL OR v_contract.end_date IS NULL
    OR v_invoice.period_start < v_contract.start_date
    OR v_invoice.period_end > v_contract.end_date THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_OUTSIDE_CONTRACT' USING ERRCODE = '23514';
  END IF;
  IF v_contract.status <> 'active'
    AND v_invoice.odoo_invoice_id IS DISTINCT FROM p_odoo_invoice_id THEN
    RAISE EXCEPTION 'CONTRACT_NOT_ACTIVE' USING ERRCODE = '23514';
  END IF;
  IF v_document.tenant_id IS NOT NULL
    AND v_contract.tenant_id IS DISTINCT FROM v_document.tenant_id THEN
    RAISE EXCEPTION 'CONTRACT_TENANT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COUNT(*) = 1 THEN v_document.amount_total
    ELSE v_line.amount_total
  END
  INTO v_expected_amount
  FROM public.odoo_invoice_lines
  WHERE document_id = v_document.id
    AND is_rental = TRUE;

  IF ABS(COALESCE(v_invoice.amount_total, 0) - COALESCE(v_expected_amount, 0)) > 0.02 THEN
    RAISE EXCEPTION 'LOCAL_INVOICE_AMOUNT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.invoices other_invoice
    WHERE other_invoice.odoo_invoice_id = p_odoo_invoice_id
      AND other_invoice.id <> v_invoice.id
  ) THEN
    RAISE EXCEPTION 'ODOO_INVOICE_ALREADY_LINKED' USING ERRCODE = '23505';
  END IF;

  v_paid := CASE
    WHEN v_document.move_state = 'posted' AND COALESCE(v_document.amount_total, 0) > 0 THEN
      LEAST(
        v_invoice.amount,
        ROUND(
          v_invoice.amount
          * GREATEST(0, v_document.amount_paid)
          / v_document.amount_total,
          2
        )
      )
    ELSE v_invoice.paid_amount
  END;

  UPDATE public.odoo_invoice_lines
  SET contract_id = v_contract.id,
      local_invoice_id = v_invoice.id,
      mapping_status = 'matched',
      review_reason = NULL
  WHERE id = v_line.id;

  UPDATE public.odoo_invoice_lines
  SET contract_id = v_contract.id,
      mapping_status = 'service',
      review_reason = NULL
  WHERE document_id = v_document.id
    AND is_rental = FALSE
    AND (
      SELECT COUNT(*)
      FROM public.odoo_invoice_lines rental_line
      WHERE rental_line.document_id = v_document.id
        AND rental_line.is_rental = TRUE
    ) = 1;

  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE public.invoices
  SET
    odoo_invoice_id = v_document.odoo_invoice_id,
    odoo_invoice_name = v_document.invoice_name,
    odoo_invoice_state = v_document.move_state,
    odoo_payment_state = v_document.payment_state,
    odoo_amount_total = v_document.amount_total,
    odoo_amount_paid = v_document.amount_paid,
    odoo_amount_residual = v_document.amount_residual,
    odoo_sync_status = 'synced',
    odoo_sync_error = NULL,
    paid_amount = v_paid,
    status = CASE
      WHEN v_document.move_state = 'draft' THEN v_invoice.status
      WHEN v_document.payment_state = 'paid' OR v_document.amount_residual <= 0.005
        THEN 'fully_paid'::invoice_status
      WHEN v_paid > 0 THEN 'partially_paid'::invoice_status
      ELSE 'invoice_issued'::invoice_status
    END,
    issued_at = CASE
      WHEN v_document.move_state = 'posted' THEN COALESCE(v_invoice.issued_at, NOW())
      ELSE v_invoice.issued_at
    END
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.link_odoo_import_invoice_atomic(
  BIGINT, BIGINT, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_odoo_import_invoice_atomic(
  BIGINT, BIGINT, UUID, UUID
) TO authenticated, service_role;

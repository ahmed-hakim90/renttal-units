-- Link reviewed Odoo invoice lines to existing local contract invoices.
-- Odoo remains the source of document/payment state; no local invoices or
-- contracts are created by this workflow.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS odoo_payment_state TEXT,
  ADD COLUMN IF NOT EXISTS odoo_amount_total NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS odoo_amount_paid NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS odoo_amount_residual NUMERIC(14, 2);

CREATE OR REPLACE FUNCTION public.prevent_odoo_managed_payment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.id = NEW.invoice_id
      AND invoice.odoo_payment_state IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAYMENT_MANAGED_BY_ODOO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_odoo_source_guard ON public.payments;
CREATE TRIGGER payments_odoo_source_guard
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_odoo_managed_payment_insert();

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
  IF ABS(COALESCE(v_invoice.amount_total, 0) - COALESCE(v_line.amount_total, 0)) > 0.02 THEN
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

CREATE OR REPLACE FUNCTION public.sync_local_invoice_from_odoo(
  p_odoo_invoice_id BIGINT,
  p_invoice_name TEXT,
  p_move_state TEXT,
  p_payment_state TEXT,
  p_amount_total NUMERIC,
  p_amount_residual NUMERIC
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_paid NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_permission('odoo.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE odoo_invoice_id = p_odoo_invoice_id
  FOR UPDATE;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_paid := CASE
    WHEN COALESCE(p_amount_total, 0) > 0 THEN
      LEAST(
        v_invoice.amount,
        ROUND(
          v_invoice.amount
          * GREATEST(0, p_amount_total - COALESCE(p_amount_residual, 0))
          / p_amount_total,
          2
        )
      )
    ELSE 0
  END;

  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE public.invoices
  SET
    odoo_invoice_name = NULLIF(p_invoice_name, ''),
    odoo_invoice_state = p_move_state,
    odoo_payment_state = p_payment_state,
    odoo_amount_total = p_amount_total,
    odoo_amount_paid = GREATEST(0, p_amount_total - COALESCE(p_amount_residual, 0)),
    odoo_amount_residual = p_amount_residual,
    odoo_sync_status = 'synced',
    odoo_sync_error = NULL,
    paid_amount = CASE WHEN p_move_state = 'posted' THEN v_paid ELSE paid_amount END,
    status = CASE
      WHEN p_move_state = 'draft' THEN status
      WHEN p_payment_state = 'paid' OR COALESCE(p_amount_residual, 0) <= 0.005
        THEN 'fully_paid'::invoice_status
      WHEN v_paid > 0 THEN 'partially_paid'::invoice_status
      ELSE 'invoice_issued'::invoice_status
    END,
    issued_at = CASE
      WHEN p_move_state = 'posted' THEN COALESCE(issued_at, NOW())
      ELSE issued_at
    END
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_local_invoice_from_odoo(
  BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_local_invoice_from_odoo(
  BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) TO authenticated, service_role;

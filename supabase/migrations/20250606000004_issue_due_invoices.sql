-- Secure issuance of due invoices without asking for period dates again.

CREATE OR REPLACE FUNCTION issue_due_invoice_atomic(
  p_invoice_id UUID,
  p_invoice_number TEXT
)
RETURNS invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
BEGIN
  IF NOT is_admin_editor() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_invoice_number IS NULL OR btrim(p_invoice_number) = '' THEN
    RAISE EXCEPTION 'INVOICE_NUMBER_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.status <> 'due' THEN
    RAISE EXCEPTION 'INVALID_INVOICE_STATUS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invoices
    WHERE invoice_number = btrim(p_invoice_number)
      AND id <> p_invoice_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_NUMBER' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.issue_due_invoice_atomic', 'on', true);

  UPDATE invoices
  SET
    invoice_number = btrim(p_invoice_number),
    status = 'invoice_issued',
    issued_at = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION prevent_direct_invoice_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  AND current_setting('app.record_payment_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.issue_due_invoice_atomic', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVOICE_PAYMENT_FIELDS_REQUIRE_RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

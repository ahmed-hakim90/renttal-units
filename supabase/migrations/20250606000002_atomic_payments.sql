-- Atomic payment recording to prevent concurrent overpayment.

ALTER TABLE invoices
  ADD CONSTRAINT amount_positive CHECK (amount > 0),
  ADD CONSTRAINT paid_amount_non_negative CHECK (paid_amount >= 0);

CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method payment_method,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT auth.uid()
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_new_paid_amount NUMERIC(12,2);
  v_new_status invoice_status;
BEGIN
  IF NOT is_admin_editor() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22003';
  END IF;

  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.status = 'fully_paid' THEN
    RAISE EXCEPTION 'FULLY_PAID' USING ERRCODE = 'P0001';
  END IF;

  v_new_paid_amount := v_invoice.paid_amount + p_amount;

  IF v_new_paid_amount > v_invoice.amount THEN
    RAISE EXCEPTION 'EXCEEDS_BALANCE' USING ERRCODE = 'P0001';
  END IF;

  IF v_new_paid_amount = v_invoice.amount THEN
    v_new_status := 'fully_paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  INSERT INTO payments (
    invoice_id,
    amount,
    payment_date,
    payment_method,
    reference_number,
    notes,
    created_by
  )
  VALUES (
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_reference_number,
    p_notes,
    auth.uid()
  )
  RETURNING * INTO v_payment;

  PERFORM set_config('app.record_payment_atomic', 'on', true);

  UPDATE invoices
  SET
    paid_amount = v_new_paid_amount,
    status = v_new_status
  WHERE id = p_invoice_id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) TO authenticated;

DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;

CREATE OR REPLACE FUNCTION prevent_payment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PAYMENTS_ARE_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS payments_append_only ON payments;
CREATE TRIGGER payments_append_only
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_changes();

CREATE OR REPLACE FUNCTION prevent_direct_invoice_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
    OR OLD.status IS DISTINCT FROM NEW.status
  ) AND current_setting('app.record_payment_atomic', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVOICE_PAYMENT_FIELDS_REQUIRE_RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_payment_fields_guard ON invoices;
CREATE TRIGGER invoices_payment_fields_guard
  BEFORE UPDATE OF paid_amount, status ON invoices
  FOR EACH ROW EXECUTE FUNCTION prevent_direct_invoice_payment_update();

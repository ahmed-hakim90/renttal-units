-- Cancelling a contract changes the contract, its current invoice snapshot,
-- future invoices, and the audit trail as one financial transaction.

CREATE OR REPLACE FUNCTION public.prevent_direct_invoice_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  AND current_setting('app.record_payment_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.issue_due_invoice_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.odoo_invoice_sync', true) IS DISTINCT FROM 'on'
  AND current_setting('app.cancel_contract_atomic', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVOICE_PAYMENT_FIELDS_REQUIRE_RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_contract_atomic(
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
  v_contract public.contracts;
  v_cancelled public.contracts;
  v_current public.invoices;
  v_original_amount NUMERIC(14, 2);
  v_prorated_amount NUMERIC(14, 2);
  v_total_days INTEGER;
  v_used_days INTEGER;
  v_line RECORD;
  v_line_count INTEGER := 0;
  v_line_index INTEGER := 0;
  v_assigned_total NUMERIC(14, 2) := 0;
  v_line_total NUMERIC(14, 2);
  v_amount_untaxed NUMERIC(14, 2);
  v_amount_tax NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.has_permission('contracts.update')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_cancellation_date IS NULL
     OR p_cancellation_handling NOT IN ('keep_current_full', 'prorate_current') THEN
    RAISE EXCEPTION 'INVALID_CANCELLATION_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.status <> 'active' THEN
    RAISE EXCEPTION 'CONTRACT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;
  IF p_cancellation_date < v_contract.start_date
     OR p_cancellation_date > v_contract.end_date THEN
    RAISE EXCEPTION 'CANCELLATION_DATE_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;

  -- Serialize cancellation against invoice issuing, payment, and sync updates.
  PERFORM id
  FROM public.invoices
  WHERE contract_id = p_contract_id
  ORDER BY period_start, id
  FOR UPDATE;

  -- A posted/issued or paid future invoice needs a credit note or refund flow.
  -- Never silently rewrite or delete that accounting history.
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE contract_id = p_contract_id
      AND period_start > p_cancellation_date
      AND (
        paid_amount > 0
        OR status NOT IN ('due', 'overdue')
        OR odoo_invoice_id IS NOT NULL
        OR odoo_invoice_state IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'CANCELLATION_HAS_ISSUED_INVOICES' USING ERRCODE = '22023';
  END IF;

  IF p_cancellation_handling = 'prorate_current' THEN
    SELECT *
    INTO v_current
    FROM public.invoices
    WHERE contract_id = p_contract_id
      AND period_start <= p_cancellation_date
      AND period_end >= p_cancellation_date
    LIMIT 1;

    IF v_current.id IS NOT NULL THEN
      IF v_current.status = 'invoice_issued'
         OR v_current.odoo_invoice_id IS NOT NULL
         OR v_current.odoo_invoice_state IS NOT NULL THEN
        RAISE EXCEPTION 'CANCELLATION_HAS_ISSUED_INVOICES' USING ERRCODE = '22023';
      END IF;

      v_original_amount := v_current.amount;
      v_total_days := v_current.period_end - v_current.period_start + 1;
      v_used_days := p_cancellation_date - v_current.period_start + 1;
      v_prorated_amount := ROUND(
        v_original_amount * LEAST(GREATEST(v_used_days, 0), v_total_days) / v_total_days,
        2
      );

      IF v_current.paid_amount > v_prorated_amount THEN
        RAISE EXCEPTION 'CANCELLATION_REQUIRES_SETTLEMENT' USING ERRCODE = '22023';
      END IF;

      SELECT COUNT(*)
      INTO v_line_count
      FROM public.invoice_lines
      WHERE invoice_id = v_current.id;

      IF v_line_count > 0 THEN
        FOR v_line IN
          SELECT *
          FROM public.invoice_lines
          WHERE invoice_id = v_current.id
          ORDER BY sort_order, id
          FOR UPDATE
        LOOP
          v_line_index := v_line_index + 1;
          v_line_total := CASE
            WHEN v_line_index = v_line_count
              THEN v_prorated_amount - v_assigned_total
            ELSE GREATEST(
              0,
              LEAST(
                ROUND(v_prorated_amount * v_line.amount_total / v_original_amount, 2),
                v_prorated_amount - v_assigned_total
              )
            )
          END;
          v_amount_untaxed := ROUND(v_line_total / (1 + v_line.tax_rate / 100), 2);
          v_amount_tax := v_line_total - v_amount_untaxed;

          UPDATE public.invoice_lines
          SET
            amount_untaxed = v_amount_untaxed,
            amount_tax = v_amount_tax,
            amount_total = v_line_total
          WHERE id = v_line.id;

          v_assigned_total := v_assigned_total + v_line_total;
        END LOOP;

        SELECT
          SUM(amount_untaxed),
          SUM(amount_tax)
        INTO v_amount_untaxed, v_amount_tax
        FROM public.invoice_lines
        WHERE invoice_id = v_current.id;
      ELSE
        v_amount_untaxed := ROUND(
          v_prorated_amount * v_current.amount_untaxed / NULLIF(v_original_amount, 0),
          2
        );
        v_amount_tax := v_prorated_amount - v_amount_untaxed;
      END IF;

      PERFORM set_config('app.cancel_contract_atomic', 'on', true);
      UPDATE public.invoices
      SET
        amount_untaxed = v_amount_untaxed,
        amount_tax = v_amount_tax,
        amount_total = v_prorated_amount,
        amount = v_prorated_amount,
        status = CASE
          WHEN paid_amount >= v_prorated_amount AND v_prorated_amount > 0
            THEN 'fully_paid'::public.invoice_status
          WHEN paid_amount > 0
            THEN 'partially_paid'::public.invoice_status
          ELSE 'due'::public.invoice_status
        END
      WHERE id = v_current.id;
    END IF;
  END IF;

  DELETE FROM public.invoices
  WHERE contract_id = p_contract_id
    AND period_start > p_cancellation_date
    AND paid_amount = 0
    AND status IN ('due', 'overdue')
    AND odoo_invoice_id IS NULL
    AND odoo_invoice_state IS NULL;

  UPDATE public.contracts
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_date = p_cancellation_date,
    cancellation_handling = p_cancellation_handling
  WHERE id = p_contract_id
  RETURNING * INTO v_cancelled;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    'cancel',
    'contract',
    p_contract_id,
    to_jsonb(v_contract),
    to_jsonb(v_cancelled)
  );

  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_contract_atomic(UUID, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_contract_atomic(UUID, DATE, TEXT)
  TO authenticated, service_role;

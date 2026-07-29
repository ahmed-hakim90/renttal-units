-- Local contracts are the billing source of truth. Odoo only receives issued
-- invoice snapshots and later supplies posting/payment state.

INSERT INTO settings (key, value)
VALUES ('due_reminder_days', '7'::JSONB)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE contract_lines
  ADD COLUMN odoo_product_id BIGINT,
  ADD COLUMN odoo_product_name TEXT,
  ADD COLUMN tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (tax_rate >= 0 AND tax_rate <= 100);

UPDATE contract_lines cl
SET
  odoo_product_id = COALESCE(cl.odoo_product_id, u.odoo_product_id),
  odoo_product_name = COALESCE(cl.odoo_product_name, u.odoo_product_reference),
  tax_rate = CASE WHEN c.tax_mode = 'taxable' THEN 15 ELSE 0 END
FROM contracts c
LEFT JOIN units u ON u.id = cl.unit_id
WHERE c.id = cl.contract_id;

CREATE INDEX idx_contract_lines_odoo_product
  ON contract_lines(odoo_product_id)
  WHERE odoo_product_id IS NOT NULL;

ALTER TABLE contracts
  ADD COLUMN paid_through_date DATE,
  ADD COLUMN opening_paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (opening_paid_amount >= 0),
  ADD COLUMN opening_payment_date DATE,
  ADD COLUMN opening_notes TEXT,
  ADD COLUMN opening_balance_total NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (opening_balance_total >= 0),
  ADD CONSTRAINT contracts_paid_through_in_period CHECK (
    paid_through_date IS NULL
    OR (paid_through_date >= start_date AND paid_through_date <= end_date)
  ),
  ADD CONSTRAINT contracts_opening_payment_in_period CHECK (
    opening_payment_date IS NULL
    OR (opening_payment_date >= start_date AND opening_payment_date <= end_date)
  );

ALTER TABLE invoices
  ADD COLUMN amount_untaxed NUMERIC(14, 2),
  ADD COLUMN amount_tax NUMERIC(14, 2),
  ADD COLUMN amount_total NUMERIC(14, 2);

UPDATE invoices
SET
  amount_untaxed = amount,
  amount_tax = 0,
  amount_total = amount
WHERE amount_untaxed IS NULL OR amount_tax IS NULL OR amount_total IS NULL;

ALTER TABLE invoices
  ALTER COLUMN amount_untaxed SET NOT NULL,
  ALTER COLUMN amount_tax SET NOT NULL,
  ALTER COLUMN amount_total SET NOT NULL,
  ALTER COLUMN amount_untaxed SET DEFAULT 0,
  ALTER COLUMN amount_tax SET DEFAULT 0,
  ALTER COLUMN amount_total SET DEFAULT 0,
  ADD CONSTRAINT invoices_amount_breakdown_nonnegative CHECK (
    amount_untaxed >= 0 AND amount_tax >= 0 AND amount_total >= 0
  ),
  ADD CONSTRAINT invoices_total_matches_amount CHECK (amount_total = amount);

CREATE OR REPLACE FUNCTION hydrate_invoice_amount_breakdown()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.amount > 0 AND COALESCE(NEW.amount_total, 0) = 0 THEN
    NEW.amount_untaxed := NEW.amount;
    NEW.amount_tax := 0;
    NEW.amount_total := NEW.amount;
  ELSIF TG_OP = 'UPDATE' AND NEW.amount IS DISTINCT FROM OLD.amount
    AND NEW.amount_total IS NOT DISTINCT FROM OLD.amount_total THEN
    NEW.amount_total := NEW.amount;
    NEW.amount_untaxed := GREATEST(0, NEW.amount - NEW.amount_tax);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hydrate_invoice_amount_breakdown_trigger
  BEFORE INSERT OR UPDATE OF amount, amount_untaxed, amount_tax, amount_total
  ON invoices
  FOR EACH ROW EXECUTE FUNCTION hydrate_invoice_amount_breakdown();

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  contract_line_id UUID REFERENCES contract_lines(id) ON DELETE SET NULL,
  line_type contract_line_type NOT NULL,
  unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  odoo_product_id BIGINT,
  odoo_product_name TEXT,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount_untaxed NUMERIC(14, 2) NOT NULL CHECK (amount_untaxed >= 0),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  amount_tax NUMERIC(14, 2) NOT NULL CHECK (amount_tax >= 0),
  amount_total NUMERIC(14, 2) NOT NULL CHECK (amount_total >= 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_lines_period_order CHECK (period_end >= period_start),
  CONSTRAINT invoice_lines_total_matches CHECK (
    amount_total = amount_untaxed + amount_tax
  )
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id, sort_order);
CREATE INDEX idx_invoice_lines_contract_line
  ON invoice_lines(contract_line_id)
  WHERE contract_line_id IS NOT NULL;
CREATE INDEX idx_invoice_lines_odoo_product
  ON invoice_lines(odoo_product_id)
  WHERE odoo_product_id IS NOT NULL;
CREATE INDEX idx_invoice_lines_unit
  ON invoice_lines(unit_id)
  WHERE unit_id IS NOT NULL;

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_select ON invoice_lines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY invoice_lines_insert ON invoice_lines
  FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY invoice_lines_update ON invoice_lines
  FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY invoice_lines_delete ON invoice_lines
  FOR DELETE TO authenticated USING (is_admin_editor());

CREATE TABLE contract_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, sha256)
);

CREATE INDEX idx_contract_attachments_contract
  ON contract_attachments(contract_id, created_at DESC);
CREATE INDEX idx_contract_attachments_uploaded_by
  ON contract_attachments(uploaded_by)
  WHERE uploaded_by IS NOT NULL;

ALTER TABLE contract_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_attachments_select ON contract_attachments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contract_attachments_insert ON contract_attachments
  FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY contract_attachments_delete ON contract_attachments
  FOR DELETE TO authenticated USING (is_admin_editor());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-documents',
  'contract-documents',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY contract_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contract-documents');
CREATE POLICY contract_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND public.is_admin_editor()
  );
CREATE POLICY contract_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND public.is_admin_editor()
  );

CREATE OR REPLACE FUNCTION replace_contract_lines(
  p_contract_id UUID,
  p_lines JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line JSONB;
  v_sort SMALLINT := 0;
  v_primary_unit UUID;
  v_total NUMERIC(14, 2) := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF jsonb_typeof(COALESCE(p_lines, '[]'::JSONB)) <> 'array'
     OR jsonb_array_length(COALESCE(p_lines, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;

  DELETE FROM contract_lines WHERE contract_id = p_contract_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO contract_lines (
      contract_id, line_type, unit_id, description, amount,
      period_start, period_end, odoo_line_id, odoo_product_id,
      odoo_product_name, tax_rate, sort_order
    ) VALUES (
      p_contract_id,
      COALESCE(NULLIF(v_line->>'lineType', '')::contract_line_type, 'rental'),
      NULLIF(v_line->>'unitId', '')::UUID,
      NULLIF(v_line->>'description', ''),
      COALESCE((v_line->>'amount')::NUMERIC, 0),
      NULLIF(v_line->>'periodStart', '')::DATE,
      NULLIF(v_line->>'periodEnd', '')::DATE,
      NULLIF(v_line->>'odooLineId', '')::BIGINT,
      NULLIF(v_line->>'odooProductId', '')::BIGINT,
      NULLIF(v_line->>'odooProductName', ''),
      COALESCE((v_line->>'taxRate')::NUMERIC, 0),
      COALESCE((v_line->>'sortOrder')::SMALLINT, v_sort)
    );
    v_total := v_total + COALESCE((v_line->>'amount')::NUMERIC, 0);
    IF v_primary_unit IS NULL
       AND COALESCE(NULLIF(v_line->>'lineType', ''), 'rental') = 'rental'
       AND NULLIF(v_line->>'unitId', '') IS NOT NULL THEN
      v_primary_unit := (v_line->>'unitId')::UUID;
    END IF;
    v_sort := v_sort + 1;
  END LOOP;

  IF v_primary_unit IS NULL THEN RAISE EXCEPTION 'RENTAL_LINE_REQUIRED'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED'; END IF;

  UPDATE contracts
  SET unit_id = v_primary_unit, total_amount = v_total
  WHERE id = p_contract_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_contract_with_schedule_atomic(
  p_contract JSONB,
  p_tenant JSONB,
  p_schedule JSONB,
  p_lines JSONB DEFAULT NULL
)
RETURNS contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts;
  v_tenant tenants;
  v_period JSONB;
  v_line JSONB;
  v_invoice_id UUID;
  v_contract_line_id UUID;
  v_partner_id BIGINT;
  v_national_id TEXT;
  v_lines JSONB;
  v_primary_unit UUID;
  v_total NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM contracts WHERE contract_number = p_contract->>'contractNumber'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CONTRACT_NUMBER';
  END IF;

  v_lines := COALESCE(p_lines, '[]'::JSONB);
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;

  SELECT (value->>'unitId')::UUID
  INTO v_primary_unit
  FROM jsonb_array_elements(v_lines) AS t(value)
  WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
    AND NULLIF(value->>'unitId', '') IS NOT NULL
  ORDER BY COALESCE((value->>'sortOrder')::INT, 0)
  LIMIT 1;
  IF v_primary_unit IS NULL THEN RAISE EXCEPTION 'RENTAL_LINE_REQUIRED'; END IF;

  SELECT COALESCE(SUM((value->>'amount')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(v_lines) AS t(value);
  IF v_total <= 0 THEN RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED'; END IF;

  PERFORM 1
  FROM units u
  WHERE u.id IN (
    SELECT DISTINCT (value->>'unitId')::UUID
    FROM jsonb_array_elements(v_lines) AS t(value)
    WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
      AND NULLIF(value->>'unitId', '') IS NOT NULL
  )
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM contract_lines cl
    JOIN contracts c ON c.id = cl.contract_id
    WHERE cl.line_type = 'rental'
      AND c.status = 'active'
      AND cl.unit_id IN (
        SELECT DISTINCT (value->>'unitId')::UUID
        FROM jsonb_array_elements(v_lines) AS t(value)
        WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
          AND NULLIF(value->>'unitId', '') IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS';
  END IF;

  v_partner_id := NULLIF(p_tenant->>'odooPartnerId', '')::BIGINT;
  v_national_id := NULLIF(p_tenant->>'nationalId', '');
  IF v_partner_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM tenants WHERE odoo_partner_id = v_partner_id FOR UPDATE;
  END IF;
  IF v_tenant.id IS NULL AND v_national_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM tenants WHERE national_id = v_national_id FOR UPDATE;
  END IF;
  IF v_tenant.id IS NULL THEN
    INSERT INTO tenants (
      full_name, phone, email, national_id, odoo_partner_id,
      vat, street, city, country_code
    ) VALUES (
      p_tenant->>'fullName',
      NULLIF(p_tenant->>'phone', ''),
      NULLIF(p_tenant->>'email', ''),
      v_national_id,
      v_partner_id,
      NULLIF(p_tenant->>'vat', ''),
      NULLIF(p_tenant->>'street', ''),
      NULLIF(p_tenant->>'city', ''),
      NULLIF(p_tenant->>'countryCode', '')
    ) RETURNING * INTO v_tenant;
  END IF;

  INSERT INTO contracts (
    unit_id, contract_number, tenant_id, start_date, end_date,
    total_amount, payment_cycle, tax_mode, status, notes,
    paid_through_date, opening_paid_amount, opening_payment_date,
    opening_notes, opening_balance_total, odoo_sync_status
  ) VALUES (
    v_primary_unit,
    p_contract->>'contractNumber',
    v_tenant.id,
    (p_contract->>'startDate')::DATE,
    (p_contract->>'endDate')::DATE,
    v_total,
    (p_contract->>'paymentCycle')::payment_cycle,
    COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
    'active',
    NULLIF(p_contract->>'notes', ''),
    NULLIF(p_contract->>'paidThroughDate', '')::DATE,
    COALESCE((p_contract->>'openingPaidAmount')::NUMERIC, 0),
    NULLIF(p_contract->>'openingPaymentDate', '')::DATE,
    NULLIF(p_contract->>'openingNotes', ''),
    COALESCE((p_contract->>'openingBalanceTotal')::NUMERIC, 0),
    'not_synced'
  ) RETURNING * INTO v_contract;

  PERFORM replace_contract_lines(v_contract.id, v_lines);

  UPDATE units
  SET tenant_id = v_tenant.id
  WHERE id IN (
    SELECT unit_id FROM contract_lines
    WHERE contract_id = v_contract.id
      AND line_type = 'rental'
      AND unit_id IS NOT NULL
  );

  FOR v_period IN SELECT value FROM jsonb_array_elements(COALESCE(p_schedule, '[]'::JSONB))
  LOOP
    INSERT INTO invoices (
      invoice_number, contract_id, unit_id, tenant_id,
      period_start, period_end, amount_untaxed, amount_tax,
      amount_total, amount, paid_amount, status, due_date,
      issued_at, notes
    ) VALUES (
      'DUE-' || v_contract.id || '-' || (v_period->>'periodStart'),
      v_contract.id,
      v_contract.unit_id,
      v_tenant.id,
      (v_period->>'periodStart')::DATE,
      (v_period->>'periodEnd')::DATE,
      (v_period->>'amountUntaxed')::NUMERIC,
      (v_period->>'amountTax')::NUMERIC,
      (v_period->>'amountTotal')::NUMERIC,
      (v_period->>'amountTotal')::NUMERIC,
      COALESCE((v_period->>'paidAmount')::NUMERIC, 0),
      (v_period->>'status')::invoice_status,
      COALESCE(NULLIF(v_period->>'dueDate', '')::DATE, (v_period->>'periodStart')::DATE),
      NULL,
      NULL
    ) RETURNING id INTO v_invoice_id;

    FOR v_line IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_period->'lineItems', '[]'::JSONB))
    LOOP
      SELECT id INTO v_contract_line_id
      FROM contract_lines
      WHERE contract_id = v_contract.id
        AND sort_order = COALESCE((v_line->>'sortOrder')::SMALLINT, 0)
      LIMIT 1;

      INSERT INTO invoice_lines (
        invoice_id, contract_line_id, line_type, unit_id, description,
        odoo_product_id, odoo_product_name, quantity,
        amount_untaxed, tax_rate, amount_tax, amount_total,
        period_start, period_end, sort_order
      ) VALUES (
        v_invoice_id,
        v_contract_line_id,
        (v_line->>'lineType')::contract_line_type,
        NULLIF(v_line->>'unitId', '')::UUID,
        COALESCE(NULLIF(v_line->>'description', ''), 'Contract line'),
        NULLIF(v_line->>'odooProductId', '')::BIGINT,
        NULLIF(v_line->>'odooProductName', ''),
        1,
        (v_line->>'amountUntaxed')::NUMERIC,
        COALESCE((v_line->>'taxRate')::NUMERIC, 0),
        (v_line->>'amountTax')::NUMERIC,
        (v_line->>'amountTotal')::NUMERIC,
        (v_period->>'periodStart')::DATE,
        (v_period->>'periodEnd')::DATE,
        COALESCE((v_line->>'sortOrder')::SMALLINT, 0)
      );
    END LOOP;
  END LOOP;

  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION replace_contract_lines(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION replace_contract_lines(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION sync_local_invoice_from_odoo(
  p_odoo_invoice_id BIGINT,
  p_invoice_name TEXT,
  p_move_state TEXT,
  p_payment_state TEXT,
  p_amount_total NUMERIC,
  p_amount_residual NUMERIC
)
RETURNS invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices;
  v_paid NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE odoo_invoice_id = p_odoo_invoice_id
  FOR UPDATE;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  v_paid := CASE
    WHEN COALESCE(p_amount_total, 0) > 0 THEN
      LEAST(
        v_invoice.amount,
        ROUND(v_invoice.amount * GREATEST(0, p_amount_total - COALESCE(p_amount_residual, 0)) / p_amount_total, 2)
      )
    ELSE 0
  END;

  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE invoices
  SET
    odoo_invoice_name = NULLIF(p_invoice_name, ''),
    odoo_invoice_state = p_move_state,
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

REVOKE ALL ON FUNCTION sync_local_invoice_from_odoo(
  BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_local_invoice_from_odoo(
  BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) TO authenticated, service_role;

-- Normalized Odoo imports may also touch linked local invoices. A draft in
-- Odoo is already issued locally, so it must never regress back to "due".
CREATE OR REPLACE FUNCTION sync_local_invoice_from_odoo_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE invoices
  SET
    odoo_invoice_name = NEW.invoice_name,
    odoo_invoice_state = NEW.move_state,
    odoo_sync_status = 'synced',
    odoo_sync_error = NULL,
    paid_amount = CASE
      WHEN NEW.move_state = 'posted' AND NEW.amount_total > 0
        THEN LEAST(amount, ROUND(amount * NEW.amount_paid / NEW.amount_total, 2))
      ELSE paid_amount
    END,
    status = CASE
      WHEN NEW.move_state = 'draft' THEN status
      WHEN NEW.payment_state = 'paid' OR NEW.amount_residual <= 0.005
        THEN 'fully_paid'::invoice_status
      WHEN NEW.amount_paid > 0 THEN 'partially_paid'::invoice_status
      ELSE 'invoice_issued'::invoice_status
    END,
    issued_at = CASE
      WHEN NEW.move_state = 'posted' THEN COALESCE(issued_at, NOW())
      ELSE issued_at
    END
  WHERE odoo_invoice_id = NEW.odoo_invoice_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sync_local_invoice_from_odoo_document()
  FROM PUBLIC, anon, authenticated;

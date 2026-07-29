-- Contract drafts: partial save without invoices / occupancy.
-- Activate generates the billing schedule and flips status to active.

-- Allow incomplete drafts on the contract header.
ALTER TABLE contracts
  ALTER COLUMN unit_id DROP NOT NULL,
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS positive_contract_amount,
  DROP CONSTRAINT IF EXISTS valid_contract_period;

ALTER TABLE contracts
  ADD CONSTRAINT positive_contract_amount CHECK (
    (status = 'draft' AND total_amount >= 0)
    OR (status <> 'draft' AND total_amount > 0)
  ),
  ADD CONSTRAINT valid_contract_period CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  ),
  ADD CONSTRAINT non_draft_contract_complete CHECK (
    status = 'draft'
    OR (
      unit_id IS NOT NULL
      AND start_date IS NOT NULL
      AND end_date IS NOT NULL
      AND total_amount > 0
    )
  );

-- Allow incomplete rental lines while the parent contract is still a draft.
-- Enforced for non-drafts inside replace_contract_lines / activate RPC.
ALTER TABLE contract_lines
  DROP CONSTRAINT IF EXISTS contract_lines_rental_requires_unit;

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
  v_status contract_status;
  v_soft BOOLEAN := false;
  v_line_type contract_line_type;
  v_unit_id UUID;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_permission('contracts.update')
     AND NOT public.has_permission('contracts.create') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT status INTO v_status FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
  END IF;
  v_soft := v_status = 'draft';

  IF jsonb_typeof(COALESCE(p_lines, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;

  IF NOT v_soft AND jsonb_array_length(COALESCE(p_lines, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;

  DELETE FROM contract_lines WHERE contract_id = p_contract_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB))
  LOOP
    v_line_type := COALESCE(NULLIF(v_line->>'lineType', '')::contract_line_type, 'rental');
    v_unit_id := NULLIF(v_line->>'unitId', '')::UUID;

    IF NOT v_soft AND v_line_type = 'rental' AND v_unit_id IS NULL THEN
      RAISE EXCEPTION 'RENTAL_LINE_REQUIRED';
    END IF;

    INSERT INTO contract_lines (
      contract_id, line_type, unit_id, description, amount,
      period_start, period_end, odoo_line_id, odoo_product_id,
      odoo_product_name, tax_rate, sort_order
    ) VALUES (
      p_contract_id,
      v_line_type,
      v_unit_id,
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
       AND v_line_type = 'rental'
       AND v_unit_id IS NOT NULL THEN
      v_primary_unit := v_unit_id;
    END IF;
    v_sort := v_sort + 1;
  END LOOP;

  IF NOT v_soft THEN
    IF v_primary_unit IS NULL THEN RAISE EXCEPTION 'RENTAL_LINE_REQUIRED'; END IF;
    IF v_total <= 0 THEN RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED'; END IF;
  END IF;

  UPDATE contracts
  SET unit_id = v_primary_unit,
      total_amount = v_total
  WHERE id = p_contract_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_contract_draft_atomic(
  p_contract_id UUID,
  p_contract JSONB,
  p_tenant JSONB,
  p_lines JSONB DEFAULT '[]'::JSONB
)
RETURNS contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts;
  v_tenant tenants;
  v_partner_id BIGINT;
  v_national_id TEXT;
  v_contract_number TEXT;
  v_total NUMERIC(14, 2);
  v_primary_unit UUID;
  v_is_create BOOLEAN := p_contract_id IS NULL;
BEGIN
  IF v_is_create THEN
    IF auth.role() <> 'service_role' AND NOT public.has_permission('contracts.create') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSE
    IF auth.role() <> 'service_role' AND NOT public.has_permission('contracts.update') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  v_contract_number := NULLIF(trim(BOTH FROM COALESCE(p_contract->>'contractNumber', '')), '');
  IF v_contract_number IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NUMBER_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE contract_number = v_contract_number
      AND (p_contract_id IS NULL OR id <> p_contract_id)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CONTRACT_NUMBER';
  END IF;

  IF NOT v_is_create THEN
    SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id FOR UPDATE;
    IF v_contract.id IS NULL THEN
      RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
    END IF;
    IF v_contract.status <> 'draft' THEN
      RAISE EXCEPTION 'CONTRACT_NOT_DRAFT';
    END IF;
  END IF;

  -- Optional tenant stub when a name is provided.
  IF NULLIF(trim(BOTH FROM COALESCE(p_tenant->>'fullName', '')), '') IS NOT NULL THEN
    v_partner_id := NULLIF(p_tenant->>'odooPartnerId', '')::BIGINT;
    v_national_id := NULLIF(p_tenant->>'nationalId', '');
    IF v_partner_id IS NOT NULL THEN
      SELECT * INTO v_tenant FROM tenants WHERE odoo_partner_id = v_partner_id FOR UPDATE;
    END IF;
    IF v_tenant.id IS NULL AND v_national_id IS NOT NULL THEN
      SELECT * INTO v_tenant FROM tenants WHERE national_id = v_national_id FOR UPDATE;
    END IF;
    IF v_tenant.id IS NULL AND NOT v_is_create AND v_contract.tenant_id IS NOT NULL THEN
      SELECT * INTO v_tenant FROM tenants WHERE id = v_contract.tenant_id FOR UPDATE;
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
    ELSE
      UPDATE tenants SET
        full_name = COALESCE(NULLIF(p_tenant->>'fullName', ''), full_name),
        phone = COALESCE(NULLIF(p_tenant->>'phone', ''), phone),
        email = COALESCE(NULLIF(p_tenant->>'email', ''), email),
        national_id = COALESCE(v_national_id, national_id),
        odoo_partner_id = COALESCE(v_partner_id, odoo_partner_id),
        vat = COALESCE(NULLIF(p_tenant->>'vat', ''), vat),
        street = COALESCE(NULLIF(p_tenant->>'street', ''), street),
        city = COALESCE(NULLIF(p_tenant->>'city', ''), city),
        country_code = COALESCE(NULLIF(p_tenant->>'countryCode', ''), country_code)
      WHERE id = v_tenant.id
      RETURNING * INTO v_tenant;
    END IF;
  END IF;

  SELECT COALESCE(SUM((value->>'amount')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) AS t(value);

  SELECT (value->>'unitId')::UUID
  INTO v_primary_unit
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) AS t(value)
  WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
    AND NULLIF(value->>'unitId', '') IS NOT NULL
  ORDER BY COALESCE((value->>'sortOrder')::INT, 0)
  LIMIT 1;

  IF v_is_create THEN
    INSERT INTO contracts (
      unit_id, contract_number, tenant_id, start_date, end_date,
      total_amount, payment_cycle, tax_mode, status, notes,
      paid_through_date, opening_paid_amount, opening_payment_date,
      opening_notes, opening_balance_total, odoo_sync_status
    ) VALUES (
      v_primary_unit,
      v_contract_number,
      v_tenant.id,
      NULLIF(p_contract->>'startDate', '')::DATE,
      NULLIF(p_contract->>'endDate', '')::DATE,
      GREATEST(v_total, 0),
      COALESCE(NULLIF(p_contract->>'paymentCycle', '')::payment_cycle, 'quarterly'),
      COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
      'draft',
      NULLIF(p_contract->>'notes', ''),
      NULLIF(p_contract->>'paidThroughDate', '')::DATE,
      COALESCE((p_contract->>'openingPaidAmount')::NUMERIC, 0),
      NULLIF(p_contract->>'openingPaymentDate', '')::DATE,
      NULLIF(p_contract->>'openingNotes', ''),
      COALESCE((p_contract->>'openingBalanceTotal')::NUMERIC, 0),
      'not_synced'
    ) RETURNING * INTO v_contract;
  ELSE
    UPDATE contracts SET
      unit_id = v_primary_unit,
      contract_number = v_contract_number,
      tenant_id = COALESCE(v_tenant.id, tenant_id),
      start_date = NULLIF(p_contract->>'startDate', '')::DATE,
      end_date = NULLIF(p_contract->>'endDate', '')::DATE,
      total_amount = GREATEST(v_total, 0),
      payment_cycle = COALESCE(NULLIF(p_contract->>'paymentCycle', '')::payment_cycle, payment_cycle),
      tax_mode = COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, tax_mode),
      notes = NULLIF(p_contract->>'notes', ''),
      paid_through_date = NULLIF(p_contract->>'paidThroughDate', '')::DATE,
      opening_paid_amount = COALESCE((p_contract->>'openingPaidAmount')::NUMERIC, opening_paid_amount),
      opening_payment_date = NULLIF(p_contract->>'openingPaymentDate', '')::DATE,
      opening_notes = NULLIF(p_contract->>'openingNotes', ''),
      opening_balance_total = COALESCE((p_contract->>'openingBalanceTotal')::NUMERIC, opening_balance_total)
    WHERE id = p_contract_id
    RETURNING * INTO v_contract;
  END IF;

  -- Soft line replace (draft status allows empty / incomplete lines).
  PERFORM replace_contract_lines(v_contract.id, COALESCE(p_lines, '[]'::JSONB));

  SELECT * INTO v_contract FROM contracts WHERE id = v_contract.id;
  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION activate_contract_draft_atomic(
  p_contract_id UUID,
  p_contract JSONB,
  p_tenant JSONB,
  p_schedule JSONB,
  p_lines JSONB
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
  v_contract_number TEXT;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.has_permission('contracts.create')
       OR public.has_permission('contracts.update')
     ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
  END IF;
  IF v_contract.status <> 'draft' THEN
    RAISE EXCEPTION 'CONTRACT_NOT_DRAFT';
  END IF;

  v_contract_number := NULLIF(trim(BOTH FROM COALESCE(p_contract->>'contractNumber', '')), '');
  IF v_contract_number IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NUMBER_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE contract_number = v_contract_number
      AND id <> p_contract_id
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
      AND c.id <> p_contract_id
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
  IF v_tenant.id IS NULL AND v_contract.tenant_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM tenants WHERE id = v_contract.tenant_id FOR UPDATE;
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
  ELSE
    UPDATE tenants SET
      full_name = COALESCE(NULLIF(p_tenant->>'fullName', ''), full_name),
      phone = COALESCE(NULLIF(p_tenant->>'phone', ''), phone),
      email = COALESCE(NULLIF(p_tenant->>'email', ''), email),
      national_id = COALESCE(v_national_id, national_id),
      odoo_partner_id = COALESCE(v_partner_id, odoo_partner_id),
      vat = COALESCE(NULLIF(p_tenant->>'vat', ''), vat),
      street = COALESCE(NULLIF(p_tenant->>'street', ''), street),
      city = COALESCE(NULLIF(p_tenant->>'city', ''), city),
      country_code = COALESCE(NULLIF(p_tenant->>'countryCode', ''), country_code)
    WHERE id = v_tenant.id
    RETURNING * INTO v_tenant;
  END IF;

  -- Temporarily keep draft while replacing lines so soft rules apply, then activate.
  PERFORM replace_contract_lines(p_contract_id, v_lines);

  UPDATE contracts SET
    unit_id = v_primary_unit,
    contract_number = v_contract_number,
    tenant_id = v_tenant.id,
    start_date = (p_contract->>'startDate')::DATE,
    end_date = (p_contract->>'endDate')::DATE,
    total_amount = v_total,
    payment_cycle = (p_contract->>'paymentCycle')::payment_cycle,
    tax_mode = COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
    notes = NULLIF(p_contract->>'notes', ''),
    paid_through_date = NULLIF(p_contract->>'paidThroughDate', '')::DATE,
    opening_paid_amount = COALESCE((p_contract->>'openingPaidAmount')::NUMERIC, 0),
    opening_payment_date = NULLIF(p_contract->>'openingPaymentDate', '')::DATE,
    opening_notes = NULLIF(p_contract->>'openingNotes', ''),
    opening_balance_total = COALESCE((p_contract->>'openingBalanceTotal')::NUMERIC, 0),
    status = 'active'
  WHERE id = p_contract_id
  RETURNING * INTO v_contract;

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

CREATE OR REPLACE FUNCTION delete_contract_draft_atomic(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status contract_status;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_permission('contracts.update') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT status INTO v_status FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'CONTRACT_NOT_DRAFT';
  END IF;

  IF EXISTS (SELECT 1 FROM invoices WHERE contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'CONTRACT_HAS_INVOICES';
  END IF;

  DELETE FROM contracts WHERE id = p_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION save_contract_draft_atomic(UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION activate_contract_draft_atomic(UUID, JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_contract_draft_atomic(UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION save_contract_draft_atomic(UUID, JSONB, JSONB, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION activate_contract_draft_atomic(UUID, JSONB, JSONB, JSONB, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_contract_draft_atomic(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION replace_contract_lines(UUID, JSONB)
  TO authenticated, service_role;

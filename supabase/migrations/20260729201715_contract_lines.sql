-- Multi-line contracts: rental units + service/fee lines under one contract header.
-- contracts.unit_id remains the primary rental unit for backward-compatible joins.

CREATE TYPE contract_line_type AS ENUM ('rental', 'service');

CREATE TABLE contract_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  line_type contract_line_type NOT NULL,
  unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  description TEXT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  period_start DATE,
  period_end DATE,
  odoo_line_id BIGINT UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_lines_rental_requires_unit CHECK (
    (line_type = 'rental' AND unit_id IS NOT NULL)
    OR (line_type = 'service')
  ),
  CONSTRAINT contract_lines_period_order CHECK (
    period_start IS NULL
    OR period_end IS NULL
    OR period_end >= period_start
  )
);

CREATE INDEX idx_contract_lines_contract ON contract_lines(contract_id);
CREATE INDEX idx_contract_lines_unit ON contract_lines(unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX idx_contract_lines_odoo_line ON contract_lines(odoo_line_id) WHERE odoo_line_id IS NOT NULL;

CREATE UNIQUE INDEX idx_contract_lines_unique_rental_unit_per_contract
  ON contract_lines(contract_id, unit_id)
  WHERE line_type = 'rental' AND unit_id IS NOT NULL;

CREATE TRIGGER update_contract_lines_updated_at
  BEFORE UPDATE ON contract_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill one rental line per existing contract.
INSERT INTO contract_lines (
  contract_id, line_type, unit_id, description, amount,
  period_start, period_end, sort_order
)
SELECT
  c.id,
  'rental'::contract_line_type,
  c.unit_id,
  NULL,
  c.total_amount,
  c.start_date,
  c.end_date,
  0
FROM contracts c
WHERE NOT EXISTS (
  SELECT 1 FROM contract_lines cl WHERE cl.contract_id = c.id
);

-- Move active-per-unit invariant onto rental lines (including primary unit_id).
DROP INDEX IF EXISTS idx_contracts_one_active_per_unit;

CREATE OR REPLACE FUNCTION enforce_one_active_rental_line_per_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unit_id UUID;
  v_contract_id UUID;
  v_status contract_status;
BEGIN
  IF TG_TABLE_NAME = 'contract_lines' THEN
    IF NEW.line_type <> 'rental' OR NEW.unit_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_unit_id := NEW.unit_id;
    v_contract_id := NEW.contract_id;
    SELECT status INTO v_status FROM contracts WHERE id = v_contract_id;
    IF v_status IS DISTINCT FROM 'active' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'contracts' THEN
    IF NEW.status <> 'active' THEN
      RETURN NEW;
    END IF;
    v_contract_id := NEW.id;
    -- Header primary unit must be free of other active rentals.
    IF EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.status = 'active'
        AND c.id <> NEW.id
        AND c.unit_id = NEW.unit_id
    ) OR EXISTS (
      SELECT 1
      FROM contract_lines cl
      JOIN contracts c ON c.id = cl.contract_id
      WHERE cl.line_type = 'rental'
        AND cl.unit_id = NEW.unit_id
        AND c.status = 'active'
        AND c.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS' USING ERRCODE = '23505';
    END IF;
    -- When a contract becomes active, all of its rental line units must be free.
    IF EXISTS (
      SELECT 1
      FROM contract_lines cl
      JOIN contracts c ON c.id = cl.contract_id
      WHERE cl.line_type = 'rental'
        AND cl.unit_id IS NOT NULL
        AND c.status = 'active'
        AND c.id <> NEW.id
        AND cl.unit_id IN (
          SELECT unit_id FROM contract_lines
          WHERE contract_id = NEW.id
            AND line_type = 'rental'
            AND unit_id IS NOT NULL
        )
    ) THEN
      RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM contract_lines cl
    JOIN contracts c ON c.id = cl.contract_id
    WHERE cl.line_type = 'rental'
      AND cl.unit_id = v_unit_id
      AND c.status = 'active'
      AND cl.contract_id <> v_contract_id
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- Also guard against another active contract that still only uses header unit_id
  -- without lines (should not happen after backfill).
  IF EXISTS (
    SELECT 1
    FROM contracts c
    WHERE c.status = 'active'
      AND c.id <> v_contract_id
      AND c.unit_id = v_unit_id
      AND NOT EXISTS (
        SELECT 1 FROM contract_lines cl2
        WHERE cl2.contract_id = c.id AND cl2.line_type = 'rental'
      )
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER contract_lines_one_active_unit
  BEFORE INSERT OR UPDATE OF unit_id, line_type, contract_id ON contract_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_one_active_rental_line_per_unit();

CREATE TRIGGER contracts_one_active_unit_on_status
  BEFORE INSERT OR UPDATE OF status, unit_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION enforce_one_active_rental_line_per_unit();

ALTER TABLE contract_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_lines_select ON contract_lines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contract_lines_insert ON contract_lines
  FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY contract_lines_update ON contract_lines
  FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY contract_lines_delete ON contract_lines
  FOR DELETE TO authenticated USING (is_admin_editor());

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
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_typeof(COALESCE(p_lines, '[]'::JSONB)) <> 'array'
     OR jsonb_array_length(COALESCE(p_lines, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;

  DELETE FROM contract_lines WHERE contract_id = p_contract_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB))
  LOOP
    INSERT INTO contract_lines (
      contract_id, line_type, unit_id, description, amount,
      period_start, period_end, odoo_line_id, sort_order
    ) VALUES (
      p_contract_id,
      COALESCE(NULLIF(v_line->>'lineType', '')::contract_line_type, 'rental'),
      NULLIF(v_line->>'unitId', '')::UUID,
      NULLIF(v_line->>'description', ''),
      COALESCE((v_line->>'amount')::NUMERIC, 0),
      NULLIF(v_line->>'periodStart', '')::DATE,
      NULLIF(v_line->>'periodEnd', '')::DATE,
      NULLIF(v_line->>'odooLineId', '')::BIGINT,
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

  IF v_primary_unit IS NULL THEN
    RAISE EXCEPTION 'RENTAL_LINE_REQUIRED';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED';
  END IF;

  UPDATE contracts
  SET unit_id = v_primary_unit,
      total_amount = v_total
  WHERE id = p_contract_id;
END;
$$;

DROP FUNCTION IF EXISTS create_contract_with_schedule_atomic(JSONB, JSONB, JSONB);

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
    SELECT 1 FROM contracts
    WHERE contract_number = p_contract->>'contractNumber'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CONTRACT_NUMBER';
  END IF;

  v_lines := COALESCE(p_lines, '[]'::JSONB);
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    -- Backward compatible single-unit create.
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'lineType', 'rental',
        'unitId', p_contract->>'unitId',
        'amount', COALESCE((p_contract->>'totalAmount')::NUMERIC, 0),
        'periodStart', p_contract->>'startDate',
        'periodEnd', p_contract->>'endDate',
        'sortOrder', 0
      )
    );
  END IF;

  SELECT (value->>'unitId')::UUID
  INTO v_primary_unit
  FROM jsonb_array_elements(v_lines) AS t(value)
  WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
    AND NULLIF(value->>'unitId', '') IS NOT NULL
  ORDER BY COALESCE((value->>'sortOrder')::INT, 0)
  LIMIT 1;

  IF v_primary_unit IS NULL THEN
    RAISE EXCEPTION 'RENTAL_LINE_REQUIRED';
  END IF;

  SELECT COALESCE(SUM((value->>'amount')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(v_lines) AS t(value);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED';
  END IF;

  -- Lock all rental units referenced by this contract.
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
    SELECT * INTO v_tenant FROM tenants WHERE odoo_partner_id = v_partner_id;
  END IF;
  IF v_tenant.id IS NULL AND v_national_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM tenants WHERE national_id = v_national_id;
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
    )
    RETURNING * INTO v_tenant;
  END IF;

  INSERT INTO contracts (
    unit_id, contract_number, tenant_id, start_date, end_date,
    total_amount, payment_cycle, tax_mode, status, notes,
    odoo_sync_status
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
    CASE WHEN v_partner_id IS NULL THEN 'not_synced' ELSE 'synced' END
  )
  RETURNING * INTO v_contract;

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
      period_start, period_end, amount, paid_amount,
      status, due_date, issued_at, notes
    ) VALUES (
      'DUE-' || v_contract.id || '-' || (v_period->>'periodStart'),
      v_contract.id,
      v_contract.unit_id,
      v_tenant.id,
      (v_period->>'periodStart')::DATE,
      (v_period->>'periodEnd')::DATE,
      (v_period->>'amount')::NUMERIC,
      COALESCE((v_period->>'paidAmount')::NUMERIC, 0),
      (v_period->>'status')::invoice_status,
      COALESCE(NULLIF(v_period->>'dueDate', '')::DATE, (v_period->>'periodStart')::DATE),
      NULL,
      NULL
    );
  END LOOP;

  RETURN v_contract;
END;
$$;

DROP FUNCTION IF EXISTS map_odoo_contract_group_atomic(JSONB, BIGINT[]);

CREATE OR REPLACE FUNCTION map_odoo_contract_group_atomic(
  p_contract JSONB,
  p_odoo_line_ids BIGINT[],
  p_lines JSONB DEFAULT NULL
)
RETURNS contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts;
  v_status contract_status;
  v_lines JSONB;
  v_primary_unit UUID;
  v_total NUMERIC(14, 2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_status := COALESCE(NULLIF(p_contract->>'status', '')::contract_status, 'completed');
  v_lines := COALESCE(p_lines, '[]'::JSONB);

  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'lineType', 'rental',
        'unitId', p_contract->>'unitId',
        'amount', COALESCE((p_contract->>'totalAmount')::NUMERIC, 0),
        'periodStart', p_contract->>'startDate',
        'periodEnd', p_contract->>'endDate',
        'sortOrder', 0
      )
    );
  END IF;

  SELECT (value->>'unitId')::UUID
  INTO v_primary_unit
  FROM jsonb_array_elements(v_lines) AS t(value)
  WHERE COALESCE(NULLIF(value->>'lineType', ''), 'rental') = 'rental'
    AND NULLIF(value->>'unitId', '') IS NOT NULL
  ORDER BY COALESCE((value->>'sortOrder')::INT, 0)
  LIMIT 1;

  IF v_primary_unit IS NULL THEN
    v_primary_unit := (p_contract->>'unitId')::UUID;
  END IF;

  SELECT COALESCE(SUM((value->>'amount')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(v_lines) AS t(value);

  IF v_total <= 0 THEN
    v_total := COALESCE((p_contract->>'totalAmount')::NUMERIC, 0);
  END IF;

  SELECT * INTO v_contract
  FROM contracts
  WHERE contract_number = p_contract->>'contractNumber';

  IF v_contract.id IS NULL THEN
    INSERT INTO contracts (
      unit_id, contract_number, tenant_id, start_date, end_date,
      total_amount, payment_cycle, tax_mode, status, notes,
      odoo_sync_status
    ) VALUES (
      v_primary_unit,
      p_contract->>'contractNumber',
      (p_contract->>'tenantId')::UUID,
      (p_contract->>'startDate')::DATE,
      (p_contract->>'endDate')::DATE,
      v_total,
      (p_contract->>'paymentCycle')::payment_cycle,
      COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
      v_status,
      COALESCE(NULLIF(p_contract->>'notes', ''), 'Imported from Odoo'),
      'synced'
    )
    RETURNING * INTO v_contract;
  ELSIF v_contract.tenant_id IS DISTINCT FROM (p_contract->>'tenantId')::UUID THEN
    RAISE EXCEPTION 'Contract number is already assigned to another tenant';
  ELSE
    UPDATE contracts
    SET unit_id = COALESCE(v_primary_unit, unit_id),
        start_date = LEAST(start_date, (p_contract->>'startDate')::DATE),
        end_date = GREATEST(end_date, (p_contract->>'endDate')::DATE),
        total_amount = v_total,
        payment_cycle = COALESCE(
          NULLIF(p_contract->>'paymentCycle', '')::payment_cycle,
          payment_cycle
        ),
        notes = COALESCE(NULLIF(p_contract->>'notes', ''), notes),
        odoo_sync_status = 'synced',
        odoo_sync_error = NULL
    WHERE id = v_contract.id
    RETURNING * INTO v_contract;
  END IF;

  PERFORM replace_contract_lines(v_contract.id, v_lines);

  UPDATE odoo_invoice_lines
  SET contract_id = v_contract.id,
      mapping_status = CASE
        WHEN mapping_status = 'service' THEN 'service'
        WHEN unit_id IS NULL THEN 'needs_review'
        ELSE 'matched'
      END,
      review_reason = CASE
        WHEN mapping_status = 'service' THEN NULL
        WHEN unit_id IS NULL THEN 'unitProductNotLinked'
        ELSE NULL
      END
  WHERE odoo_line_id = ANY(p_odoo_line_ids);

  IF v_contract.status = 'active' THEN
    UPDATE units
    SET tenant_id = v_contract.tenant_id
    WHERE id IN (
      SELECT unit_id FROM contract_lines
      WHERE contract_id = v_contract.id
        AND line_type = 'rental'
        AND unit_id IS NOT NULL
    );
  END IF;

  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION replace_contract_lines(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION map_odoo_contract_group_atomic(JSONB, BIGINT[], JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION replace_contract_lines(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION map_odoo_contract_group_atomic(JSONB, BIGINT[], JSONB) TO authenticated;

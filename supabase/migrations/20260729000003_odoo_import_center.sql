-- Durable Odoo import staging, normalized invoice documents, and outbound retries.

CREATE TABLE odoo_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type TEXT NOT NULL DEFAULT 'invoices'
    CHECK (import_type IN ('invoices', 'products', 'partners', 'incremental_sync')),
  status TEXT NOT NULL DEFAULT 'previewing'
    CHECK (status IN ('previewing', 'ready', 'committing', 'completed', 'failed')),
  cursor JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE odoo_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES odoo_import_runs(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'invoice_document'
    CHECK (item_type IN ('invoice_document', 'contract_group', 'product', 'partner')),
  odoo_model TEXT NOT NULL,
  odoo_record_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'needs_review', 'duplicate', 'imported', 'failed', 'ignored')),
  payload JSONB NOT NULL,
  mapping JSONB NOT NULL DEFAULT '{}'::JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, odoo_model, odoo_record_id)
);

CREATE TABLE odoo_invoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_invoice_id BIGINT NOT NULL UNIQUE,
  company_odoo_id BIGINT,
  partner_odoo_id BIGINT,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  invoice_name TEXT NOT NULL,
  reference TEXT,
  move_type TEXT NOT NULL DEFAULT 'out_invoice',
  move_state TEXT NOT NULL,
  payment_state TEXT,
  currency_code TEXT,
  invoice_date DATE,
  due_date DATE,
  amount_untaxed NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_residual NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  odoo_write_date TIMESTAMPTZ,
  raw_payload JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE odoo_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES odoo_invoice_documents(id) ON DELETE CASCADE,
  odoo_line_id BIGINT NOT NULL UNIQUE,
  product_odoo_id BIGINT,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  local_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  description TEXT,
  period_start DATE,
  period_end DATE,
  amount_untaxed NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  analytic_distribution JSONB,
  tax_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  is_rental BOOLEAN NOT NULL DEFAULT FALSE,
  mapping_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (mapping_status IN ('matched', 'unmatched', 'needs_review', 'service')),
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE odoo_invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES odoo_invoice_documents(id) ON DELETE CASCADE,
  odoo_partial_reconcile_id BIGINT UNIQUE,
  odoo_payment_id BIGINT,
  payment_date DATE,
  amount NUMERIC(14, 2) NOT NULL,
  currency_code TEXT,
  reference TEXT,
  raw_payload JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE odoo_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_units_odoo_product_unique
  ON units(odoo_product_id) WHERE odoo_product_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tenants_odoo_partner_unique
  ON tenants(odoo_partner_id) WHERE odoo_partner_id IS NOT NULL;
CREATE UNIQUE INDEX idx_invoices_odoo_invoice_unique
  ON invoices(odoo_invoice_id) WHERE odoo_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX idx_locations_odoo_analytic_unique
  ON locations(odoo_analytic_account_id) WHERE odoo_analytic_account_id IS NOT NULL;

CREATE INDEX idx_odoo_import_runs_status ON odoo_import_runs(status, created_at DESC);
CREATE INDEX idx_odoo_import_items_run_status ON odoo_import_items(run_id, status);
CREATE INDEX idx_odoo_documents_partner ON odoo_invoice_documents(partner_odoo_id);
CREATE INDEX idx_odoo_documents_write_date ON odoo_invoice_documents(odoo_write_date);
CREATE INDEX idx_odoo_lines_document ON odoo_invoice_lines(document_id);
CREATE INDEX idx_odoo_lines_unit ON odoo_invoice_lines(unit_id);
CREATE INDEX idx_odoo_lines_contract ON odoo_invoice_lines(contract_id);
CREATE INDEX idx_odoo_outbox_ready ON odoo_outbox(status, available_at);

CREATE TRIGGER update_odoo_import_runs_updated_at
  BEFORE UPDATE ON odoo_import_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_odoo_import_items_updated_at
  BEFORE UPDATE ON odoo_import_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_odoo_invoice_documents_updated_at
  BEFORE UPDATE ON odoo_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_odoo_invoice_lines_updated_at
  BEFORE UPDATE ON odoo_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_odoo_outbox_updated_at
  BEFORE UPDATE ON odoo_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE odoo_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_invoice_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY odoo_import_runs_admin ON odoo_import_runs
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY odoo_import_items_admin ON odoo_import_items
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY odoo_documents_admin ON odoo_invoice_documents
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY odoo_lines_admin ON odoo_invoice_lines
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY odoo_payments_admin ON odoo_invoice_payments
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY odoo_outbox_admin ON odoo_outbox
  FOR ALL TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());

CREATE OR REPLACE FUNCTION prevent_direct_invoice_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  AND current_setting('app.record_payment_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.issue_due_invoice_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.odoo_invoice_sync', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVOICE_PAYMENT_FIELDS_REQUIRE_RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION upsert_odoo_invoice_document_atomic(
  p_document JSONB,
  p_lines JSONB,
  p_payments JSONB DEFAULT '[]'::JSONB,
  p_import_item_id UUID DEFAULT NULL
)
RETURNS odoo_invoice_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document odoo_invoice_documents;
  v_tenant tenants;
  v_partner JSONB;
  v_partner_odoo_id BIGINT;
  v_partner_vat TEXT;
  v_line JSONB;
  v_payment JSONB;
  v_line_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_payment_ids BIGINT[] := ARRAY[]::BIGINT[];
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_partner := COALESCE(p_document->'partner', '{}'::JSONB);
  v_partner_odoo_id := NULLIF(p_document->>'partnerOdooId', '')::BIGINT;
  v_partner_vat := NULLIF(BTRIM(v_partner->>'vat'), '');

  IF v_partner_odoo_id IS NOT NULL THEN
    SELECT * INTO v_tenant
    FROM tenants
    WHERE odoo_partner_id = v_partner_odoo_id
    FOR UPDATE;
  END IF;

  IF v_tenant.id IS NULL AND v_partner_vat IS NOT NULL
    AND (SELECT COUNT(*) FROM tenants WHERE vat = v_partner_vat) = 1 THEN
    SELECT * INTO v_tenant
    FROM tenants
    WHERE vat = v_partner_vat
    FOR UPDATE;

    IF v_tenant.odoo_partner_id IS NULL AND v_partner_odoo_id IS NOT NULL THEN
      UPDATE tenants
      SET odoo_partner_id = v_partner_odoo_id
      WHERE id = v_tenant.id
      RETURNING * INTO v_tenant;
    END IF;
  END IF;

  IF v_tenant.id IS NULL AND v_partner_odoo_id IS NOT NULL THEN
    INSERT INTO tenants (
      full_name, phone, email, national_id, odoo_partner_id,
      vat, street, city, country_code
    ) VALUES (
      COALESCE(NULLIF(v_partner->>'name', ''), 'Unknown Odoo customer'),
      NULLIF(v_partner->>'phone', ''),
      NULLIF(v_partner->>'email', ''),
      NULL,
      v_partner_odoo_id,
      v_partner_vat,
      NULLIF(v_partner->>'street', ''),
      NULLIF(v_partner->>'city', ''),
      NULLIF(v_partner->>'countryCode', '')
    )
    RETURNING * INTO v_tenant;
  END IF;

  INSERT INTO odoo_invoice_documents (
    odoo_invoice_id, company_odoo_id, partner_odoo_id, tenant_id,
    invoice_name, reference, move_type, move_state, payment_state,
    currency_code, invoice_date, due_date, amount_untaxed, amount_tax,
    amount_total, amount_residual, amount_paid, odoo_write_date,
    raw_payload, last_synced_at
  ) VALUES (
    (p_document->>'odooInvoiceId')::BIGINT,
    NULLIF(p_document->>'companyOdooId', '')::BIGINT,
    NULLIF(p_document->>'partnerOdooId', '')::BIGINT,
    COALESCE(v_tenant.id, NULLIF(p_document->>'tenantId', '')::UUID),
    p_document->>'invoiceName',
    NULLIF(p_document->>'reference', ''),
    COALESCE(NULLIF(p_document->>'moveType', ''), 'out_invoice'),
    p_document->>'moveState',
    NULLIF(p_document->>'paymentState', ''),
    NULLIF(p_document->>'currencyCode', ''),
    NULLIF(p_document->>'invoiceDate', '')::DATE,
    NULLIF(p_document->>'dueDate', '')::DATE,
    COALESCE((p_document->>'amountUntaxed')::NUMERIC, 0),
    COALESCE((p_document->>'amountTax')::NUMERIC, 0),
    COALESCE((p_document->>'amountTotal')::NUMERIC, 0),
    COALESCE((p_document->>'amountResidual')::NUMERIC, 0),
    COALESCE((p_document->>'amountPaid')::NUMERIC, 0),
    NULLIF(p_document->>'writeDate', '')::TIMESTAMPTZ,
    p_document->'rawPayload',
    NOW()
  )
  ON CONFLICT (odoo_invoice_id) DO UPDATE SET
    company_odoo_id = EXCLUDED.company_odoo_id,
    partner_odoo_id = EXCLUDED.partner_odoo_id,
    tenant_id = COALESCE(EXCLUDED.tenant_id, odoo_invoice_documents.tenant_id),
    invoice_name = EXCLUDED.invoice_name,
    reference = EXCLUDED.reference,
    move_type = EXCLUDED.move_type,
    move_state = EXCLUDED.move_state,
    payment_state = EXCLUDED.payment_state,
    currency_code = EXCLUDED.currency_code,
    invoice_date = EXCLUDED.invoice_date,
    due_date = EXCLUDED.due_date,
    amount_untaxed = EXCLUDED.amount_untaxed,
    amount_tax = EXCLUDED.amount_tax,
    amount_total = EXCLUDED.amount_total,
    amount_residual = EXCLUDED.amount_residual,
    amount_paid = EXCLUDED.amount_paid,
    odoo_write_date = EXCLUDED.odoo_write_date,
    raw_payload = EXCLUDED.raw_payload,
    last_synced_at = NOW()
  RETURNING * INTO v_document;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB))
  LOOP
    v_line_ids := array_append(v_line_ids, (v_line->>'odooLineId')::BIGINT);
    INSERT INTO odoo_invoice_lines (
      document_id, odoo_line_id, product_odoo_id, unit_id, contract_id,
      local_invoice_id, description, period_start, period_end,
      amount_untaxed, amount_tax, amount_total, analytic_distribution,
      tax_ids, is_rental, mapping_status, review_reason
    ) VALUES (
      v_document.id,
      (v_line->>'odooLineId')::BIGINT,
      NULLIF(v_line->>'productOdooId', '')::BIGINT,
      NULLIF(v_line->>'unitId', '')::UUID,
      NULLIF(v_line->>'contractId', '')::UUID,
      NULLIF(v_line->>'localInvoiceId', '')::UUID,
      NULLIF(v_line->>'description', ''),
      NULLIF(v_line->>'periodStart', '')::DATE,
      NULLIF(v_line->>'periodEnd', '')::DATE,
      COALESCE((v_line->>'amountUntaxed')::NUMERIC, 0),
      COALESCE((v_line->>'amountTax')::NUMERIC, 0),
      COALESCE((v_line->>'amountTotal')::NUMERIC, 0),
      v_line->'analyticDistribution',
      COALESCE(v_line->'taxIds', '[]'::JSONB),
      COALESCE((v_line->>'isRental')::BOOLEAN, FALSE),
      COALESCE(NULLIF(v_line->>'mappingStatus', ''), 'unmatched'),
      NULLIF(v_line->>'reviewReason', '')
    )
    ON CONFLICT (odoo_line_id) DO UPDATE SET
      document_id = EXCLUDED.document_id,
      product_odoo_id = EXCLUDED.product_odoo_id,
      unit_id = COALESCE(EXCLUDED.unit_id, odoo_invoice_lines.unit_id),
      contract_id = COALESCE(EXCLUDED.contract_id, odoo_invoice_lines.contract_id),
      local_invoice_id = COALESCE(EXCLUDED.local_invoice_id, odoo_invoice_lines.local_invoice_id),
      description = EXCLUDED.description,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      amount_untaxed = EXCLUDED.amount_untaxed,
      amount_tax = EXCLUDED.amount_tax,
      amount_total = EXCLUDED.amount_total,
      analytic_distribution = EXCLUDED.analytic_distribution,
      tax_ids = EXCLUDED.tax_ids,
      is_rental = EXCLUDED.is_rental,
      mapping_status = CASE
        WHEN odoo_invoice_lines.mapping_status = 'matched' AND EXCLUDED.mapping_status <> 'matched'
          THEN odoo_invoice_lines.mapping_status
        ELSE EXCLUDED.mapping_status
      END,
      review_reason = EXCLUDED.review_reason;
  END LOOP;

  DELETE FROM odoo_invoice_lines
  WHERE document_id = v_document.id
    AND NOT (odoo_line_id = ANY(v_line_ids));

  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB))
  LOOP
    IF NULLIF(v_payment->>'odooPartialReconcileId', '') IS NULL THEN
      CONTINUE;
    END IF;
    v_payment_ids := array_append(v_payment_ids, (v_payment->>'odooPartialReconcileId')::BIGINT);
    INSERT INTO odoo_invoice_payments (
      document_id, odoo_partial_reconcile_id, odoo_payment_id,
      payment_date, amount, currency_code, reference, raw_payload,
      last_synced_at
    ) VALUES (
      v_document.id,
      (v_payment->>'odooPartialReconcileId')::BIGINT,
      NULLIF(v_payment->>'odooPaymentId', '')::BIGINT,
      NULLIF(v_payment->>'paymentDate', '')::DATE,
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      NULLIF(v_payment->>'currencyCode', ''),
      NULLIF(v_payment->>'reference', ''),
      v_payment->'rawPayload',
      NOW()
    )
    ON CONFLICT (odoo_partial_reconcile_id) DO UPDATE SET
      document_id = EXCLUDED.document_id,
      odoo_payment_id = EXCLUDED.odoo_payment_id,
      payment_date = EXCLUDED.payment_date,
      amount = EXCLUDED.amount,
      currency_code = EXCLUDED.currency_code,
      reference = EXCLUDED.reference,
      raw_payload = EXCLUDED.raw_payload,
      last_synced_at = NOW();
  END LOOP;

  DELETE FROM odoo_invoice_payments
  WHERE document_id = v_document.id
    AND odoo_partial_reconcile_id IS NOT NULL
    AND NOT (odoo_partial_reconcile_id = ANY(v_payment_ids));

  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE invoices
  SET
    odoo_invoice_name = v_document.invoice_name,
    odoo_invoice_state = v_document.move_state,
    odoo_sync_status = 'synced',
    odoo_sync_error = NULL,
    paid_amount = CASE
      WHEN v_document.amount_total > 0
        THEN LEAST(
          amount,
          ROUND(amount * v_document.amount_paid / v_document.amount_total, 2)
        )
      ELSE 0
    END,
    status = CASE
      WHEN v_document.move_state = 'draft' THEN 'due'::invoice_status
      WHEN v_document.payment_state = 'paid' OR v_document.amount_residual <= 0.005
        THEN 'fully_paid'::invoice_status
      WHEN v_document.amount_paid > 0 THEN 'partially_paid'::invoice_status
      ELSE 'invoice_issued'::invoice_status
    END,
    issued_at = CASE
      WHEN v_document.move_state = 'posted' THEN COALESCE(issued_at, NOW())
      ELSE issued_at
    END
  WHERE odoo_invoice_id = v_document.odoo_invoice_id;

  IF p_import_item_id IS NOT NULL THEN
    UPDATE odoo_import_items
    SET status = 'imported', imported_at = NOW(), errors = '[]'::JSONB
    WHERE id = p_import_item_id;
  END IF;

  RETURN v_document;
END;
$$;

CREATE OR REPLACE FUNCTION map_odoo_contract_group_atomic(
  p_contract JSONB,
  p_odoo_line_ids BIGINT[]
)
RETURNS contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts;
  v_status contract_status;
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin_editor() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_status := COALESCE(NULLIF(p_contract->>'status', '')::contract_status, 'completed');

  SELECT * INTO v_contract
  FROM contracts
  WHERE contract_number = p_contract->>'contractNumber';

  IF v_contract.id IS NULL THEN
    INSERT INTO contracts (
      unit_id, contract_number, tenant_id, start_date, end_date,
      total_amount, payment_cycle, tax_mode, status, notes,
      odoo_sync_status
    ) VALUES (
      (p_contract->>'unitId')::UUID,
      p_contract->>'contractNumber',
      (p_contract->>'tenantId')::UUID,
      (p_contract->>'startDate')::DATE,
      (p_contract->>'endDate')::DATE,
      (p_contract->>'totalAmount')::NUMERIC,
      (p_contract->>'paymentCycle')::payment_cycle,
      COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
      v_status,
      COALESCE(NULLIF(p_contract->>'notes', ''), 'Imported from Odoo'),
      'synced'
    )
    RETURNING * INTO v_contract;
  ELSIF v_contract.unit_id <> (p_contract->>'unitId')::UUID
    OR v_contract.tenant_id IS DISTINCT FROM (p_contract->>'tenantId')::UUID THEN
    RAISE EXCEPTION 'Contract number is already assigned to another unit or tenant';
  END IF;

  UPDATE odoo_invoice_lines
  SET contract_id = v_contract.id,
      mapping_status = CASE WHEN unit_id IS NULL THEN 'needs_review' ELSE 'matched' END,
      review_reason = CASE WHEN unit_id IS NULL THEN 'unitProductNotLinked' ELSE NULL END
  WHERE odoo_line_id = ANY(p_odoo_line_ids)
    AND (unit_id IS NULL OR unit_id = v_contract.unit_id);

  IF v_contract.status = 'active' THEN
    UPDATE units
    SET tenant_id = v_contract.tenant_id
    WHERE id = v_contract.unit_id;
  END IF;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION create_contract_with_schedule_atomic(
  p_contract JSONB,
  p_tenant JSONB,
  p_schedule JSONB
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

  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE unit_id = (p_contract->>'unitId')::UUID
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_CONTRACT_EXISTS';
  END IF;

  PERFORM 1 FROM units WHERE id = (p_contract->>'unitId')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNIT_NOT_FOUND';
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
    (p_contract->>'unitId')::UUID,
    p_contract->>'contractNumber',
    v_tenant.id,
    (p_contract->>'startDate')::DATE,
    (p_contract->>'endDate')::DATE,
    (p_contract->>'totalAmount')::NUMERIC,
    (p_contract->>'paymentCycle')::payment_cycle,
    COALESCE(NULLIF(p_contract->>'taxMode', '')::contract_tax_mode, 'taxable'),
    'active',
    NULLIF(p_contract->>'notes', ''),
    CASE WHEN v_partner_id IS NULL THEN 'not_synced' ELSE 'synced' END
  )
  RETURNING * INTO v_contract;

  UPDATE units SET tenant_id = v_tenant.id WHERE id = v_contract.unit_id;

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

REVOKE ALL ON FUNCTION upsert_odoo_invoice_document_atomic(JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION map_odoo_contract_group_atomic(JSONB, BIGINT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_odoo_invoice_document_atomic(JSONB, JSONB, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION map_odoo_contract_group_atomic(JSONB, BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_contract_with_schedule_atomic(JSONB, JSONB, JSONB) TO authenticated;

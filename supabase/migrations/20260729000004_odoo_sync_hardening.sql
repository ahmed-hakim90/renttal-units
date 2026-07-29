-- Forward-compatible hardening for databases where the import-center migration
-- was already applied before server-side cron and atomic tenant matching landed.

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

CREATE OR REPLACE FUNCTION hydrate_odoo_document_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner JSONB;
  v_tenant tenants;
  v_partner_odoo_id BIGINT;
  v_partner_vat TEXT;
BEGIN
  IF NEW.tenant_id IS NOT NULL OR NEW.partner_odoo_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_partner := COALESCE(NEW.raw_payload->'partner', '{}'::JSONB);
  v_partner_odoo_id := NEW.partner_odoo_id;
  v_partner_vat := NULLIF(BTRIM(v_partner->>'vat'), '');

  SELECT * INTO v_tenant
  FROM tenants
  WHERE odoo_partner_id = v_partner_odoo_id
  FOR UPDATE;

  IF v_tenant.id IS NULL AND v_partner_vat IS NOT NULL
    AND (SELECT COUNT(*) FROM tenants WHERE vat = v_partner_vat) = 1 THEN
    SELECT * INTO v_tenant
    FROM tenants
    WHERE vat = v_partner_vat
    FOR UPDATE;

    IF v_tenant.odoo_partner_id IS NULL THEN
      UPDATE tenants
      SET odoo_partner_id = v_partner_odoo_id
      WHERE id = v_tenant.id
      RETURNING * INTO v_tenant;
    END IF;
  END IF;

  IF v_tenant.id IS NULL THEN
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

  NEW.tenant_id := v_tenant.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hydrate_odoo_document_tenant_trigger ON odoo_invoice_documents;
CREATE TRIGGER hydrate_odoo_document_tenant_trigger
  BEFORE INSERT OR UPDATE OF partner_odoo_id, tenant_id, raw_payload
  ON odoo_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION hydrate_odoo_document_tenant();

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
      WHEN NEW.amount_total > 0
        THEN LEAST(amount, ROUND(amount * NEW.amount_paid / NEW.amount_total, 2))
      ELSE 0
    END,
    status = CASE
      WHEN NEW.move_state = 'draft' THEN 'due'::invoice_status
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

DROP TRIGGER IF EXISTS sync_local_invoice_from_odoo_document_trigger
  ON odoo_invoice_documents;
CREATE TRIGGER sync_local_invoice_from_odoo_document_trigger
  AFTER INSERT OR UPDATE OF invoice_name, move_state, payment_state,
    amount_total, amount_residual, amount_paid
  ON odoo_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION sync_local_invoice_from_odoo_document();

DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'upsert_odoo_invoice_document_atomic(jsonb,jsonb,jsonb,uuid)'::regprocedure
  ) INTO v_definition;

  v_definition := REPLACE(
    v_definition,
    'IF NOT is_admin_editor() THEN',
    'IF auth.role() <> ''service_role'' AND NOT is_admin_editor() THEN'
  );
  EXECUTE v_definition;
END;
$$;

REVOKE ALL ON FUNCTION hydrate_odoo_document_tenant() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sync_local_invoice_from_odoo_document() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_odoo_invoice_document_atomic(JSONB, JSONB, JSONB, UUID)
  TO authenticated, service_role;

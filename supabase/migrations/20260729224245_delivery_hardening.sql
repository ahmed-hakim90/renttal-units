-- Delivery hardening: financial sync correctness, storage IDOR, system-owner
-- assignment guard, atomic role permission updates, and outbox claim safety.

-- ---------------------------------------------------------------------------
-- 1) Align upsert_odoo_invoice_document_atomic with local-first billing rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_odoo_invoice_document_atomic(
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
  IF auth.role() <> 'service_role' AND NOT public.has_permission('odoo.manage') THEN
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

  -- Local-first: never regress issued invoices to due from an Odoo draft,
  -- and only apply paid amounts when the Odoo move is posted.
  PERFORM set_config('app.odoo_invoice_sync', 'on', true);
  UPDATE invoices
  SET
    odoo_invoice_name = v_document.invoice_name,
    odoo_invoice_state = v_document.move_state,
    odoo_sync_status = 'synced',
    odoo_sync_error = NULL,
    paid_amount = CASE
      WHEN v_document.move_state = 'posted' AND v_document.amount_total > 0
        THEN LEAST(
          amount,
          ROUND(amount * v_document.amount_paid / v_document.amount_total, 2)
        )
      ELSE paid_amount
    END,
    status = CASE
      WHEN v_document.move_state = 'draft' THEN status
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

-- ---------------------------------------------------------------------------
-- 2) Contract document storage: scope by attachment path ownership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS contract_documents_select ON storage.objects;
CREATE POLICY contract_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND public.has_permission('contracts.view')
    AND EXISTS (
      SELECT 1
      FROM public.contract_attachments ca
      WHERE ca.storage_path = name
    )
  );

DROP POLICY IF EXISTS contract_documents_insert ON storage.objects;
CREATE POLICY contract_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND public.has_permission('contracts.update')
    AND (storage.foldername(name))[1] = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id::text = (storage.foldername(name))[2]
    )
  );

DROP POLICY IF EXISTS contract_documents_delete ON storage.objects;
CREATE POLICY contract_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND (public.has_permission('contracts.update') OR public.has_permission('contracts.delete'))
    AND EXISTS (
      SELECT 1
      FROM public.contract_attachments ca
      WHERE ca.storage_path = name
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Prevent non-owners from assigning the system-owner role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_system_owner_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_is_owner BOOLEAN;
  v_actor_is_owner BOOLEAN;
BEGIN
  SELECT COALESCE(is_system_owner, false) INTO v_target_is_owner
  FROM public.roles
  WHERE id = NEW.role_id;

  IF NOT COALESCE(v_target_is_owner, false) THEN
    RETURN NEW;
  END IF;

  -- service_role / system migrations may assign freely
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(r.is_system_owner, false) INTO v_actor_is_owner
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_actor_is_owner, false) THEN
    RAISE EXCEPTION 'SYSTEM_OWNER_ASSIGNMENT_FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_system_owner_assignment ON public.profiles;
CREATE TRIGGER profiles_prevent_system_owner_assignment
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_owner_assignment();

-- ---------------------------------------------------------------------------
-- 4) Atomic role permission replacement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_role_permissions(
  p_role_id UUID,
  p_permission_keys TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_permission('roles.manage') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT is_system_owner INTO v_is_owner FROM public.roles WHERE id = p_role_id;
  IF v_is_owner IS NULL THEN
    RAISE EXCEPTION 'Role not found';
  END IF;
  IF v_is_owner THEN
    RAISE EXCEPTION 'System owner role cannot be modified';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  IF p_permission_keys IS NOT NULL AND cardinality(p_permission_keys) > 0 THEN
    INSERT INTO public.role_permissions (role_id, permission_key)
    SELECT p_role_id, UNNEST(p_permission_keys);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_role_permissions(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions(UUID, TEXT[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Atomic outbox claim with stuck recovery and max attempts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_odoo_outbox_batch(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.odoo_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_permission('odoo.manage') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Recover stuck processing items older than 15 minutes
  UPDATE public.odoo_outbox
  SET
    status = 'failed',
    last_error = COALESCE(last_error, 'Recovered from stuck processing state'),
    available_at = NOW(),
    updated_at = NOW()
  WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '15 minutes';

  RETURN QUERY
  WITH ready AS (
    SELECT id
    FROM public.odoo_outbox
    WHERE status IN ('pending', 'failed')
      AND available_at <= NOW()
      AND attempts < 8
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 10), 50), 1)
  )
  UPDATE public.odoo_outbox o
  SET
    status = 'processing',
    updated_at = NOW()
  FROM ready
  WHERE o.id = ready.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_odoo_outbox_batch(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_odoo_outbox_batch(INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_system_owner_assignment() FROM PUBLIC, anon, authenticated;

-- Annual pre-tax pricing source for contract lines.
-- New contracts store annual_untaxed; existing rows keep contract_total_inclusive.
-- contracts.total_amount and contract_lines.amount remain full-contract tax-inclusive
-- totals (derived for annual lines) so reporting/invoices stay compatible.

CREATE TYPE public.contract_line_amount_basis AS ENUM (
  'annual_untaxed',
  'contract_total_inclusive'
);

ALTER TABLE public.contract_lines
  ADD COLUMN amount_basis public.contract_line_amount_basis NOT NULL DEFAULT 'contract_total_inclusive',
  ADD COLUMN annual_amount_untaxed NUMERIC(14, 2);

-- Incomplete drafts may omit annual_amount_untaxed until the line is finished.
-- Non-draft writes are enforced in replace_contract_lines.
ALTER TABLE public.contract_lines
  ADD CONSTRAINT contract_lines_annual_amount_untaxed_check
  CHECK (
    (
      amount_basis = 'contract_total_inclusive'
      AND annual_amount_untaxed IS NULL
    )
    OR (
      amount_basis = 'annual_untaxed'
      AND (annual_amount_untaxed IS NULL OR annual_amount_untaxed > 0)
    )
  );

COMMENT ON COLUMN public.contract_lines.amount_basis IS
  'annual_untaxed = operator enters annual pre-tax; contract_total_inclusive = legacy full-contract inclusive total';
COMMENT ON COLUMN public.contract_lines.annual_amount_untaxed IS
  'Annual amount before tax when amount_basis is annual_untaxed; null for legacy lines or incomplete drafts';
COMMENT ON COLUMN public.contract_lines.amount IS
  'Full-contract tax-inclusive total. Derived from annual pricing for annual_untaxed lines.';

CREATE OR REPLACE FUNCTION public.replace_contract_lines(
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
  v_tax_treatment contract_tax_treatment;
  v_amount_basis contract_line_amount_basis;
  v_annual NUMERIC(14, 2);
  v_amount NUMERIC(14, 2);
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
    v_tax_treatment := COALESCE(
      NULLIF(v_line->>'taxTreatment', '')::contract_tax_treatment,
      'standard'
    );
    v_amount_basis := COALESCE(
      NULLIF(v_line->>'amountBasis', '')::contract_line_amount_basis,
      'contract_total_inclusive'
    );
    v_annual := NULLIF(v_line->>'annualAmountUntaxed', '')::NUMERIC;
    v_amount := COALESCE((v_line->>'amount')::NUMERIC, 0);

    IF v_amount_basis = 'annual_untaxed' THEN
      IF v_annual IS NOT NULL AND v_annual <= 0 THEN
        RAISE EXCEPTION 'ANNUAL_AMOUNT_REQUIRED';
      END IF;
      IF NOT v_soft AND (v_annual IS NULL OR v_annual <= 0) THEN
        RAISE EXCEPTION 'ANNUAL_AMOUNT_REQUIRED';
      END IF;
      IF NOT v_soft AND v_amount <= 0 THEN
        RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED';
      END IF;
    ELSE
      v_annual := NULL;
      IF NOT v_soft AND v_amount <= 0 THEN
        RAISE EXCEPTION 'CONTRACT_AMOUNT_REQUIRED';
      END IF;
    END IF;

    IF NOT v_soft AND v_line_type = 'rental' AND v_unit_id IS NULL THEN
      RAISE EXCEPTION 'RENTAL_LINE_REQUIRED';
    END IF;

    INSERT INTO contract_lines (
      contract_id, line_type, unit_id, description, amount,
      amount_basis, annual_amount_untaxed,
      period_start, period_end, odoo_line_id, odoo_product_id,
      odoo_product_name, tax_rate, tax_treatment, sort_order
    ) VALUES (
      p_contract_id,
      v_line_type,
      v_unit_id,
      NULLIF(v_line->>'description', ''),
      v_amount,
      v_amount_basis,
      CASE WHEN v_amount_basis = 'annual_untaxed' THEN v_annual ELSE NULL END,
      NULLIF(v_line->>'periodStart', '')::DATE,
      NULLIF(v_line->>'periodEnd', '')::DATE,
      NULLIF(v_line->>'odooLineId', '')::BIGINT,
      NULLIF(v_line->>'odooProductId', '')::BIGINT,
      NULLIF(v_line->>'odooProductName', ''),
      COALESCE((v_line->>'taxRate')::NUMERIC, 0),
      v_tax_treatment,
      COALESCE((v_line->>'sortOrder')::SMALLINT, v_sort)
    );

    v_total := v_total + v_amount;
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

  -- Always derive contract total from persisted line amounts; never trust a separate client total.
  UPDATE contracts
  SET unit_id = v_primary_unit,
      total_amount = v_total
  WHERE id = p_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_contract_lines(UUID, JSONB) TO authenticated, service_role;

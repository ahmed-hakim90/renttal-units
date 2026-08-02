-- Contract-level billing conditions. The first supported rule increases rental
-- installments after a configured number of months while preserving the signed
-- contract total. JSONB keeps the rule envelope extensible without weakening
-- validation for the currently supported condition.

CREATE OR REPLACE FUNCTION public.is_valid_contract_payment_conditions(p_conditions JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_condition JSONB;
BEGIN
  IF jsonb_typeof(p_conditions) <> 'array'
     OR jsonb_array_length(p_conditions) > 10 THEN
    RETURN false;
  END IF;

  FOR v_condition IN
    SELECT value FROM jsonb_array_elements(p_conditions)
  LOOP
    IF jsonb_typeof(v_condition) <> 'object'
       OR NOT (
         v_condition ?& ARRAY[
           'condition_type',
           'enabled',
           'applies_after_months',
           'percentage',
           'target'
         ]
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(v_condition) AS key
         WHERE key NOT IN (
           'condition_type',
           'enabled',
           'applies_after_months',
           'percentage',
           'target'
         )
       )
       OR v_condition->>'condition_type' <> 'percentage_increase_after'
       OR jsonb_typeof(v_condition->'enabled') <> 'boolean'
       OR jsonb_typeof(v_condition->'applies_after_months') <> 'number'
       OR jsonb_typeof(v_condition->'percentage') <> 'number'
       OR v_condition->>'target' NOT IN ('rental', 'all')
       OR MOD((v_condition->>'applies_after_months')::NUMERIC, 1) <> 0
       OR (v_condition->>'applies_after_months')::INTEGER < 1
       OR (v_condition->>'applies_after_months')::INTEGER > 1200
       OR (v_condition->>'percentage')::NUMERIC <= 0
       OR (v_condition->>'percentage')::NUMERIC > 1000 THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

ALTER TABLE public.contracts
  ADD COLUMN payment_conditions JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD CONSTRAINT contracts_payment_conditions_valid
    CHECK (public.is_valid_contract_payment_conditions(payment_conditions));

CREATE OR REPLACE FUNCTION public.create_contract_with_conditions_atomic(
  p_contract JSONB,
  p_tenant JSONB,
  p_schedule JSONB,
  p_lines JSONB DEFAULT NULL,
  p_payment_conditions JSONB DEFAULT '[]'::JSONB
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract public.contracts;
BEGIN
  IF NOT public.is_valid_contract_payment_conditions(p_payment_conditions) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_CONDITIONS' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.create_contract_with_schedule_atomic(
    p_contract,
    p_tenant,
    p_schedule,
    p_lines
  );

  UPDATE public.contracts
  SET payment_conditions = p_payment_conditions
  WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_contract_draft_with_conditions_atomic(
  p_contract_id UUID,
  p_contract JSONB,
  p_tenant JSONB,
  p_lines JSONB DEFAULT '[]'::JSONB,
  p_payment_conditions JSONB DEFAULT '[]'::JSONB
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract public.contracts;
BEGIN
  IF NOT public.is_valid_contract_payment_conditions(p_payment_conditions) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_CONDITIONS' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.save_contract_draft_atomic(
    p_contract_id,
    p_contract,
    p_tenant,
    p_lines
  );

  UPDATE public.contracts
  SET payment_conditions = p_payment_conditions
  WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_contract_draft_with_conditions_atomic(
  p_contract_id UUID,
  p_contract JSONB,
  p_tenant JSONB,
  p_schedule JSONB,
  p_lines JSONB,
  p_payment_conditions JSONB DEFAULT '[]'::JSONB
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract public.contracts;
BEGIN
  IF NOT public.is_valid_contract_payment_conditions(p_payment_conditions) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_CONDITIONS' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.activate_contract_draft_atomic(
    p_contract_id,
    p_contract,
    p_tenant,
    p_schedule,
    p_lines
  );

  UPDATE public.contracts
  SET payment_conditions = p_payment_conditions
  WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_with_conditions_atomic(
  JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_contract_draft_with_conditions_atomic(
  UUID, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_contract_draft_with_conditions_atomic(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_contract_with_conditions_atomic(
  JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_contract_draft_with_conditions_atomic(
  UUID, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_contract_draft_with_conditions_atomic(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;

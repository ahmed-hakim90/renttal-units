-- Allow a contract to bill its first twelve months as one installment, then
-- continue with the contract's normal payment cycle.

CREATE OR REPLACE FUNCTION public.is_valid_contract_payment_conditions(p_conditions JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_condition JSONB;
  v_type TEXT;
BEGIN
  IF jsonb_typeof(p_conditions) <> 'array'
     OR jsonb_array_length(p_conditions) > 10 THEN
    RETURN false;
  END IF;

  FOR v_condition IN
    SELECT value FROM jsonb_array_elements(p_conditions)
  LOOP
    IF jsonb_typeof(v_condition) <> 'object' THEN
      RETURN false;
    END IF;

    v_type := v_condition->>'condition_type';
    IF v_type = 'percentage_increase_after' THEN
      IF NOT (
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
    ELSIF v_type = 'first_year_single_installment' THEN
      IF NOT (v_condition ?& ARRAY['condition_type', 'enabled', 'target'])
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(v_condition) AS key
        WHERE key NOT IN ('condition_type', 'enabled', 'target')
      )
      OR jsonb_typeof(v_condition->'enabled') <> 'boolean'
      OR v_condition->>'target' <> 'all' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

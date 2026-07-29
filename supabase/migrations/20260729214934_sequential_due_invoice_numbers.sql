-- Local due invoices use a short, concurrency-safe number. Imported Odoo
-- document numbers remain unchanged.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE SEQUENCE public.due_invoice_number_seq
  AS BIGINT
  START WITH 1
  MINVALUE 1;

REVOKE ALL ON SEQUENCE public.due_invoice_number_seq FROM PUBLIC, anon, authenticated;

-- Preserve any existing short numbers and migrate only the legacy local
-- placeholders. Ordering makes the backfill deterministic.
DO $$
DECLARE
  v_existing_max BIGINT;
  v_final_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(substring(invoice_number FROM 5)::BIGINT), 0)
  INTO v_existing_max
  FROM public.invoices
  WHERE invoice_number ~ '^DUE-[0-9]{6,}$';

  WITH legacy_due_invoices AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY due_date, period_start, created_at, id) AS sequence_offset
    FROM public.invoices
    WHERE odoo_invoice_id IS NULL
      AND invoice_number ~ '^DUE-[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  )
  UPDATE public.invoices AS invoice
  SET invoice_number =
    'DUE-' || lpad((v_existing_max + legacy.sequence_offset)::TEXT, 6, '0')
  FROM legacy_due_invoices AS legacy
  WHERE invoice.id = legacy.id;

  SELECT COALESCE(MAX(substring(invoice_number FROM 5)::BIGINT), 0)
  INTO v_final_max
  FROM public.invoices
  WHERE invoice_number ~ '^DUE-[0-9]{6,}$';

  IF v_final_max = 0 THEN
    PERFORM setval('public.due_invoice_number_seq', 1, FALSE);
  ELSE
    PERFORM setval('public.due_invoice_number_seq', v_final_max, TRUE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.next_due_invoice_number()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'DUE-' || lpad(nextval('public.due_invoice_number_seq')::TEXT, 6, '0');
$$;

REVOKE ALL ON FUNCTION private.next_due_invoice_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assign_due_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.invoice_number IS NULL
    OR (
      NEW.odoo_invoice_id IS NULL
      AND NEW.invoice_number ~ '^DUE-[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
  THEN
    NEW.invoice_number := private.next_due_invoice_number();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_due_invoice_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER assign_due_invoice_number_before_insert
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION private.assign_due_invoice_number();

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

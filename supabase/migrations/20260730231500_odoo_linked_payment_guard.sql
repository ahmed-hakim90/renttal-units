-- Once a local invoice is linked to Odoo, Odoo owns its payment state even
-- before payment_state has been populated by the first reconciliation.

CREATE OR REPLACE FUNCTION public.prevent_odoo_managed_payment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.id = NEW.invoice_id
      AND invoice.odoo_invoice_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAYMENT_MANAGED_BY_ODOO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

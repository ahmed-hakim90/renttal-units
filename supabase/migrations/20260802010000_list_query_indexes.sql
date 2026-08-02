-- Additive indexes for high-volume list filters and FK join cleanup.
-- Safe/idempotent: create only when missing.

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
  ON public.invoices (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_by
  ON public.payments (created_by);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date
  ON public.payments (payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_created_at
  ON public.contracts (created_at DESC);

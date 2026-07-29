-- Odoo integration metadata for units, tenants, contracts, invoices, and sync logs.

CREATE TYPE odoo_sync_status AS ENUM ('not_synced', 'synced', 'failed', 'needs_review');
CREATE TYPE contract_tax_mode AS ENUM ('taxable', 'non_taxable');

ALTER TABLE units
  ADD COLUMN odoo_product_id INTEGER,
  ADD COLUMN odoo_product_reference TEXT,
  ADD COLUMN odoo_sync_status odoo_sync_status NOT NULL DEFAULT 'not_synced',
  ADD COLUMN odoo_last_sync_at TIMESTAMPTZ;

ALTER TABLE tenants
  ADD COLUMN odoo_partner_id INTEGER,
  ADD COLUMN vat TEXT,
  ADD COLUMN street TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN country_code TEXT;

ALTER TABLE contracts
  ADD COLUMN tax_mode contract_tax_mode NOT NULL DEFAULT 'taxable',
  ADD COLUMN odoo_sync_status odoo_sync_status NOT NULL DEFAULT 'not_synced',
  ADD COLUMN odoo_sync_error TEXT;

ALTER TABLE invoices
  ADD COLUMN odoo_invoice_id INTEGER,
  ADD COLUMN odoo_invoice_name TEXT,
  ADD COLUMN odoo_invoice_state TEXT,
  ADD COLUMN odoo_sync_status odoo_sync_status NOT NULL DEFAULT 'not_synced',
  ADD COLUMN odoo_sync_error TEXT;

CREATE TABLE odoo_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  status odoo_sync_status NOT NULL,
  message TEXT,
  payload JSONB,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_units_odoo_product ON units(odoo_product_id);
CREATE INDEX idx_tenants_odoo_partner ON tenants(odoo_partner_id);
CREATE INDEX idx_invoices_odoo_invoice ON invoices(odoo_invoice_id);
CREATE INDEX idx_invoices_odoo_sync_status ON invoices(odoo_sync_status);
CREATE INDEX idx_contracts_odoo_sync_status ON contracts(odoo_sync_status);
CREATE INDEX idx_odoo_sync_logs_entity ON odoo_sync_logs(entity_type, entity_id);
CREATE INDEX idx_odoo_sync_logs_created_at ON odoo_sync_logs(created_at DESC);

ALTER TABLE odoo_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY odoo_sync_logs_select ON odoo_sync_logs FOR SELECT TO authenticated USING (is_admin_editor());
CREATE POLICY odoo_sync_logs_insert ON odoo_sync_logs FOR INSERT TO authenticated WITH CHECK (is_admin_editor());

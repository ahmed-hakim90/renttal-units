-- Map local locations to Odoo analytic accounts for invoice line distribution.

ALTER TABLE locations
  ADD COLUMN odoo_analytic_account_id INTEGER,
  ADD COLUMN odoo_analytic_account_name TEXT;

CREATE INDEX idx_locations_odoo_analytic_account ON locations(odoo_analytic_account_id);

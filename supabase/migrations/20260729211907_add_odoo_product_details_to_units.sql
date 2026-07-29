-- Preserve trusted Odoo product metadata on linked rental units.

ALTER TABLE units
  ADD COLUMN odoo_product_name TEXT,
  ADD COLUMN odoo_product_display_name TEXT,
  ADD COLUMN odoo_product_description TEXT,
  ADD COLUMN odoo_product_category_id INTEGER,
  ADD COLUMN odoo_product_category_name TEXT;

UPDATE units
SET
  odoo_product_name = unit_number,
  odoo_product_display_name = unit_number
WHERE odoo_product_id IS NOT NULL;

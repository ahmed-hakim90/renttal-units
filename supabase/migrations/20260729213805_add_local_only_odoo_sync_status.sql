-- Local contracts intentionally remain outside Odoo until an invoice is issued.
ALTER TYPE odoo_sync_status ADD VALUE IF NOT EXISTS 'local_only';

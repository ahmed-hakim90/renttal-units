-- Dashboard cards use three configurable, non-overlapping future due windows.
INSERT INTO settings (key, value)
VALUES ('dashboard_due_horizons', '[3, 7, 15]'::JSONB)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date
  ON invoices(status, due_date);

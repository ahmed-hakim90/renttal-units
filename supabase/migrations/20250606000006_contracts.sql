-- Move rental terms from units to standalone contracts.

CREATE TYPE contract_status AS ENUM ('active', 'cancelled', 'completed');

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  payment_cycle payment_cycle NOT NULL DEFAULT 'monthly',
  status contract_status NOT NULL DEFAULT 'active',
  cancelled_at TIMESTAMPTZ,
  cancellation_date DATE,
  cancellation_handling TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_contract_period CHECK (end_date >= start_date),
  CONSTRAINT positive_contract_amount CHECK (total_amount > 0),
  CONSTRAINT valid_cancellation_handling CHECK (
    cancellation_handling IS NULL
    OR cancellation_handling IN ('keep_current_full', 'prorate_current')
  ),
  CONSTRAINT cancelled_contract_has_date CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancellation_date IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_contracts_one_active_per_unit
  ON contracts(unit_id)
  WHERE status = 'active';

CREATE INDEX idx_contracts_unit ON contracts(unit_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_dates ON contracts(start_date, end_date);

CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE invoices
  ADD COLUMN contract_id UUID REFERENCES contracts(id) ON DELETE RESTRICT;

CREATE INDEX idx_invoices_contract ON invoices(contract_id);

ALTER TABLE units
  ALTER COLUMN monthly_rent DROP NOT NULL;

ALTER TABLE units
  DROP CONSTRAINT IF EXISTS occupied_units_require_rent_dates;

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select ON contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY contracts_insert ON contracts FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY contracts_update ON contracts FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY contracts_delete ON contracts FOR DELETE TO authenticated USING (is_admin_editor());

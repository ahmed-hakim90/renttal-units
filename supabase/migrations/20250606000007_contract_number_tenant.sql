-- Add contract_number (optional, unique)
ALTER TABLE contracts ADD COLUMN contract_number TEXT;
ALTER TABLE contracts ADD CONSTRAINT contracts_contract_number_unique UNIQUE (contract_number);

-- Add tenant_id (optional FK to tenants)
ALTER TABLE contracts ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);

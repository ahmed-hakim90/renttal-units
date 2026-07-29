-- Add draft to contract_status. Must commit before the value is usable
-- in subsequent statements (Postgres enum ADD VALUE rule).
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'draft';

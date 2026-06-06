-- Rental Units Management System - Initial Schema
-- Enable required extensions (Supabase installs extensions in the extensions schema)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Custom types
CREATE TYPE user_role AS ENUM ('admin_editor', 'viewer');
CREATE TYPE payment_cycle AS ENUM ('monthly', 'quarterly', 'semi_annual', 'yearly');
CREATE TYPE unit_status AS ENUM ('occupied', 'vacant', 'maintenance');
CREATE TYPE invoice_status AS ENUM ('due', 'invoice_issued', 'partially_paid', 'fully_paid', 'overdue');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'check', 'other');

-- Profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  address TEXT,
  city TEXT,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenants
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  national_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Units
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  unit_number TEXT NOT NULL,
  floor TEXT,
  area_sqm NUMERIC(10,2),
  monthly_rent NUMERIC(12,2) NOT NULL,
  payment_cycle payment_cycle NOT NULL DEFAULT 'monthly',
  status unit_status NOT NULL DEFAULT 'vacant',
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location_id, unit_number)
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'due',
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unit_id, period_start, period_end),
  CONSTRAINT paid_not_exceed_amount CHECK (paid_amount <= amount),
  CONSTRAINT valid_period CHECK (period_end >= period_start)
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Import logs
CREATE TABLE import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  imported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs (append-only)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_units_location ON units(location_id);
CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_invoices_unit ON invoices(unit_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- Helper: get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Helper: check if user is admin_editor
CREATE OR REPLACE FUNCTION is_admin_editor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_editor'
  );
$$;

-- Auto-create profile for auth users. Role must never come from user metadata.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'viewer'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY profiles_insert_admin ON profiles FOR INSERT TO authenticated WITH CHECK (is_admin_editor());

-- Locations policies
CREATE POLICY locations_select ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY locations_insert ON locations FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY locations_update ON locations FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY locations_delete ON locations FOR DELETE TO authenticated USING (is_admin_editor());

-- Tenants policies
CREATE POLICY tenants_select ON tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY tenants_insert ON tenants FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY tenants_update ON tenants FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY tenants_delete ON tenants FOR DELETE TO authenticated USING (is_admin_editor());

-- Units policies
CREATE POLICY units_select ON units FOR SELECT TO authenticated USING (true);
CREATE POLICY units_insert ON units FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY units_update ON units FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY units_delete ON units FOR DELETE TO authenticated USING (is_admin_editor());

-- Invoices policies
CREATE POLICY invoices_select ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY invoices_insert ON invoices FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY invoices_update ON invoices FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY invoices_delete ON invoices FOR DELETE TO authenticated USING (is_admin_editor());

-- Payments policies
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY payments_insert ON payments FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY payments_update ON payments FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY payments_delete ON payments FOR DELETE TO authenticated USING (is_admin_editor());

-- Import logs policies
CREATE POLICY import_logs_select ON import_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY import_logs_insert ON import_logs FOR INSERT TO authenticated WITH CHECK (is_admin_editor());

-- Audit logs policies (append-only for admin, read-only for all)
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (is_admin_editor());

-- Settings policies
CREATE POLICY settings_select ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_insert ON settings FOR INSERT TO authenticated WITH CHECK (is_admin_editor());
CREATE POLICY settings_update ON settings FOR UPDATE TO authenticated USING (is_admin_editor()) WITH CHECK (is_admin_editor());
CREATE POLICY settings_delete ON settings FOR DELETE TO authenticated USING (is_admin_editor());

-- Seed default settings
INSERT INTO settings (key, value) VALUES
  ('company_name', '{"en": "Rental Units Co.", "ar": "شركة الوحدات السكنية"}'),
  ('default_payment_terms_days', '30'),
  ('currency', '"SAR"'),
  ('overdue_grace_days', '7');

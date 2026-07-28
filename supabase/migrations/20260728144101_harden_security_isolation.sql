-- Harden security isolation: tighter SELECT policies, SECURITY DEFINER grants,
-- fixed search_path, staff password flag, contract/tenant data constraints.

-- ---------------------------------------------------------------------------
-- Profiles: must_change_password for temp credentials
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Contracts: backfill numbers, then require them
-- ---------------------------------------------------------------------------
UPDATE contracts
SET contract_number = 'AUTO-' || upper(substr(replace(id::text, '-', ''), 1, 12))
WHERE contract_number IS NULL OR btrim(contract_number) = '';

ALTER TABLE contracts
  ALTER COLUMN contract_number SET NOT NULL;

ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_contract_number_format;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_contract_number_format
  CHECK (char_length(btrim(contract_number)) BETWEEN 1 AND 64);

-- ---------------------------------------------------------------------------
-- Tenants: national_id format + uniqueness
-- ---------------------------------------------------------------------------
UPDATE tenants
SET national_id = NULL
WHERE national_id IS NOT NULL AND btrim(national_id) = '';

-- Normalize whitespace-only / invalid historical values to NULL so CHECK can apply
UPDATE tenants
SET national_id = NULL
WHERE national_id IS NOT NULL
  AND national_id !~ '^[0-9]{10}$';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_national_id_format;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_national_id_format
  CHECK (national_id IS NULL OR national_id ~ '^[0-9]{10}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_national_id_unique
  ON tenants (national_id)
  WHERE national_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Fix mutable search_path on trigger helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_payment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'PAYMENTS_ARE_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_direct_invoice_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  AND current_setting('app.record_payment_atomic', true) IS DISTINCT FROM 'on'
  AND current_setting('app.issue_due_invoice_atomic', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVOICE_PAYMENT_FIELDS_REQUIRE_RPC' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure role helpers keep a fixed search_path
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

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

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'viewer',
    false
  );
  RETURN NEW;
END;
$$;

-- Clear own must_change_password after a forced password change
CREATE OR REPLACE FUNCTION clear_own_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET must_change_password = false
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION clear_own_must_change_password() FROM PUBLIC;
REVOKE ALL ON FUNCTION clear_own_must_change_password() FROM anon;
GRANT EXECUTE ON FUNCTION clear_own_must_change_password() TO authenticated;

-- ---------------------------------------------------------------------------
-- REVOKE broad EXECUTE on SECURITY DEFINER helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

REVOKE ALL ON FUNCTION is_admin_editor() FROM PUBLIC;
REVOKE ALL ON FUNCTION is_admin_editor() FROM anon;
GRANT EXECUTE ON FUNCTION is_admin_editor() TO authenticated;

REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION handle_new_user() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated';
  END IF;
END $$;

-- Payment/invoice RPCs: keep authenticated-only (already revoked from anon)
REVOKE ALL ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION issue_due_invoice_atomic(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tighten SELECT policies (least privilege within single org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin_editor());

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT TO authenticated
  USING (is_admin_editor());

DROP POLICY IF EXISTS import_logs_select ON import_logs;
CREATE POLICY import_logs_select ON import_logs
  FOR SELECT TO authenticated
  USING (is_admin_editor());

DROP POLICY IF EXISTS settings_select ON settings;
CREATE POLICY settings_select ON settings
  FOR SELECT TO authenticated
  USING (is_admin_editor());

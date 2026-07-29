-- Granular RBAC: roles, permissions catalog, role grants, profile.role_id.
-- Preserves existing admin_editor / viewer access via seeded system roles.

CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_system_owner_is_system CHECK (NOT is_system_owner OR is_system)
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_one_system_owner_idx
  ON public.roles ((is_system_owner))
  WHERE is_system_owner;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_key_idx
  ON public.role_permissions (permission_key);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS profiles_role_id_idx ON public.profiles (role_id);

-- Permission catalog (must stay aligned with src/lib/auth/permissions.ts)
INSERT INTO public.permissions (key, category, description) VALUES
  ('locations.view', 'locations', 'View locations'),
  ('locations.create', 'locations', 'Create locations'),
  ('locations.update', 'locations', 'Update locations'),
  ('locations.delete', 'locations', 'Delete locations'),
  ('units.view', 'units', 'View units'),
  ('units.create', 'units', 'Create units'),
  ('units.update', 'units', 'Update units'),
  ('units.delete', 'units', 'Delete units'),
  ('tenants.view', 'tenants', 'View tenants'),
  ('tenants.create', 'tenants', 'Create tenants'),
  ('tenants.update', 'tenants', 'Update tenants'),
  ('tenants.delete', 'tenants', 'Delete tenants'),
  ('contracts.view', 'contracts', 'View contracts'),
  ('contracts.create', 'contracts', 'Create contracts'),
  ('contracts.update', 'contracts', 'Update contracts'),
  ('contracts.delete', 'contracts', 'Delete contracts'),
  ('invoices.view', 'invoices', 'View invoices'),
  ('invoices.create', 'invoices', 'Create invoices'),
  ('invoices.update', 'invoices', 'Update invoices'),
  ('invoices.delete', 'invoices', 'Delete invoices'),
  ('payments.view', 'payments', 'View payments'),
  ('payments.record', 'payments', 'Record payments'),
  ('reports.view', 'reports', 'View reports'),
  ('reports.export', 'reports', 'Export reports'),
  ('imports.manage', 'imports', 'Manage imports'),
  ('odoo.manage', 'odoo', 'Manage Odoo integration'),
  ('users.manage', 'users', 'Manage users'),
  ('roles.manage', 'roles', 'Manage roles and permissions'),
  ('settings.manage', 'settings', 'Manage settings'),
  ('feature_flags.manage', 'feature_flags', 'Manage feature flags'),
  ('audit.view', 'audit', 'View audit logs')
ON CONFLICT (key) DO UPDATE
SET category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO public.roles (slug, name_en, name_ar, description_en, description_ar, is_system, is_system_owner)
VALUES
  (
    'admin_editor',
    'Admin / Editor',
    'مدير / محرر',
    'Full system access',
    'صلاحية كاملة على النظام',
    TRUE,
    TRUE
  ),
  (
    'viewer',
    'Viewer',
    'مشاهد',
    'Read-only operational access',
    'عرض تشغيلي للقراءة فقط',
    TRUE,
    FALSE
  )
ON CONFLICT (slug) DO UPDATE
SET name_en = EXCLUDED.name_en,
    name_ar = EXCLUDED.name_ar,
    description_en = EXCLUDED.description_en,
    description_ar = EXCLUDED.description_ar,
    is_system = EXCLUDED.is_system,
    is_system_owner = EXCLUDED.is_system_owner,
    updated_at = NOW();

-- Grant all permissions to system owner
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug = 'admin_editor'
ON CONFLICT DO NOTHING;

-- Seed viewer read permissions
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('locations.view'),
    ('units.view'),
    ('tenants.view'),
    ('contracts.view'),
    ('invoices.view'),
    ('payments.view'),
    ('reports.view')
) AS p(key)
WHERE r.slug = 'viewer'
ON CONFLICT DO NOTHING;

-- Backfill profiles.role_id from legacy enum
UPDATE public.profiles AS profile
SET role_id = roles.id
FROM public.roles AS roles
WHERE profile.role_id IS NULL
  AND (
    (profile.role = 'admin_editor' AND roles.slug = 'admin_editor')
    OR (profile.role = 'viewer' AND roles.slug = 'viewer')
  );

-- Any remaining profiles default to viewer
UPDATE public.profiles AS profile
SET role_id = roles.id
FROM public.roles AS roles
WHERE profile.role_id IS NULL
  AND roles.slug = 'viewer';

ALTER TABLE public.profiles
  ALTER COLUMN role_id SET NOT NULL;

CREATE OR REPLACE FUNCTION private.has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    INNER JOIN public.role_permissions AS grant_row
      ON grant_row.role_id = profile.role_id
    WHERE profile.id = auth.uid()
      AND grant_row.permission_key = p_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_permission(p_key);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_editor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    INNER JOIN public.roles AS role_row
      ON role_row.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND role_row.is_system_owner = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      INNER JOIN public.roles AS role_row
        ON role_row.id = profile.role_id
      WHERE profile.id = auth.uid()
        AND role_row.is_system_owner = TRUE
    ) THEN 'admin_editor'::user_role
    ELSE COALESCE(
      (SELECT role FROM public.profiles WHERE id = auth.uid()),
      'viewer'::user_role
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_legacy_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_is_owner BOOLEAN;
BEGIN
  IF NEW.role_id IS NULL THEN
    RAISE EXCEPTION 'role_id is required';
  END IF;

  SELECT slug, is_system_owner
  INTO v_slug, v_is_owner
  FROM public.roles
  WHERE id = NEW.role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown role_id';
  END IF;

  IF v_is_owner THEN
    NEW.role := 'admin_editor';
  ELSE
    NEW.role := 'viewer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_legacy_role ON public.profiles;
CREATE TRIGGER trg_sync_profile_legacy_role
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_legacy_role();

CREATE OR REPLACE FUNCTION public.prevent_last_system_owner_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_is_owner BOOLEAN;
  v_new_is_owner BOOLEAN;
  v_owner_count INTEGER;
BEGIN
  SELECT is_system_owner INTO v_old_is_owner
  FROM public.roles
  WHERE id = OLD.role_id;

  SELECT is_system_owner INTO v_new_is_owner
  FROM public.roles
  WHERE id = NEW.role_id;

  IF COALESCE(v_old_is_owner, FALSE) AND NOT COALESCE(v_new_is_owner, FALSE) THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.profiles AS profile
    INNER JOIN public.roles AS role_row ON role_row.id = profile.role_id
    WHERE role_row.is_system_owner = TRUE
      AND profile.id <> OLD.id;

    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot demote or remove the last system owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_system_owner_demotion ON public.profiles;
CREATE TRIGGER trg_prevent_last_system_owner_demotion
  BEFORE UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_system_owner_demotion();

CREATE OR REPLACE FUNCTION public.prevent_delete_protected_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System roles cannot be deleted';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete a role that is assigned to users';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_protected_role ON public.roles;
CREATE TRIGGER trg_prevent_delete_protected_role
  BEFORE DELETE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_protected_role();

CREATE OR REPLACE FUNCTION public.prevent_mutate_system_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_system_owner THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug
      OR NEW.is_system IS DISTINCT FROM OLD.is_system
      OR NEW.is_system_owner IS DISTINCT FROM OLD.is_system_owner THEN
      RAISE EXCEPTION 'System owner role identity cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutate_system_owner_role ON public.roles;
CREATE TRIGGER trg_prevent_mutate_system_owner_role
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mutate_system_owner_role();

CREATE OR REPLACE FUNCTION public.prevent_strip_system_owner_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT is_system_owner INTO v_is_owner
  FROM public.roles
  WHERE id = OLD.role_id;

  IF COALESCE(v_is_owner, FALSE) THEN
    RAISE EXCEPTION 'Cannot remove permissions from the system owner role';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_strip_system_owner_permissions ON public.role_permissions;
CREATE TRIGGER trg_prevent_strip_system_owner_permissions
  BEFORE DELETE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_strip_system_owner_permissions();

-- Keep new auth users on the viewer system role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_role_id UUID;
BEGIN
  SELECT id INTO v_viewer_role_id
  FROM public.roles
  WHERE slug = 'viewer';

  INSERT INTO public.profiles (id, email, full_name, role, role_id, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'viewer',
    v_viewer_role_id,
    FALSE
  );

  RETURN NEW;
END;
$$;

-- RLS for new tables
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_select ON public.permissions;
CREATE POLICY permissions_select ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (
    public.has_permission('roles.manage')
    OR public.has_permission('users.manage')
    OR id = (SELECT role_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS roles_insert ON public.roles;
CREATE POLICY roles_insert ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('roles.manage') AND is_system = FALSE AND is_system_owner = FALSE);

DROP POLICY IF EXISTS roles_update ON public.roles;
CREATE POLICY roles_update ON public.roles
  FOR UPDATE TO authenticated
  USING (public.has_permission('roles.manage') AND is_system_owner = FALSE)
  WITH CHECK (public.has_permission('roles.manage') AND is_system_owner = FALSE);

DROP POLICY IF EXISTS roles_delete ON public.roles;
CREATE POLICY roles_delete ON public.roles
  FOR DELETE TO authenticated
  USING (public.has_permission('roles.manage') AND is_system = FALSE);

DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    public.has_permission('roles.manage')
    OR public.has_permission('users.manage')
    OR role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS role_permissions_insert ON public.role_permissions;
CREATE POLICY role_permissions_insert ON public.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('roles.manage')
    AND EXISTS (
      SELECT 1 FROM public.roles
      WHERE id = role_id
        AND is_system_owner = FALSE
    )
  );

DROP POLICY IF EXISTS role_permissions_delete ON public.role_permissions;
CREATE POLICY role_permissions_delete ON public.role_permissions
  FOR DELETE TO authenticated
  USING (
    public.has_permission('roles.manage')
    AND EXISTS (
      SELECT 1 FROM public.roles
      WHERE id = role_id
        AND is_system_owner = FALSE
    )
  );

-- Tighten business-table policies to permission keys
DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations
  FOR SELECT TO authenticated USING (public.has_permission('locations.view'));
DROP POLICY IF EXISTS locations_insert ON public.locations;
CREATE POLICY locations_insert ON public.locations
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('locations.create'));
DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations
  FOR UPDATE TO authenticated
  USING (public.has_permission('locations.update'))
  WITH CHECK (public.has_permission('locations.update'));
DROP POLICY IF EXISTS locations_delete ON public.locations;
CREATE POLICY locations_delete ON public.locations
  FOR DELETE TO authenticated USING (public.has_permission('locations.delete'));

DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select ON public.tenants
  FOR SELECT TO authenticated USING (public.has_permission('tenants.view'));
DROP POLICY IF EXISTS tenants_insert ON public.tenants;
CREATE POLICY tenants_insert ON public.tenants
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('tenants.create'));
DROP POLICY IF EXISTS tenants_update ON public.tenants;
CREATE POLICY tenants_update ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_permission('tenants.update'))
  WITH CHECK (public.has_permission('tenants.update'));
DROP POLICY IF EXISTS tenants_delete ON public.tenants;
CREATE POLICY tenants_delete ON public.tenants
  FOR DELETE TO authenticated USING (public.has_permission('tenants.delete'));

DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units
  FOR SELECT TO authenticated USING (public.has_permission('units.view'));
DROP POLICY IF EXISTS units_insert ON public.units;
CREATE POLICY units_insert ON public.units
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('units.create'));
DROP POLICY IF EXISTS units_update ON public.units;
CREATE POLICY units_update ON public.units
  FOR UPDATE TO authenticated
  USING (public.has_permission('units.update'))
  WITH CHECK (public.has_permission('units.update'));
DROP POLICY IF EXISTS units_delete ON public.units;
CREATE POLICY units_delete ON public.units
  FOR DELETE TO authenticated USING (public.has_permission('units.delete'));

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT TO authenticated USING (public.has_permission('contracts.view'));
DROP POLICY IF EXISTS contracts_insert ON public.contracts;
CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('contracts.create'));
DROP POLICY IF EXISTS contracts_update ON public.contracts;
CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE TO authenticated
  USING (public.has_permission('contracts.update'))
  WITH CHECK (public.has_permission('contracts.update'));
DROP POLICY IF EXISTS contracts_delete ON public.contracts;
CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE TO authenticated USING (public.has_permission('contracts.delete'));

DROP POLICY IF EXISTS contract_lines_select ON public.contract_lines;
CREATE POLICY contract_lines_select ON public.contract_lines
  FOR SELECT TO authenticated USING (public.has_permission('contracts.view'));
DROP POLICY IF EXISTS contract_lines_insert ON public.contract_lines;
CREATE POLICY contract_lines_insert ON public.contract_lines
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('contracts.create') OR public.has_permission('contracts.update'));
DROP POLICY IF EXISTS contract_lines_update ON public.contract_lines;
CREATE POLICY contract_lines_update ON public.contract_lines
  FOR UPDATE TO authenticated
  USING (public.has_permission('contracts.update'))
  WITH CHECK (public.has_permission('contracts.update'));
DROP POLICY IF EXISTS contract_lines_delete ON public.contract_lines;
CREATE POLICY contract_lines_delete ON public.contract_lines
  FOR DELETE TO authenticated USING (public.has_permission('contracts.update') OR public.has_permission('contracts.delete'));

DROP POLICY IF EXISTS contract_attachments_select ON public.contract_attachments;
CREATE POLICY contract_attachments_select ON public.contract_attachments
  FOR SELECT TO authenticated USING (public.has_permission('contracts.view'));
DROP POLICY IF EXISTS contract_attachments_insert ON public.contract_attachments;
CREATE POLICY contract_attachments_insert ON public.contract_attachments
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('contracts.update'));
DROP POLICY IF EXISTS contract_attachments_delete ON public.contract_attachments;
CREATE POLICY contract_attachments_delete ON public.contract_attachments
  FOR DELETE TO authenticated USING (public.has_permission('contracts.update') OR public.has_permission('contracts.delete'));

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (public.has_permission('invoices.view'));
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('invoices.create'));
DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.has_permission('invoices.update') OR public.has_permission('payments.record'))
  WITH CHECK (public.has_permission('invoices.update') OR public.has_permission('payments.record'));
DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE TO authenticated USING (public.has_permission('invoices.delete'));

DROP POLICY IF EXISTS invoice_lines_select ON public.invoice_lines;
CREATE POLICY invoice_lines_select ON public.invoice_lines
  FOR SELECT TO authenticated USING (public.has_permission('invoices.view'));
DROP POLICY IF EXISTS invoice_lines_insert ON public.invoice_lines;
CREATE POLICY invoice_lines_insert ON public.invoice_lines
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('invoices.create') OR public.has_permission('invoices.update'));
DROP POLICY IF EXISTS invoice_lines_update ON public.invoice_lines;
CREATE POLICY invoice_lines_update ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (public.has_permission('invoices.update'))
  WITH CHECK (public.has_permission('invoices.update'));
DROP POLICY IF EXISTS invoice_lines_delete ON public.invoice_lines;
CREATE POLICY invoice_lines_delete ON public.invoice_lines
  FOR DELETE TO authenticated USING (public.has_permission('invoices.update') OR public.has_permission('invoices.delete'));

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (public.has_permission('payments.view'));

DROP POLICY IF EXISTS import_logs_select ON public.import_logs;
CREATE POLICY import_logs_select ON public.import_logs
  FOR SELECT TO authenticated USING (public.has_permission('imports.manage'));
DROP POLICY IF EXISTS import_logs_insert ON public.import_logs;
CREATE POLICY import_logs_insert ON public.import_logs
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('imports.manage'));

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_permission('audit.view') OR public.has_permission('roles.manage') OR public.has_permission('users.manage'));
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('roles.manage')
    OR public.has_permission('users.manage')
    OR public.has_permission('settings.manage')
    OR public.has_permission('feature_flags.manage')
    OR public.has_permission('imports.manage')
    OR public.has_permission('odoo.manage')
    OR public.has_permission('locations.create')
    OR public.has_permission('locations.update')
    OR public.has_permission('locations.delete')
    OR public.has_permission('units.create')
    OR public.has_permission('units.update')
    OR public.has_permission('units.delete')
    OR public.has_permission('contracts.create')
    OR public.has_permission('contracts.update')
    OR public.has_permission('contracts.delete')
    OR public.has_permission('invoices.create')
    OR public.has_permission('invoices.update')
    OR public.has_permission('invoices.delete')
    OR public.has_permission('payments.record')
  );

DROP POLICY IF EXISTS settings_select ON public.settings;
CREATE POLICY settings_select ON public.settings
  FOR SELECT TO authenticated
  USING (
    public.has_permission('settings.manage')
    OR public.has_permission('feature_flags.manage')
    OR public.has_permission('odoo.manage')
    OR key LIKE 'feature_flag.%'
  );
DROP POLICY IF EXISTS settings_insert ON public.settings;
CREATE POLICY settings_insert ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('settings.manage')
    OR public.has_permission('feature_flags.manage')
    OR public.has_permission('odoo.manage')
  );
DROP POLICY IF EXISTS settings_update ON public.settings;
CREATE POLICY settings_update ON public.settings
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('settings.manage')
    OR public.has_permission('feature_flags.manage')
    OR public.has_permission('odoo.manage')
  )
  WITH CHECK (
    public.has_permission('settings.manage')
    OR public.has_permission('feature_flags.manage')
    OR public.has_permission('odoo.manage')
  );
DROP POLICY IF EXISTS settings_delete ON public.settings;
CREATE POLICY settings_delete ON public.settings
  FOR DELETE TO authenticated USING (public.has_permission('settings.manage'));

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_permission('users.manage'));
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));
DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('users.manage'));

-- Odoo admin tables
DROP POLICY IF EXISTS odoo_sync_logs_admin ON public.odoo_sync_logs;
CREATE POLICY odoo_sync_logs_admin ON public.odoo_sync_logs
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage'))
  WITH CHECK (public.has_permission('odoo.manage'));

DROP POLICY IF EXISTS odoo_import_runs_admin ON public.odoo_import_runs;
CREATE POLICY odoo_import_runs_admin ON public.odoo_import_runs
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'))
  WITH CHECK (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'));

DROP POLICY IF EXISTS odoo_import_items_admin ON public.odoo_import_items;
CREATE POLICY odoo_import_items_admin ON public.odoo_import_items
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'))
  WITH CHECK (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'));

DROP POLICY IF EXISTS odoo_documents_admin ON public.odoo_invoice_documents;
CREATE POLICY odoo_documents_admin ON public.odoo_invoice_documents
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage') OR public.has_permission('imports.manage') OR public.has_permission('invoices.view'))
  WITH CHECK (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'));

DROP POLICY IF EXISTS odoo_lines_admin ON public.odoo_invoice_lines;
CREATE POLICY odoo_lines_admin ON public.odoo_invoice_lines
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage') OR public.has_permission('imports.manage') OR public.has_permission('invoices.view'))
  WITH CHECK (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'));

DROP POLICY IF EXISTS odoo_payments_admin ON public.odoo_invoice_payments;
CREATE POLICY odoo_payments_admin ON public.odoo_invoice_payments
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage') OR public.has_permission('imports.manage') OR public.has_permission('payments.view'))
  WITH CHECK (public.has_permission('odoo.manage') OR public.has_permission('imports.manage'));

DROP POLICY IF EXISTS odoo_outbox_admin ON public.odoo_outbox;
CREATE POLICY odoo_outbox_admin ON public.odoo_outbox
  FOR ALL TO authenticated
  USING (public.has_permission('odoo.manage'))
  WITH CHECK (public.has_permission('odoo.manage'));

-- Storage: contract documents
DROP POLICY IF EXISTS contract_documents_select ON storage.objects;
CREATE POLICY contract_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contract-documents' AND public.has_permission('contracts.view'));
DROP POLICY IF EXISTS contract_documents_insert ON storage.objects;
CREATE POLICY contract_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-documents' AND public.has_permission('contracts.update'));
DROP POLICY IF EXISTS contract_documents_delete ON storage.objects;
CREATE POLICY contract_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contract-documents' AND (public.has_permission('contracts.update') OR public.has_permission('contracts.delete')));

-- Update RPC guards for permission-aware mutations
CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method payment_method,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT auth.uid()
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_new_paid_amount NUMERIC(12,2);
  v_new_status invoice_status;
BEGIN
  IF NOT public.has_permission('payments.record') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22003';
  END IF;

  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.status = 'fully_paid' THEN
    RAISE EXCEPTION 'FULLY_PAID' USING ERRCODE = 'P0001';
  END IF;

  v_new_paid_amount := v_invoice.paid_amount + p_amount;

  IF v_new_paid_amount > v_invoice.amount THEN
    RAISE EXCEPTION 'EXCEEDS_BALANCE' USING ERRCODE = 'P0001';
  END IF;

  IF v_new_paid_amount = v_invoice.amount THEN
    v_new_status := 'fully_paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  INSERT INTO payments (
    invoice_id,
    amount,
    payment_date,
    payment_method,
    reference_number,
    notes,
    created_by
  )
  VALUES (
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_reference_number,
    p_notes,
    auth.uid()
  )
  RETURNING * INTO v_payment;

  PERFORM set_config('app.record_payment_atomic', 'on', true);

  UPDATE invoices
  SET
    paid_amount = v_new_paid_amount,
    status = v_new_status
  WHERE id = p_invoice_id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(UUID, NUMERIC, DATE, payment_method, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_due_invoice_atomic(
  p_invoice_id UUID,
  p_invoice_number TEXT
)
RETURNS invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
BEGIN
  IF NOT public.has_permission('invoices.update') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_invoice_number IS NULL OR btrim(p_invoice_number) = '' THEN
    RAISE EXCEPTION 'INVOICE_NUMBER_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.status <> 'due' THEN
    RAISE EXCEPTION 'INVALID_INVOICE_STATUS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invoices
    WHERE invoice_number = btrim(p_invoice_number)
      AND id <> p_invoice_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_NUMBER' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.issue_due_invoice_atomic', 'on', true);

  UPDATE invoices
  SET
    invoice_number = btrim(p_invoice_number),
    status = 'invoice_issued',
    issued_at = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_due_invoice_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_due_invoice_atomic(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_due_invoice_atomic(UUID, TEXT) TO authenticated;

-- Contract/Odoo SECURITY DEFINER RPCs keep service_role bypass and switch
-- the human path from is_admin_editor() to the matching permission key.
CREATE OR REPLACE FUNCTION public.assert_permission_or_service(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF public.has_permission(p_key) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_permission_or_service(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_permission_or_service(TEXT) TO postgres;
-- Keep callable only from other SECURITY DEFINER functions / service role, not PostgREST clients.

-- Patch remaining SECURITY DEFINER RPC guards without rewriting full bodies.
DO $$
DECLARE
  r RECORD;
  def TEXT;
  next_def TEXT;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      CASE p.proname
        WHEN 'replace_contract_lines' THEN 'contracts.update'
        WHEN 'create_contract_with_schedule_atomic' THEN 'contracts.create'
        WHEN 'map_odoo_contract_group_atomic' THEN 'odoo.manage'
        WHEN 'upsert_odoo_invoice_document_atomic' THEN 'odoo.manage'
        WHEN 'sync_local_invoice_from_odoo' THEN 'odoo.manage'
        WHEN 'sync_local_invoice_from_odoo_atomic' THEN 'odoo.manage'
        ELSE NULL
      END AS permission_key
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'replace_contract_lines',
        'create_contract_with_schedule_atomic',
        'map_odoo_contract_group_atomic',
        'upsert_odoo_invoice_document_atomic',
        'sync_local_invoice_from_odoo',
        'sync_local_invoice_from_odoo_atomic'
      )
  LOOP
    IF r.permission_key IS NULL THEN
      CONTINUE;
    END IF;

    def := pg_get_functiondef(r.oid);
    next_def := replace(
      def,
      'auth.role() <> ''service_role'' AND NOT is_admin_editor()',
      format('auth.role() <> ''service_role'' AND NOT public.has_permission(%L)', r.permission_key)
    );
    next_def := replace(
      next_def,
      'NOT is_admin_editor()',
      format('auth.role() <> ''service_role'' AND NOT public.has_permission(%L)', r.permission_key)
    );

    IF next_def IS DISTINCT FROM def THEN
      EXECUTE next_def;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.has_permission(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_editor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_editor() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_editor() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_profile_legacy_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_last_system_owner_demotion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_delete_protected_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_mutate_system_owner_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_strip_system_owner_permissions() FROM PUBLIC, anon, authenticated;

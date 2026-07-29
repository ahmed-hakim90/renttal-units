-- Keep the system-owner account out of staff administration reads. The owner can
-- still read its own profile so authentication and session loading continue to work.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      public.has_permission('users.manage')
      AND NOT EXISTS (
        SELECT 1
        FROM public.roles role_row
        WHERE role_row.id = profiles.role_id
          AND role_row.is_system_owner = TRUE
      )
    )
  );

-- Defense in depth: managers cannot mutate the protected owner profile even if
-- they call the Data API directly. System owners retain emergency administration.
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('users.manage')
    AND (
      public.is_admin_editor()
      OR NOT EXISTS (
        SELECT 1
        FROM public.roles role_row
        WHERE role_row.id = profiles.role_id
          AND role_row.is_system_owner = TRUE
      )
    )
  )
  WITH CHECK (
    public.has_permission('users.manage')
    AND (
      public.is_admin_editor()
      OR NOT EXISTS (
        SELECT 1
        FROM public.roles role_row
        WHERE role_row.id = profiles.role_id
          AND role_row.is_system_owner = TRUE
      )
    )
  );

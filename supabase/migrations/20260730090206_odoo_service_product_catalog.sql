-- Cache the configured Odoo service category for fast contract editing.
CREATE TABLE public.odoo_service_products (
  odoo_product_id BIGINT PRIMARY KEY CHECK (odoo_product_id > 0),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  default_code TEXT,
  description TEXT,
  category_id BIGINT NOT NULL CHECK (category_id > 0),
  category_name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_odoo_service_products_active_name
  ON public.odoo_service_products (display_name, odoo_product_id)
  WHERE active = TRUE;

CREATE INDEX idx_odoo_service_products_category
  ON public.odoo_service_products (category_id);

CREATE TRIGGER odoo_service_products_updated_at
  BEFORE UPDATE ON public.odoo_service_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.odoo_service_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY odoo_service_products_select
  ON public.odoo_service_products
  FOR SELECT TO authenticated
  USING (
    public.has_permission('contracts.view')
    OR public.has_permission('contracts.create')
    OR public.has_permission('contracts.update')
    OR public.has_permission('units.view')
    OR public.has_permission('odoo.manage')
  );

CREATE POLICY odoo_service_products_insert
  ON public.odoo_service_products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('odoo.manage'));

CREATE POLICY odoo_service_products_update
  ON public.odoo_service_products
  FOR UPDATE TO authenticated
  USING (public.has_permission('odoo.manage'))
  WITH CHECK (public.has_permission('odoo.manage'));

CREATE OR REPLACE FUNCTION public.sync_odoo_service_product_catalog(
  p_category_id BIGINT,
  p_products JSONB,
  p_synced_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product_count INTEGER;
BEGIN
  IF NOT public.has_permission('odoo.manage') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_category_id IS NULL OR p_category_id <= 0 THEN
    RAISE EXCEPTION 'invalid_service_category' USING ERRCODE = '22023';
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'invalid_service_products' USING ERRCODE = '22023';
  END IF;

  v_product_count := jsonb_array_length(p_products);
  IF v_product_count > 5000 THEN
    RAISE EXCEPTION 'service_product_limit_exceeded' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('odoo_service_product_catalog_sync'));

  UPDATE public.odoo_service_products
  SET active = FALSE, last_synced_at = p_synced_at
  WHERE active = TRUE;

  INSERT INTO public.odoo_service_products (
    odoo_product_id,
    name,
    display_name,
    default_code,
    description,
    category_id,
    category_name,
    active,
    last_synced_at
  )
  SELECT
    product.id,
    btrim(product.name),
    btrim(COALESCE(NULLIF(product.display_name, ''), product.name)),
    NULLIF(btrim(product.default_code), ''),
    NULLIF(btrim(product.description), ''),
    p_category_id,
    NULLIF(btrim(product.category_name), ''),
    TRUE,
    p_synced_at
  FROM jsonb_to_recordset(p_products) AS product(
    id BIGINT,
    name TEXT,
    display_name TEXT,
    default_code TEXT,
    description TEXT,
    category_name TEXT
  )
  WHERE product.id > 0
    AND length(btrim(product.name)) > 0
  ON CONFLICT (odoo_product_id) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    default_code = EXCLUDED.default_code,
    description = EXCLUDED.description,
    category_id = EXCLUDED.category_id,
    category_name = EXCLUDED.category_name,
    active = TRUE,
    last_synced_at = EXCLUDED.last_synced_at;

  RETURN v_product_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_odoo_service_product_catalog(BIGINT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_odoo_service_product_catalog(BIGINT, JSONB, TIMESTAMPTZ) TO authenticated;

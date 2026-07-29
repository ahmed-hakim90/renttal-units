-- Supports the global audit timeline and bounded entity activity views.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_timeline
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

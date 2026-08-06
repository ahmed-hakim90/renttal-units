-- Allow renaming/moving contract PDFs within the private bucket when
-- relinking an attachment to another contract (storage.move uses UPDATE).

DROP POLICY IF EXISTS contract_documents_update ON storage.objects;
CREATE POLICY contract_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND (
      public.has_permission('contracts.update')
      OR public.has_permission('contracts.delete')
    )
    AND EXISTS (
      SELECT 1
      FROM public.contract_attachments ca
      WHERE ca.storage_path = name
    )
  )
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND public.has_permission('contracts.update')
    AND (storage.foldername(name))[1] = 'contracts'
    AND EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.id::text = (storage.foldername(name))[2]
    )
  );

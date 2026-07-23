-- ============================================================
-- CasaZero — riconciliazione bucket↔tabella per `documents` (B1)
-- Script di sola lettura, lanciabile a mano nel SQL Editor. Nessun
-- cron: decisione FASE 0 B1 (opzione B) — gli orfani da upload
-- client-direct mai confermato sono rari e innocui (nessuna riga
-- documents li rende visibili da nessuna parte), non giustificano un
-- nuovo invariante/riga "pending" in tabella — stessa famiglia della
-- bug class activation_status che si voleva evitare di ripetere.
-- ------------------------------------------------------------
-- Quando lanciarlo: a mano, quando serve — es. dopo un batch di
-- upload dalla dashboard con errori di conferma, o periodicamente se
-- si sospettano orfani accumulati (client chiuso a metà upload, rete
-- caduta tra uploadToSignedUrl e confirmDocument).
-- ============================================================

-- 1. Oggetti nel bucket `documents` senza riga corrispondente in
--    public.documents (storage_path): upload riuscito ma mai
--    confermato dal client, o riga cancellata senza rimuovere
--    l'oggetto.
SELECT o.name AS storage_path, o.created_at, o.metadata->>'size' AS size_bytes
FROM storage.objects o
WHERE o.bucket_id = 'documents'
  AND NOT EXISTS (
    SELECT 1 FROM public.documents d WHERE d.storage_path = o.name
  )
ORDER BY o.created_at DESC;

-- 2. Righe in public.documents il cui storage_path non ha un oggetto
--    corrispondente nel bucket. Non dovrebbe mai succedere —
--    confirmDocument verifica l'esistenza dell'oggetto prima di
--    scrivere la riga (src/app/(dashboard)/admin/residences/[id]/
--    documenti/actions.ts) — utile solo come controllo di integrità,
--    non un caso atteso del flusso client-direct.
SELECT d.id, d.storage_path, d.title, d.residence_id, d.created_at
FROM public.documents d
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id = 'documents' AND o.name = d.storage_path
)
ORDER BY d.created_at DESC;

-- ------------------------------------------------------------
-- Pulizia — SOLO dopo aver rivisto a mano l'elenco del punto 1.
-- storage.objects ha il trigger di sistema storage.protect_delete()
-- (vedi footer 023_storage_attachments_scoped_rls.sql): un DELETE SQL
-- diretto su storage.objects non funziona indipendentemente da RLS.
-- Rimuovere gli orfani confermati dalla dashboard Storage di Supabase,
-- oppure con supabase.storage.from('documents').remove([...path]) da
-- un contesto con service role — mai da qui.
-- ------------------------------------------------------------

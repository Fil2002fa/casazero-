-- ============================================================
-- CasaZero — 048: correzioni manuali dei campi estratti (document_field_overrides)
-- Applicata da Claude Code via Supabase MCP (R10, approvata da Filippo il
-- 01/11/2026). Statement singoli idempotenti, nessun BEGIN/COMMIT:
-- rieseguibile senza effetti collaterali.
-- ------------------------------------------------------------
-- PERCHÉ (FASE 0 R10, 01/11/2026): l'AI può sbagliare o non trovare un
-- campo e l'utente deve poterlo correggere o inserire. Le correzioni non
-- possono stare nei due verbali AI:
--   - documents.extracted_metadata è il verbale della classificazione
--     (installatore e P.IVA della DiCo): la route classify-document lo
--     riscrive a ogni nuova classificazione;
--   - document_extractions è riestraibile per costruzione: la route
--     extract-document fa upsert su document_id a ogni riclassificazione.
-- Una correzione scritta lì verrebbe cancellata dalla chiamata AI successiva.
--
-- PERCHÉ UNA TABELLA PER CAMPO E NON UNA COLONNA JSONB SU documents:
-- chi e quando per ogni singolo campo (set_by, set_at), che servono
-- all'etichetta "Modificato a mano"; e il perimetro RLS resta separato
-- da documents, che ha una policy FOR ALL con UPDATE dal client.
--
-- STATO CORRENTE, NON STORICO: una riga = la correzione in vigore per quel
-- campo. "Ripristina valore AI" è una DELETE. Lo storico delle modifiche
-- va in activity_events (commit successivo, migrazione 049), come per
-- admin_assignments. Questa tabella non è il fascicolo: completions non
-- è toccata.
--
-- for_doc_type: la correzione vale solo per il doc_type per cui è stata
-- fatta, con la stessa regola di attualità di document_extractions
-- (extractionIsCurrent). Se un umano riclassifica, la riga resta ma non
-- si applica; torna attiva se si torna al tipo precedente. È nella chiave
-- perché la stessa chiave esiste in più tipi (durata_anni: garanzia e
-- polizza_decennale).
--
-- field_key: nessun CHECK qui. Le chiavi ammesse per doc_type vivono in
-- un'unica fonte TS (src/lib/document-overrides.ts, sopra FIELD_KEYS di
-- document-extraction.ts), stessa scelta della 024 per doc_type e della
-- 040 per fields. valid_until NON è una chiave correggibile: si ricalcola
-- con computeValidUntil sui campi uniti.
--
-- value: testo, normalizzato e validato in TS prima della scrittura
-- (date ISO, interi, P.IVA a sole cifre). NULL = l'utente dichiara che
-- il documento non riporta il campo (sovrascrive un valore AI sbagliato).
--
-- RLS: SELECT delegata a documents con EXISTS, stesso perimetro della 040
-- (residente sulla propria unità/residenza, admin assegnato, super_admin
-- del builder): la PWA residente mostra i valori corretti. Nessuna policy
-- di scrittura: scrive SOLO il service role dalla server action, che
-- verifica ruolo (admin, super_admin) e perimetro. Riferimento alla
-- colonna qualificato (document_field_overrides.document_id), bug class
-- registrata in CLAUDE.md sulle policy con subquery.
--
-- Grants: REVOKE espliciti come 031/032/040 (i default privileges di
-- Supabase darebbero ALL ad anon/authenticated).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_field_overrides (
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  for_doc_type TEXT NOT NULL,
  field_key    TEXT NOT NULL,
  value        TEXT,
  set_by       UUID NOT NULL REFERENCES public.profiles(id),
  set_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, for_doc_type, field_key)
);

ALTER TABLE public.document_field_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_field_overrides: lettura se si legge il documento"
  ON public.document_field_overrides;
CREATE POLICY "document_field_overrides: lettura se si legge il documento"
  ON public.document_field_overrides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_field_overrides.document_id
  ));
-- Nessuna policy INSERT/UPDATE/DELETE: scrive solo il service role.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.document_field_overrides FROM authenticated;
REVOKE ALL ON public.document_field_overrides FROM anon;
GRANT SELECT ON public.document_field_overrides TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICHE (sola lettura, eseguite una per una dopo l'applicazione)
-- ------------------------------------------------------------

-- V1: le 6 colonne con i tipi attesi
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'document_field_overrides'
 ORDER BY ordinal_position;

-- V2: vincoli (PK a 3 colonne, FK documents CASCADE, FK profiles)
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.document_field_overrides'::regclass
 ORDER BY conname;

-- V3: RLS attiva e una sola policy, SELECT
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_field_overrides'::regclass;
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'document_field_overrides';

-- V4: grants — attesi: authenticated SELECT soltanto; anon nessuna riga
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'document_field_overrides'
   AND grantee IN ('anon', 'authenticated')
 ORDER BY grantee, privilege_type;

-- V5: tabella vuota (nessun backfill: le correzioni nascono dalla UI)
SELECT count(*) AS righe FROM public.document_field_overrides;

-- ------------------------------------------------------------
-- ESITO REALE (applicata il 02/11/2026 via Supabase MCP)
-- ------------------------------------------------------------
-- V1: PASS. document_id uuid NOT NULL, for_doc_type text NOT NULL,
--     field_key text NOT NULL, value text NULL, set_by uuid NOT NULL,
--     set_at timestamptz NOT NULL DEFAULT now().
-- V2: PASS. document_field_overrides_pkey PRIMARY KEY (document_id,
--     for_doc_type, field_key); document_id_fkey REFERENCES documents(id)
--     ON DELETE CASCADE; set_by_fkey REFERENCES profiles(id).
-- V3: PASS. relrowsecurity = true; una sola policy, cmd SELECT, qual
--     EXISTS (SELECT 1 FROM documents d WHERE d.id =
--     document_field_overrides.document_id).
-- V4: PASS. authenticated: SELECT soltanto; anon: nessuna riga.
-- V5: PASS. 0 righe.
-- ============================================================

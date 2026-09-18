-- ============================================================
-- CasaZero — 040: dati estratti dai documenti (document_extractions)
-- Applica Filippo nel SQL Editor; subito dopo esegue le query di verifica
-- in fondo e incolla l'output reale nel footer (convenzione 024-028).
-- Statement singoli idempotenti, nessun BEGIN/COMMIT (il SQL Editor non
-- gira in transazione): rieseguibile senza effetti collaterali.
-- ------------------------------------------------------------
-- PERCHÉ UNA TABELLA SEPARATA E NON COLONNE SU documents (FASE 0 18/09):
-- l'estrazione è una SECONDA chiamata AI, distinta dalla classificazione
-- (route classify-document, schema a 7 campi lasciato byte-identico).
-- Ha un ciclo di vita diverso: è legata al doc_type finale del documento
-- (for_doc_type) e va riestratta se un umano riclassifica; è riestraibile
-- a piacere; non è un verbale write-once. extracted_metadata su documents
-- NON è un contenitore adatto: è il verbale della classificazione e due
-- rami della route lo sovrascrivono già con un oggetto a chiave singola
-- (skipped_reason, nota). Colonne nuove su documents avrebbero toccato le
-- 5 superfici che la leggono; questa tabella non ne tocca nessuna.
--
-- Relazione 1:1: document_id è PK e FK insieme (PostgREST la riconosce come
-- embed a oggetto singolo, non array — vedi src/lib/postgrest-embed.ts).
-- ON DELETE CASCADE: senza documento non esiste estrazione.
--
-- Colonne tipizzate SOLO per ciò che si ordina o filtra in pagina
-- (document_date, valid_until, ambito); i campi specifici per doc_type
-- (garanzia, ape, polizza_decennale) vivono in fields JSONB e si mostrano
-- soltanto. Il set di chiavi ammesse in fields e il calcolo di valid_until
-- vivono in un'unica fonte TS (src/lib/document-extraction.ts), non in un
-- CHECK qui — stessa scelta della 024 per doc_type.
--
-- valid_until è CALCOLATA in TS, mai chiesta all'AI: garanzia = inizio +
-- durata_anni, ape = valida_fino_al, polizza = scadenza, altrimenti NULL.
-- Non è una generated column per non legare la regola di dominio a SQL
-- immutabile: l'helper TS è verificabile con scripts/verify-extraction.mjs.
--
-- ambito è informativo. NON alimenta mai documents.unit_id: quella colonna
-- decide chi VEDE il documento (czero_can_access_unit) e resta una scelta
-- umana all'upload. unita_riferimento è testo di supporto, non una FK.
--
-- status: 'completata' (dati scritti, anche tutti NULL se il PDF non li
-- contiene), 'saltata' (non PDF: stessa regola magic bytes della
-- classificazione), 'fallita' (errore sul documento). Nessuna parola
-- "fallita" arriva mai in UI (invariante #20). Un documento SENZA riga
-- qui, o con for_doc_type diverso dal suo doc_type corrente, è "da
-- estrarre": lo decide l'helper extractionIsCurrent, non una query.
--
-- RLS: SELECT delegata a documents con EXISTS — le policy di documents si
-- applicano anche dentro la subquery, quindi il perimetro è lo stesso
-- (residente sulla propria unità/residenza, admin assegnato, super_admin
-- del builder). Nessuna policy di scrittura: scrive SOLO il service role
-- dalla route API, come per la classificazione. Il riferimento alla
-- colonna è qualificato (document_extractions.document_id) per la bug
-- class registrata in CLAUDE.md sulle policy con subquery.
--
-- Grants: le REVOKE esplicite replicano la 031/032 per la tabella nuova
-- (i default privileges di Supabase darebbero ALL ad anon/authenticated).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_extractions (
  document_id       UUID PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  for_doc_type      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'completata'
                    CHECK (status IN ('completata', 'saltata', 'fallita')),
  document_date     DATE,
  ambito            TEXT CHECK (ambito IS NULL OR ambito IN ('residenza', 'parti_comuni', 'unita')),
  unita_riferimento TEXT,
  valid_until       DATE,
  fields            JSONB NOT NULL DEFAULT '{}'::jsonb,
  model             TEXT,
  extracted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_extractions_valid_until
  ON public.document_extractions(valid_until);

-- updated_at: riusa il trigger generico set_updated_at() (001_schema.sql),
-- stesso pattern di profiles, maintenance_items, residence_checklist_exception.
DROP TRIGGER IF EXISTS document_extractions_updated_at ON public.document_extractions;
CREATE TRIGGER document_extractions_updated_at
  BEFORE UPDATE ON public.document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_extractions: lettura se si legge il documento"
  ON public.document_extractions;
CREATE POLICY "document_extractions: lettura se si legge il documento"
  ON public.document_extractions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_extractions.document_id
  ));
-- Nessuna policy INSERT/UPDATE/DELETE: scrive solo il service role.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.document_extractions FROM authenticated;
REVOKE ALL ON public.document_extractions FROM anon;
GRANT SELECT ON public.document_extractions TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICHE (eseguire una per una, incollare l'output nel footer)
-- ------------------------------------------------------------

-- V1: le 11 colonne con i tipi attesi
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'document_extractions'
 ORDER BY ordinal_position;

-- V2: vincoli (PK, FK, 2 CHECK)
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.document_extractions'::regclass
 ORDER BY conname;

-- V3: RLS attiva e una sola policy, SELECT
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_extractions'::regclass;
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'document_extractions';

-- V4: grants — attesi: authenticated SELECT soltanto; anon nessuna riga
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'document_extractions'
   AND grantee IN ('anon', 'authenticated')
 ORDER BY grantee, privilege_type;

-- V5: trigger agganciato
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.document_extractions'::regclass AND NOT tgisinternal;

-- V6: tabella vuota (nessun backfill previsto: l'estrazione parte dalla UI)
SELECT count(*) AS righe FROM public.document_extractions;

-- ------------------------------------------------------------
-- ESITO REALE (da compilare dopo l'applicazione)
-- ------------------------------------------------------------
-- V1:
-- V2:
-- V3:
-- V4:
-- V5:
-- V6:

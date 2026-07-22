-- ============================================================
-- CasaZero — 026: colonna `sistema` su `documents` (B4, commit 2)
-- Applica Filippo nel SQL Editor; subito dopo esegue le query di
-- verifica in fondo e incolla l'output reale nel footer (convenzione
-- 024/025: la prova che la colonna esiste è l'output, mai il commento).
-- ------------------------------------------------------------
-- OPZIONE B della diagnosi B4: `sistema` diventa la VERITÀ CONFERMATA
-- dell'impianto a cui il documento si riferisce, colonna dedicata e
-- normalizzata su cui il match di B4 farà la sottrazione fra insiemi.
-- È SEPARATA da extracted_metadata->>'sistema', che resta il verbale
-- immutabile della proposta AI: dopo una correzione umana la colonna
-- e il verbale possono divergere, ed è corretto che divergano (il
-- verbale non va mai riallineato).
--
-- TEXT NULLABLE, SENZA CHECK — stesso pattern di doc_type (024): il
-- vocabolario dei valori ammessi (SISTEMI) vive in un'unica costante TS
-- (src/lib/document-classification.ts), non in un CHECK Postgres, così
-- l'evoluzione della tassonomia impianti non richiede ALTER TABLE.
-- NULL = "nessun impianto specifico" (default per ape/agibilita/
-- capitolato, e scelta esplicita dell'umano in revisione).
--
-- GRANT: i privilegi su `documents` sono a LIVELLO DI TABELLA
-- (role_table_grants popolato per anon/authenticated/service_role/
-- postgres), non per-colonna: una colonna nuova eredita
-- automaticamente SELECT/INSERT/UPDATE. NESSUN GRANT esplicito
-- necessario qui (verificato prima dell'apply). Diverso da profiles
-- (018), che aveva grant per-colonna.
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sistema TEXT;

-- Backfill dal verbale AI dove un sistema è già stato proposto. Oggi
-- 0 righe (l'asse è stato introdotto ma mai popolato su documenti
-- reali), ma la migrazione deve restare corretta anche a dati futuri:
-- ->>'sistema' rende NULL sia la chiave assente sia il JSON null, quindi
-- il filtro IS NOT NULL copre entrambi i casi.
UPDATE documents
  SET sistema = extracted_metadata->>'sistema'
  WHERE extracted_metadata->>'sistema' IS NOT NULL
    AND sistema IS NULL;

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo, incollare l'output come
-- footer ESITO REALE).
-- ============================================================
-- 1. La colonna esiste con tipo/default/nullability attesi:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'documents'
--   AND column_name = 'sistema';
--
-- 2. Il backfill ha allineato la colonna al verbale dove presente
--    (oggi atteso: entrambi 0):
-- SELECT count(*) FILTER (WHERE sistema IS NOT NULL) AS con_sistema_colonna,
--        count(*) FILTER (WHERE extracted_metadata->>'sistema' IS NOT NULL) AS con_sistema_verbale
-- FROM documents;
--
-- 3. Nessun GRANT per-colonna introdotto: la nuova colonna compare con
--    gli stessi privilegi di tabella delle altre (authenticated ha
--    SELECT/INSERT/UPDATE):
-- SELECT grantee, privilege_type FROM information_schema.column_privileges
-- WHERE table_schema='public' AND table_name='documents'
--   AND column_name='sistema' ORDER BY grantee, privilege_type;
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo, verificata via query read-only) ──
--
-- 1. Colonna presente col tipo/nullability attesi:
--    sistema | text | is_nullable=YES | default=null
--
-- 2. Backfill coerente (oggi 0, l'asse non è ancora popolato su dati reali):
--    con_sistema_colonna=0, con_sistema_verbale=0
--
-- 3. Nessun GRANT per-colonna: la colonna eredita i privilegi di tabella —
--    authenticated ha SELECT/INSERT/UPDATE/REFERENCES (idem anon,
--    service_role, postgres). Coerente con le altre colonne di documents.

-- ============================================================
-- CasaZero — 024: colonne classificazione AI su `documents` (B1)
-- Applica Filippo nel SQL Editor; subito dopo, eseguire le query
-- di verifica in fondo e incollarne l'output nel footer (convenzione
-- post-013: la prova che la colonna esiste è l'output, mai il commento).
-- ------------------------------------------------------------
-- Additiva pura: nessun backfill obbligatorio, i default rendono le
-- 7 righe esistenti valide senza toccarle. Nessuna delle 5 superfici
-- che leggono/scrivono `documents` oggi (PWA lista, PWA upload,
-- dashboard lista, dashboard upload, scheda residenza count-only)
-- usa `select('*')`: queste colonne restano invisibili finché non
-- vengono esplicitamente aggiunte a un `.select()`. Nessuna modifica
-- alle policy RLS storage (022/023): il path pattern
-- `${residenceId}/${category}/...` e lo scope-per-residenza non
-- cambiano — la categoria nel path resta quella dell'upload originale,
-- congelata; la fonte di verità per la categoria è SEMPRE la colonna
-- `documents.category`, mai il path storage.
--
-- doc_type è TEXT non enum, deliberatamente: la tassonomia AI evolve
-- più in fretta di quanto un enum Postgres tolleri comodamente, e
-- l'enum `document_category` esistente non si estende (decisione
-- FASE 0 B1). Il set di valori ammessi di doc_type e il mapping
-- doc_type→category vivono in un'unica costante/helper TS in
-- src/lib/ (prossimo commit del piano B1) — non in un CHECK qui,
-- per lo stesso motivo per cui non è un enum.
--
-- classification_status resta un piccolo set di stati interni della
-- pipeline (non tassonomia di dominio): TEXT + CHECK invece di un
-- nuovo enum, per coerenza con la scelta sopra e perché aggiungere
-- uno stato futuro (es. 'in_revisione') non deve richiedere
-- ALTER TYPE.
--
-- reviewed_by/reviewed_at sostituiscono l'idea iniziale di
-- "tracciamento revisione" come versioning documenti (fuori scope
-- Fase B): qui è la revisione umana della classificazione AI —
-- chi e quando ha confermato/corretto doc_type.
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS doc_type TEXT,
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'non_classificato',
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS extracted_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_classification_status_check
    CHECK (classification_status IN ('non_classificato', 'in_corso', 'completata', 'fallita'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_classification_confidence_range
    CHECK (classification_confidence IS NULL
           OR (classification_confidence >= 0 AND classification_confidence <= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo l'apply, incollare
-- l'output qui sotto come footer — vedi convenzione 022/023).
-- ============================================================
-- 1. Le 6 colonne devono esistere con tipo/default/nullability attesi:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'documents'
--   AND column_name IN ('doc_type', 'classification_status',
--     'classification_confidence', 'extracted_metadata',
--     'reviewed_by', 'reviewed_at')
-- ORDER BY column_name;
--
-- 2. Le 7 righe esistenti devono avere tutte classification_status =
--    'non_classificato' e le altre nuove colonne NULL/default, nessun
--    errore, nessun backfill necessario:
-- SELECT classification_status, count(*) FROM documents GROUP BY 1;
-- SELECT count(*) AS righe_totali,
--        count(doc_type) AS con_doc_type,
--        count(reviewed_by) AS con_reviewer
-- FROM documents;
--
-- 3. I due CHECK constraint esistono:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.documents'::regclass
--   AND conname IN ('documents_classification_status_check',
--                    'documents_classification_confidence_range');
--
-- 4. Le 5 superfici esistenti continuano a funzionare invariate
--    (smoke manuale, non richiede codice nuovo): PWA /documenti,
--    dashboard /admin/residences/[id]/documenti, scheda residenza —
--    nessuna delle tre usa select('*'), quindi nessun rendering
--    dovrebbe cambiare.
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo il 20/07/2026) ──
--
-- 1. Le 6 colonne presenti col tipo/default/nullability attesi:
--    classification_confidence | numeric                 | NULL     | null
--    classification_status     | text                    | NOT NULL | 'non_classificato'::text
--    doc_type                  | text                    | NULL     | null
--    extracted_metadata        | jsonb                   | NOT NULL | '{}'::jsonb
--    reviewed_at               | timestamp with time zone| NULL     | null
--    reviewed_by               | uuid                    | NULL     | null
--
-- 2. Le 7 righe esistenti tutte in 'non_classificato', nessun backfill
--    necessario: classification_status='non_classificato' → 7 righe;
--    righe_totali=7, con_doc_type=0, con_reviewer=0 (tutte le nuove
--    colonne nullable/default, nessuna riga toccata).
--
-- 3. Entrambi i CHECK constraint presenti:
--    documents_classification_status_check (4 stati)
--    documents_classification_confidence_range (NULL o 0-1)
--
-- 4. Smoke manuale eseguito da Filippo: PWA /documenti e dashboard
--    /admin/residences/[id]/documenti verificate a occhio, rendering
--    invariato, nessuna delle 5 superfici esistenti rotta dalle
--    colonne additive.
-- ============================================================

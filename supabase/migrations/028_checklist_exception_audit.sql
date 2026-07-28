-- ============================================================
-- CasaZero — 028: audit trail eccezioni checklist (B4 C5, "rendere
-- difendibile il non applicabile")
-- Applica Filippo nel SQL Editor; subito dopo esegue le query di verifica
-- in fondo e incolla l'output reale nel footer (convenzione 024/025/026/027).
-- ------------------------------------------------------------
-- updated_at: riusa il trigger generico set_updated_at() già esistente
-- (001_schema.sql, righe 293-302) — stesso pattern già in uso su
-- profiles e maintenance_items, nessuna funzione nuova.
-- marked_by: popolato SOLO da setChecklistException (l'azione che
-- esclude una voce), non da altre scritture sulla riga — risponde
-- specificamente a "chi ha escluso questa voce e quando", non "chi ha
-- toccato la riga per ultimo" (quello resta created_by, esistente).
-- Nessun backfill per le righe già presenti: marked_by parte NULL,
-- updated_at parte al momento dell'ALTER (non un dato inventato, è
-- semplicemente il primo istante in cui la colonna è esistita). La UI
-- tratta marked_by NULL come "attribuzione non disponibile", mai
-- indovinata da created_by.
-- ============================================================

ALTER TABLE residence_checklist_exception
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS marked_by  UUID REFERENCES profiles(id);

CREATE TRIGGER residence_checklist_exception_updated_at
  BEFORE UPDATE ON residence_checklist_exception
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- PERCHÉ L'INDICE UNICO DI 027 USA NULLS NOT DISTINCT (non il default)
-- Il default Postgres per UNIQUE è NULLS DISTINCT: due righe con lo
-- stesso (residence_id, expectation_key) ma unit_id NULL NON
-- collidono, perché NULL non è mai considerato uguale a NULL in un
-- confronto standard — l'indice le tratterebbe come righe distinte.
-- In v1 unit_id è SEMPRE NULL (nessuno scope per-unità), quindi con
-- il default ogni "segna non applicabile" ripetuto sulla stessa voce
-- creerebbe silenziosamente una nuova riga invece di aggiornare quella
-- esistente — l'upsert di setChecklistException smetterebbe di essere
-- idempotente, senza errore, senza avviso.
-- NULLS NOT DISTINCT (PG15+) tratta i NULL come uguali ai fini
-- dell'unicità: due righe con unit_id NULL sulla stessa (residence_id,
-- expectation_key) collidono correttamente, l'upsert aggiorna la riga
-- esistente invece di duplicarla.
-- Verificato empiricamente, non solo per costruzione: smoke B4 C5b
-- commit 2 (25/07/2026) — ciclo doppio segna→annulla→segna su
-- condominium:cert_linee_vita ha prodotto UNA sola riga in tabella.
-- ------------------------------------------------------------
COMMENT ON CONSTRAINT residence_checklist_exception_uniq
  ON residence_checklist_exception IS
  'NULLS NOT DISTINCT deliberato (non il default Postgres): unit_id è '
  'sempre NULL in v1, e NULLS DISTINCT (default) lascerebbe collidere '
  'silenziosamente due righe NULL sulla stessa (residence_id, '
  'expectation_key), producendo duplicati invece di aggiornare la riga '
  'esistente — vanificando l''idempotenza dell''upsert di '
  'setChecklistException. Verificato empiricamente nello smoke B4 C5b '
  'commit 2 (25/07/2026). Vedi migrazione 028.';

-- PostgREST scarta silenziosamente colonne non presenti nella sua
-- schema-cache: ricaricala PRIMA che giri codice che legge le nuove colonne.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo, incollare l'output come footer).
-- ============================================================
-- 1. Le due colonne esistono con tipo/nullability corretti:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'residence_checklist_exception'
--   AND column_name IN ('updated_at', 'marked_by')
-- ORDER BY column_name;
--
-- 2. Il trigger esiste:
-- SELECT tgname, tgrelid::regclass AS tabella
-- FROM pg_trigger
-- WHERE tgrelid = 'public.residence_checklist_exception'::regclass
--   AND NOT tgisinternal;
--
-- 3. Il commento sul vincolo è presente:
-- SELECT description FROM pg_description d
-- JOIN pg_constraint c ON c.oid = d.objoid
-- WHERE c.conname = 'residence_checklist_exception_uniq'
--   AND d.classoid = 'pg_constraint'::regclass;
--
-- 4. Le righe esistenti: updated_at valorizzato (momento dell'ALTER),
--    marked_by NULL (nessun backfill, dato mancante resta mancante):
-- SELECT expectation_key, not_applicable, marked_by, updated_at
-- FROM residence_checklist_exception ORDER BY created_at;
-- ============================================================
--
-- ── ESITO REALE ──
-- Applicata da Filippo il 27/07/2026.
--
-- Confermato da Filippo in sessione (riepilogo, non l'output letterale
-- delle 4 query sopra — non è stato incollato in chat, quindi non è
-- trascritto riga per riga qui: onestà sul dato disponibile invece di un
-- placeholder che sembra un risultato vero):
-- 1. Colonne marked_by e updated_at presenti e leggibili.
-- 2. Trigger creato senza errori (implica che set_updated_at() esiste,
--    altrimenti CREATE TRIGGER avrebbe fallito subito).
-- 3. NOTIFY pgrst eseguito.
-- 4. Righe di test del 25/07 su Cavaccio ripulite (vedi query 3a/3b
--    proposte in sessione): la tabella residence_checklist_exception
--    conta ora 1 sola riga, su una residenza diversa da Cavaccio, con
--    not_applicable = false (inerte, non influisce sui contatori).
--
-- Verifica non eseguita in questa sessione: l'output testuale delle
-- query 1-4 di cui sopra (tipo/nullability delle colonne, nome esatto
-- del trigger, testo del commento sul vincolo). Se serve un record
-- letterale per l'audit trail della migrazione, rilanciarle e incollare
-- l'output.
-- ============================================================

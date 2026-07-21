-- ============================================================
-- CasaZero — 025: 5° stato classification_status per coda revisione (B3 commit 3)
-- SOLO ANTEPRIMA: applica Filippo nel SQL Editor; subito dopo, eseguire
-- le query di verifica in fondo e incollarne l'output nel footer
-- (convenzione post-013: la prova che il constraint è cambiato è
-- l'output, mai il commento).
-- ------------------------------------------------------------
-- Problema: la CHECK di 024 ammette solo 4 stati (non_classificato,
-- in_corso, completata, fallita). B3 (classificazione AI, FASE 0
-- approvata) richiede un 5° stato per distinguere "classificato con
-- bassa confidenza, in attesa di revisione umana" da "errore tecnico
-- ritentabile" — decisione presa esplicitamente in FASE 0: niente
-- riuso di 'fallita' per la coda di revisione, i due casi hanno
-- gestione UI e workflow diversi.
--
-- Semantica dei 5 stati (per il commit 4/5 che li scriverà/leggerà):
--   non_classificato → mai processato
--   in_corso         → chiamata AI in corso (transitorio, request-scoped,
--                       impostato e risolto nella stessa invocazione —
--                       mai uno stato che sopravvive a un'invocazione)
--   completata        → classificata con confidenza ≥ soglia (0.8, vedi
--                       CLASSIFICATION_CONFIDENCE_THRESHOLD in
--                       src/lib/document-classification.ts), accettata
--   da_revisionare    → classificata ma confidenza < soglia, oppure PDF
--                       oltre il limite dimensione API: coda di revisione
--                       umana, proposta AI comunque salvata
--   fallita           → errore tecnico (timeout, schema non conforme,
--                       API down) — ritentabile, non una proposta da
--                       rivedere nel merito
--
-- Additiva sui dati esistenti: le 7 righe con classification_status
-- 'non_classificato' (verificato nel footer 024) restano valide senza
-- backfill — il nuovo valore amplia solo l'insieme ammesso dalla CHECK.
-- ============================================================

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_classification_status_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_classification_status_check
  CHECK (classification_status IN (
    'non_classificato', 'in_corso', 'completata', 'da_revisionare', 'fallita'
  ));

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo l'apply, incollare
-- l'output qui sotto come footer — vedi convenzione 022/023/024).
-- ============================================================
-- 1. Il constraint deve ammettere ora esattamente questi 5 valori:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.documents'::regclass
--   AND conname = 'documents_classification_status_check';
--
-- 2. Le righe esistenti restano in uno stato valido (se l'ALTER sopra
--    è passato senza errore è già garantito, ma verifichiamo il
--    conteggio per completezza — deve essere invariato rispetto al
--    footer di 024, tutte 'non_classificato'):
-- SELECT classification_status, count(*) FROM documents GROUP BY 1;
--
-- 3. Il nuovo valore 'da_revisionare' è realmente accettato — UPDATE
--    di prova in transazione con ROLLBACK finale, non sporca nulla
--    (stesso metodo di verifica diretta usato in 022):
-- BEGIN;
-- UPDATE documents SET classification_status = 'da_revisionare'
--   WHERE id = (SELECT id FROM documents LIMIT 1)
--   RETURNING id, classification_status;
-- ROLLBACK;
--
-- 4. Un valore NON ammesso deve essere ancora respinto (conferma che la
--    CHECK non è stata allargata più del previsto — atteso: errore
--    "violates check constraint", in transazione con ROLLBACK):
-- BEGIN;
-- UPDATE documents SET classification_status = 'stato_inventato'
--   WHERE id = (SELECT id FROM documents LIMIT 1);
-- ROLLBACK;
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo il 21/07/2026) ──
--
-- 1. Constraint: 5 valori ammessi (non_classificato, in_corso,
--    completata, da_revisionare, fallita) — corretto.
-- 2. Conteggio: 10 righe, tutte 'non_classificato' — invariato, nessun
--    dato toccato.
-- 3. 'da_revisionare' accettato (UPDATE di prova → RETURNING ok, ROLLBACK).
-- 4. 'stato_inventato' respinto con "violates check constraint" — atteso,
--    la CHECK non è allargata oltre i 5 valori.
-- Migrazione verificata e corretta.
-- ============================================================

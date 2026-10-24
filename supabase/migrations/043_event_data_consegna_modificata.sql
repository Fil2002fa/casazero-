-- ============================================================
-- CasaZero — 043: nuovo tipo di evento data_consegna_modificata
-- NON ANCORA VERIFICATA al 24/10/2026: i footer sotto sono vuoti perche gli
-- esiti non sono stati forniti. Non si sa se l'apply sia avvenuto: la prima
-- cosa da eseguire e la V0, che stampa il nome reale del vincolo e i valori
-- ammessi oggi. Finche quel footer resta vuoto, questo file e un'anteprima,
-- non una migrazione verificata — e l'union ActivityEventType in
-- src/types/database.ts NON e stata allargata, cosi nessun codice puo
-- scrivere un valore che il DB potrebbe ancora rifiutare.
-- Statement singoli idempotenti, nessun BEGIN/COMMIT (il SQL Editor non gira
-- in transazione): DROP IF EXISTS + ADD della stessa CHECK e rieseguibile.
-- SOLO vocabolario del registro: nessuna UI, nessuna scrittura, nessun
-- next_due_date toccato.
-- ------------------------------------------------------------
-- PERCHE': ogni modifica di una data di consegna va nel registro attivita
-- (decisione Filippo del 24/10). Il CHECK su activity_events.event_type
-- (037_activity_events.sql:37-54) ammette 8 valori: inserirne un nono senza
-- allargarlo produce un errore a RUNTIME, non a compilazione — e esattamente
-- l'avvertimento scritto in src/types/database.ts:135-141.
--
-- UN SOLO TIPO, NON TRE. La data di consegna si tocca a quattro livelli
-- (voce, categoria, unita, residenza) ma l'atto e sempre lo stesso: qualcuno
-- ha spostato la data da cui parte il piano. Tre tipi distinti obbligherebbero
-- ogni lettura del registro a riunirli per raccontare la stessa storia. Il
-- livello sta nel payload.
--
-- CONTRATTO DEL PAYLOAD (non esprimibile in un CHECK: payload e JSONB e la
-- sua forma varia per event_type — vedi 037 e types/database.ts:168-179):
--
--   {
--     "livello": "voce" | "categoria" | "unita" | "residenza",
--     "vecchio": "YYYY-MM-DD" | null,   -- null = nessuna data prima
--     "nuovo":   "YYYY-MM-DD" | null    -- null = livello rimosso
--   }
--
-- Chi e quando NON vanno nel payload: sono gia colonne di activity_events
-- (actor_id, actor_role, actor_name congelati al momento dell'atto, piu
-- created_at). Duplicarli creerebbe due fonti per lo stesso fatto.
-- Per livello 'categoria' il payload porta anche "categoria": <TEXT>, e per
-- 'voce' anche "item_id": <uuid>: senza, la riga di registro non dice su
-- cosa si e agito. unit_id e residence_id sono gia colonne della tabella.
--
-- IL LIVELLO 'residenza' NON HA ANCORA UNA SUPERFICIE DI SCRITTURA:
-- residences.delivery_date e scritta solo dalla RPC di creazione e non esiste
-- nessuna pagina di modifica residenza (unico .update() su residences in
-- tutto src/ e photo_url, [id]/actions.ts:63). Sta nel vocabolario perche il
-- registro non debba cambiare quando quella superficie arrivera.
--
-- NESSUNA RIGA ESISTENTE CAMBIA: la CHECK nuova e un superset di quella
-- vecchia, quindi la validazione delle righe gia presenti passa per
-- costruzione. La verifica V4 lo prova contando le righe prima e dopo.
--
-- ATTENZIONE AL NOME DEL VINCOLO: in 037 la CHECK e inline nel CREATE TABLE,
-- quindi il nome e generato da Postgres. La V0 lo stampa: se NON e
-- 'activity_events_event_type_check', sostituirlo nei due statement sotto
-- PRIMA di lanciarli. Un DROP IF EXISTS su un nome sbagliato non fa errore,
-- e l'ADD creerebbe un secondo vincolo lasciando quello vecchio a bloccare
-- il valore nuovo: fallimento silenzioso. La V3 lo intercetta comunque.
-- ============================================================

-- 1. Via il vincolo vecchio (nome da confermare con la V0).
ALTER TABLE activity_events
  DROP CONSTRAINT IF EXISTS activity_events_event_type_check;

-- 2. Lo stesso vincolo con il nono valore. I commenti dei valori esistenti
--    sono riportati da 037: questo vincolo diventa la definizione viva.
ALTER TABLE activity_events
  ADD CONSTRAINT activity_events_event_type_check CHECK (event_type IN (
    'sollecito_inviato',
    'invito_inviato',
    'invito_accettato',
    'admin_assegnato',
    'admin_rimosso',
    'documento_caricato',
    -- Registra SOLO la classificazione confermata da una persona, mai
    -- l'auto-classificazione AI ad alta confidenza. E un vincolo di prodotto,
    -- non esprimibile in un CHECK: il DB non puo distinguere le due origini.
    -- Chi aggiunge un punto di scrittura per questo tipo deve verificarlo a mano.
    'documento_classificato',
    -- Un evento per ATTO, non per istanza: l'archiviazione agisce su tutte le
    -- istanze di un template nella residenza (activation_status passa ad
    -- 'archiviata', tipo item_activation: 'inclusa' | 'esclusa' | 'archiviata').
    -- Il numero di voci toccate va nel payload, non moltiplicato in righe.
    'voce_archiviata',
    -- Un evento per ATTO anche qui: registrare la consegna di 8 unita in un
    -- colpo dalla selezione multipla produce 8 righe (una per unita, con il
    -- suo unit_id), perche l'atto e per unita; spostare una data di categoria
    -- produce UNA riga, perche l'atto e sulla residenza. Il numero di voci
    -- ricalcolate e quello delle voci saltate perche nel fascicolo vanno nel
    -- payload, non moltiplicati in righe.
    'data_consegna_modificata'
  ));

-- La CHECK non entra nella schema-cache di PostgREST, ma il reload e
-- innocuo e tiene la convenzione delle altre migrazioni.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA PRE-APPLY (eseguire PRIMA degli statement sopra)
-- ============================================================
-- V0. NOME REALE DEL VINCOLO e suo corpo attuale. Atteso: UNA riga, con 8
--     valori e senza data_consegna_modificata. Se conname non e
--     'activity_events_event_type_check', sostituirlo negli statement 1 e 2.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.activity_events'::regclass AND contype = 'c';
-- ESITO: (da incollare PRIMA dell'apply)

-- V1. Baseline del registro, da riconfrontare dopo l'apply (V4).
-- SELECT count(*) AS righe_registro FROM activity_events;
-- SELECT event_type, count(*) FROM activity_events
--  GROUP BY event_type ORDER BY event_type;
--     MISURA INDIPENDENTE (24/10, service role, count exact): 18 righe in
--     activity_events. Non sostituisce la V1, che va eseguita nel SQL Editor
--     insieme al resto: serve solo come riferimento se il totale dopo
--     l'apply non tornasse.

-- ============================================================
-- VERIFICA POST-APPLY (footer da compilare con l'output REALE: nessun esito
-- inventato — Claude non applica DDL, vedi CLAUDE.md)
-- ============================================================
-- V2. Il vincolo ora ammette 9 valori, data_consegna_modificata compreso.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.activity_events'::regclass AND contype = 'c';
-- ESITO: (da incollare)

-- V3. TRAPPOLA DEL DOPPIO VINCOLO: deve esserci UNA sola CHECK su
--     activity_events. Atteso: 1. Se e 2, il DROP ha mancato il nome reale
--     (vedi V0) e il vincolo vecchio sta ancora bloccando il valore nuovo.
-- SELECT count(*) AS check_su_activity_events FROM pg_constraint
--  WHERE conrelid = 'public.activity_events'::regclass AND contype = 'c';
-- ESITO: (da incollare)

-- V4. Registro invariato: stessi conteggi della V1, riga per riga.
-- SELECT count(*) AS righe_registro FROM activity_events;
-- SELECT event_type, count(*) FROM activity_events
--  GROUP BY event_type ORDER BY event_type;
-- ESITO: (da incollare)

-- ============================================================
-- TEST — ogni blocco in UNA SOLA esecuzione del SQL Editor (il 14/09
-- l'editor non ha tenuto una transazione tra esecuzioni separate). Gli UUID
-- sono quelli reali del DB demo al 24/10: residenza Portello
-- adf97f32-859a-493e-b145-915979f1ae09, sua unita A1
-- 4818141d-242c-4351-8dcd-005337afeb2b, super_admin pippoloro02
-- 99b90ec5-6a80-4ec3-8884-377163c5510b. Ogni blocco chiude con ROLLBACK:
-- nessun test lascia righe nel registro, che e append-only.
-- ============================================================
-- TEST POSITIVO (il valore nuovo passa, col payload del contratto).
-- Atteso: 1 riga inserita, poi rollback.
-- BEGIN;
-- INSERT INTO public.activity_events
--   (residence_id, unit_id, event_type, actor_id, actor_role, actor_name, payload)
-- VALUES ('adf97f32-859a-493e-b145-915979f1ae09', '4818141d-242c-4351-8dcd-005337afeb2b', 'data_consegna_modificata',
--         '99b90ec5-6a80-4ec3-8884-377163c5510b', 'super_admin', 'Filippo test',
--         '{"livello":"unita","vecchio":null,"nuovo":"2026-11-02"}'::jsonb)
-- RETURNING id, event_type, payload;
-- ROLLBACK;
-- ESITO: (da incollare)

-- TEST NEGATIVO 1 (un valore inventato resta respinto: il vincolo non si e
-- allargato a tutto). Atteso: violazione di activity_events_event_type_check.
-- BEGIN;
-- INSERT INTO public.activity_events
--   (residence_id, event_type, actor_id, actor_role, actor_name, payload)
-- VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'consegna_registrata',
--         '99b90ec5-6a80-4ec3-8884-377163c5510b', 'super_admin', 'Filippo test', '{}'::jsonb);
-- ROLLBACK;
-- ESITO: (da incollare)

-- TEST NEGATIVO 2 (il registro resta append-only: la 037 non ha policy
-- UPDATE ne DELETE. Qui si gira come postgres, che le scavalca, quindi il
-- test e sulle POLICY, non sull'esecuzione). Atteso: 0 righe.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'activity_events'
--    AND cmd IN ('UPDATE', 'DELETE');
-- ESITO: (da incollare)

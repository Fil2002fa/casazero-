-- ============================================================
-- CasaZero — 043: nuovo tipo di evento data_consegna_modificata
-- APPLICATA a mano nel SQL Editor il 2026-10-24, verificata da Filippo:
-- esiti reali nei footer in fondo. V3 corretta e test di scrittura eseguiti
-- il 2026-10-26, tutti con l'atteso.
--
-- AVVERTENZA SULL'ORDINE: la V0 (pre-apply) e stata eseguita DOPO l'apply,
-- quindi lo stato precedente del vincolo non e stato osservato e non esiste
-- prova diretta che il DROP abbia colpito il nome giusto. Il buco lo chiude
-- la V3 corretta: su activity_events ci sono due CHECK e una sola riguarda
-- event_type. Se il DROP avesse mancato il nome, ce ne sarebbero TRE (la
-- vecchia su event_type, la nuova, e quella su payload). Quindi la trappola
-- del doppio vincolo non e scattata, provato dallo stato finale invece che
-- dal confronto prima/dopo.
--
-- L'union ActivityEventType in src/types/database.ts NON e ancora allargata.
-- Non e piu una questione di sicurezza — il vincolo ora ammette il valore —
-- ma di utilita: nessun codice scrive questo evento finche non arriva la
-- modale Registra consegna, e il valore entra nell'union con il commit che
-- per primo lo usa.
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

-- 1. Via il vincolo vecchio. Nome confermato dalla V0 del 24/10: era
--    activity_events_event_type_check, cioe quello previsto qui.
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
-- ESITO (eseguita DOPO l'apply, vedi l'avvertenza in testa al file):
--        activity_events_event_type_check | CHECK (event_type IN (...)) con
--        9 valori, data_consegna_modificata compreso. Il nome reale era
--        quello previsto dagli statement sopra, quindi il DROP ha colpito.
--        La query mostra anche activity_events_payload_check
--        (jsonb_typeof(payload) = 'object'), che viene da
--        037_activity_events.sql:68-69 ed e sempre esistito.

-- V1. Baseline del registro, da riconfrontare dopo l'apply (V4).
-- SELECT count(*) AS righe_registro FROM activity_events;
-- SELECT event_type, count(*) FROM activity_events
--  GROUP BY event_type ORDER BY event_type;
--     ESITO: 18 righe —
--            admin_assegnato   2
--            admin_rimosso     3
--            invito_accettato  1
--            invito_inviato    7
--            sollecito_inviato 5
--     Coincide con la misura indipendente del 24/10 (service role, count
--     exact): 18 righe.

-- ============================================================
-- VERIFICA POST-APPLY (footer da compilare con l'output REALE: nessun esito
-- inventato — Claude non applica DDL, vedi CLAUDE.md)
-- ============================================================
-- V2. Il vincolo ora ammette 9 valori, data_consegna_modificata compreso.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.activity_events'::regclass AND contype = 'c';
-- ESITO: CHECK su event_type con 9 valori, data_consegna_modificata incluso.

-- V3. TRAPPOLA DEL DOPPIO VINCOLO: dopo l'apply deve esserci UNA SOLA CHECK
--     che riguardi event_type. Se ce ne sono due, il DROP ha mancato il nome
--     reale (vedi V0) e quella vecchia sta ancora bloccando il valore nuovo.
--
--     QUERY CORRETTA IL 24/10: la versione precedente contava TUTTE le CHECK
--     della tabella e dichiarava atteso 1. Era sbagliata: activity_events ha
--     due CHECK inline dalla 037, una su event_type (:37-54) e una su payload
--     (:68-69, jsonb_typeof(payload) = 'object'). Contandole tutte l'atteso
--     corretto sarebbe 2, cioe lo stesso numero che si otterrebbe con la
--     trappola scattata su una tabella con una sola CHECK: un atteso che non
--     distingue il caso buono da quello cattivo non e una verifica. Si filtra
--     per colonna via conkey, non per testo della definizione: un LIKE
--     '%event_type%' matcherebbe anche una CHECK su un'altra colonna che
--     nomina event_type.
-- SELECT c.conname, pg_get_constraintdef(c.oid) AS definizione
--   FROM pg_constraint c
--  WHERE c.conrelid = 'public.activity_events'::regclass
--    AND c.contype = 'c'
--    AND EXISTS (
--      SELECT 1 FROM pg_attribute a
--       WHERE a.attrelid = c.conrelid
--         AND a.attnum = ANY (c.conkey)
--         AND a.attname = 'event_type'
--    );
-- Atteso: esattamente 1 riga, activity_events_event_type_check.
-- ESITO (26/10, query corretta): 1 riga, activity_events_event_type_check
--        con 9 valori. Su event_type c'e una sola CHECK: la trappola del
--        doppio vincolo non e scattata. (Con la query vecchia, 24/10: 2 righe,
--        event_type_check + payload_check, coerente con questo esito.)

-- V4. Registro invariato: stessi conteggi della V1, riga per riga.
-- SELECT count(*) AS righe_registro FROM activity_events;
-- SELECT event_type, count(*) FROM activity_events
--  GROUP BY event_type ORDER BY event_type;
-- ESITO: 18 righe, stessa ripartizione della V1 (admin_assegnato 2,
--        admin_rimosso 3, invito_accettato 1, invito_inviato 7,
--        sollecito_inviato 5): nessuna riga toccata, nessun valore nuovo
--        ancora scritto.

-- ============================================================
-- TEST — eseguiti il 26/10 nel SQL Editor, UUID reali del DB demo
-- (riverificati il 26/10 da una SELECT preliminare: 11/11 true). Residenza
-- Portello adf97f32-859a-493e-b145-915979f1ae09, sua unita A1
-- 4818141d-242c-4351-8dcd-005337afeb2b, super_admin pippoloro02
-- 99b90ec5-6a80-4ec3-8884-377163c5510b.
--
-- FORMA: ogni test e UN SOLO blocco DO, non BEGIN ... ROLLBACK. Due motivi:
--   - il SQL Editor mostra solo il risultato dell'ULTIMA istruzione
--     (032_grants_hardening_anon.sql:76-77): un blocco che chiude con
--     ROLLBACK mostra "No rows returned" qualunque sia l'esito, quindi un
--     test positivo non e leggibile;
--   - il 14/09 l'editor non ha tenuto una transazione tra esecuzioni
--     separate: un DO e un solo statement, una sola esecuzione per
--     costruzione.
-- Ogni ramo del DO termina con RAISE EXCEPTION: rollback totale sempre,
-- anche se il test fallisce, quindi nessun test lascia righe nel registro,
-- che e append-only. Il banner rosso e voluto: il verdetto e il testo dopo
-- ESITO (OK / FALLITO / INATTESO).
-- ============================================================
-- TEST POSITIVO (il valore nuovo passa, col payload del contratto).
-- Atteso: ESITO 043 POSITIVO: OK, riga <uuid> inserita con payload {...}
-- DO $$
-- DECLARE v_id uuid; v_payload jsonb;
-- BEGIN
--   INSERT INTO public.activity_events
--     (residence_id, unit_id, event_type, actor_id, actor_role, actor_name, payload)
--   VALUES ('adf97f32-859a-493e-b145-915979f1ae09', '4818141d-242c-4351-8dcd-005337afeb2b', 'data_consegna_modificata',
--           '99b90ec5-6a80-4ec3-8884-377163c5510b', 'super_admin', 'Filippo test',
--           '{"livello":"unita","vecchio":null,"nuovo":"2026-11-02"}'::jsonb)
--   RETURNING id, payload INTO v_id, v_payload;
--   RAISE EXCEPTION 'ESITO 043 POSITIVO: OK, riga % inserita con payload %, annullata', v_id, v_payload;
-- END $$;
-- ESITO (26/10): OK, riga 84d447d6-1581-440c-8423-e6e82b3bcfc2 inserita e
--        annullata. Un INSERT reale di data_consegna_modificata passa
--        insieme al CHECK su payload: le RPC possono scrivere questo evento.

-- TEST NEGATIVO 1 (un valore inventato resta respinto: il vincolo non si e
-- allargato a tutto).
-- Atteso: ESITO 043 NEG1: OK, respinto da activity_events_event_type_check
-- DO $$
-- DECLARE v_con text;
-- BEGIN
--   BEGIN
--     INSERT INTO public.activity_events
--       (residence_id, event_type, actor_id, actor_role, actor_name, payload)
--     VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'consegna_registrata',
--             '99b90ec5-6a80-4ec3-8884-377163c5510b', 'super_admin', 'Filippo test', '{}'::jsonb);
--   EXCEPTION WHEN check_violation THEN
--     GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
--     IF v_con = 'activity_events_event_type_check' THEN
--       RAISE EXCEPTION 'ESITO 043 NEG1: OK, respinto da %', v_con;
--     END IF;
--     RAISE EXCEPTION 'ESITO 043 NEG1: INATTESO, respinto da un altro vincolo: %', v_con;
--   END;
--   RAISE EXCEPTION 'ESITO 043 NEG1: FALLITO, consegna_registrata e passato (annullato)';
-- END $$;
-- ESITO (26/10): OK, respinto da activity_events_event_type_check.
--        'consegna_registrata' (il nome scartato il 24/10) resta fuori.

-- TEST NEGATIVO 2 (il registro resta append-only: la 037 non ha policy
-- UPDATE ne DELETE. Qui si gira come postgres, che le scavalca, quindi il
-- test e sulle POLICY, non sull'esecuzione). Atteso: 0 righe.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'activity_events'
--    AND cmd IN ('UPDATE', 'DELETE');
-- ESITO: 0 righe. Nessuna policy UPDATE ne DELETE su activity_events: il
--        registro resta append-only anche dopo l'allargamento del vincolo.

-- CONTROLLO RESIDUI (i test non hanno lasciato righe nel registro).
-- Atteso: 18 | 0
-- SELECT count(*) AS righe_registro,
--        count(*) FILTER (WHERE actor_name = 'Filippo test') AS righe_test
--   FROM activity_events;
-- ESITO: non riportato. Il report del 26/10 lo lascia vuoto. Nessuna riga
--        e attesa per costruzione (ogni ramo dei DO termina in RAISE), ma
--        questa e un'argomentazione, non una misura: da eseguire e incollare.

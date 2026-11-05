-- ============================================================
-- CasaZero — 049: nuovo tipo di evento documento_corretto
-- Approvata da Filippo il 2026-11-01 (piano R10, risposta 3) e rivista
-- il 2026-11-05. Applicata via MCP il 2026-11-05; esiti nel registro
-- docs/migrations.log.
--
-- RIMANDO: il commento di 048_document_field_overrides.sql:24 dice che lo
-- storico delle correzioni va in activity_events "nella migrazione 049".
-- E questa. La 048 e gia applicata e non si modifica.
--
-- Statement singoli idempotenti, nessun BEGIN/COMMIT: DROP IF EXISTS + ADD
-- della stessa CHECK e rieseguibile. SOLO vocabolario del registro.
-- ------------------------------------------------------------
-- PERCHE': ogni correzione manuale di un campo estratto da un documento, e
-- ogni ripristino al valore AI, va nel registro attivita (R10, D7). La
-- tabella document_field_overrides e stato corrente, non storico: togliere
-- una correzione e una DELETE, quindi lo storico vive solo qui.
--
-- UN SOLO TIPO per impostare e ripristinare: l'atto e lo stesso (cambia
-- cosa dice il documento), la differenza sta nel payload (`action`).
--
-- UN EVENTO PER CAMPO: Correggi dati salva un campo per chiamata; la
-- proposta fornitore con impresa digitata a mano ne scrive due (ragione
-- sociale e P.IVA) e produce due righe.
--
-- CONTRATTO DEL PAYLOAD (JSONB, non esprimibile in un CHECK):
--
--   {
--     "document_id":  <uuid>,
--     "title":        <TEXT> | null,        -- titolo del documento al momento dell'atto
--     "doc_type":     <TEXT>,               -- tipo a cui la correzione si applica
--     "field_key":    <TEXT>,               -- chiave del campo (document-overrides.ts)
--     "action":       "impostato" | "ripristinato",
--     "value":        <TEXT> | null,        -- solo "impostato"; null = il documento non lo riporta
--     "had_previous": true | false | null,  -- c'era una correzione manuale prima; null = lettura fallita
--     "previous":     <TEXT> | null,        -- valore di quella correzione (mai il valore AI)
--     "source":       "correggi_dati" | "proposta_fornitore"
--   }
--
-- La frase a schermo si costruisce a lettura (activity-event-view.ts), mai
-- qui. unit_id = documents.unit_id quando valorizzato, altrimenti null.
-- Chi e quando NON vanno nel payload: sono gia colonne (actor_*, created_at).
--
-- NESSUNA RIGA ESISTENTE CAMBIA: la CHECK nuova e un superset della vecchia.
-- ============================================================

-- 1. Via il vincolo vecchio (nome confermato il 2026-11-05 da pg_constraint).
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_event_type_check;

-- 2. Lo stesso vincolo con il decimo valore.
ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_event_type_check CHECK (event_type IN (
    'sollecito_inviato',
    'invito_inviato',
    'invito_accettato',
    'admin_assegnato',
    'admin_rimosso',
    'documento_caricato',
    -- Registra SOLO la classificazione confermata da una persona, mai
    -- l'auto-classificazione AI ad alta confidenza (vincolo di prodotto,
    -- non esprimibile in un CHECK).
    'documento_classificato',
    -- Un evento per ATTO, non per istanza (vedi 037 e 043).
    'voce_archiviata',
    -- Un evento per ATTO anche qui (vedi 043).
    'data_consegna_modificata',
    -- Correzione manuale di un campo estratto, o ripristino al valore AI.
    -- Un evento per campo. Contratto del payload sopra.
    'documento_corretto'
  ));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA (sola SELECT; esiti reali in docs/migrations.log)
-- ============================================================
-- (a) Il vincolo ammette 10 valori, documento_corretto compreso.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.activity_events'::regclass
--    AND conname = 'activity_events_event_type_check';
--
-- (b) Trappola del doppio vincolo: UNA sola CHECK su event_type (filtro per
--     colonna via conkey, non per testo).
-- SELECT c.conname FROM pg_constraint c
--  WHERE c.conrelid = 'public.activity_events'::regclass AND c.contype = 'c'
--    AND EXISTS (SELECT 1 FROM pg_attribute a
--                 WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
--                   AND a.attname = 'event_type');
--
-- (c) Registro invariato: stessi conteggi di prima (68 righe).
-- SELECT event_type, count(*) FROM public.activity_events GROUP BY 1 ORDER BY 1;
--
-- (d) Test positivo e negativo in un blocco DO che termina sempre in
--     RAISE EXCEPTION (rollback totale, nessun residuo: il registro e
--     append-only).

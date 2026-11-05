-- ============================================================
-- CasaZero — 051: nuovo tipo di evento documento_unita_cambiata
-- Richiesta da Filippo il 2026-11-05 (E1a, assegna/cambia unità di un
-- documento). Esiti nel registro docs/migrations.log.
--
-- Un solo statement per il vincolo: DROP IF EXISTS + ADD della stessa CHECK
-- nella stessa ALTER TABLE, quindi mai un istante senza vincolo e
-- rieseguibile. Nessun BEGIN/COMMIT. SOLO vocabolario del registro.
-- ------------------------------------------------------------
-- PERCHE': assegnare un documento a un'unità, cambiarla o riportarlo alla
-- residenza cambia chi lo legge (policy "documents: lettura se si ha
-- accesso" dipende da unit_id) e cosa soddisfa la checklist B4. È un atto da
-- ricostruire. documento_corretto non è adatto: il suo payload parla di
-- campi estratti (049).
--
-- CONTRATTO DEL PAYLOAD (JSONB, piatto, non esprimibile in un CHECK):
--
--   {
--     "document_id":  <uuid>,
--     "title":        <TEXT> | null,   -- titolo del documento al momento dell'atto
--     "doc_type":     <TEXT> | null,   -- tipo del documento al momento dell'atto
--     "from_unit_id": <uuid> | null,   -- null = era un documento della residenza
--     "to_unit_id":   <uuid> | null    -- null = riportato alla residenza
--   }
--
-- from_unit_id e to_unit_id non sono mai uguali (l'atto "invariata" non si
-- registra). La colonna unit_id dell'evento vale to_unit_id, oppure
-- from_unit_id quando il documento torna alla residenza. La frase a schermo
-- si costruisce a lettura (activity-event-view.ts), mai qui. Chi e quando
-- sono già colonne (actor_*, created_at).
--
-- NESSUNA RIGA ESISTENTE CAMBIA: la CHECK nuova è un superset della vecchia.
-- ============================================================

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_event_type_check,
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
    -- Un evento per campo (049).
    'documento_corretto',
    -- Assegnazione, cambio o rimozione dell'unità di un documento. Un evento
    -- per atto. Contratto del payload sopra.
    'documento_unita_cambiata'
  ));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA (solo SELECT)
--
-- (a) Il vincolo ammette 11 valori, documento_unita_cambiata compreso:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.activity_events'::regclass
--      AND conname = 'activity_events_event_type_check';
--
-- (b) UNA sola CHECK su event_type:
--   SELECT count(*) FROM pg_constraint c
--     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
--    WHERE c.conrelid = 'public.activity_events'::regclass
--      AND c.contype = 'c' AND a.attname = 'event_type';
--
-- (c) Registro invariato (70 righe prima, 70 dopo):
--   SELECT count(*) FROM public.activity_events;
-- ============================================================

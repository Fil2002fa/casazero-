-- ============================================================
-- CasaZero — 053: nuovi tipi di evento documento_eliminato e
-- documento_file_non_rimosso
-- Approvata da Filippo il 2026-11-06 (E1b, commit 7b: elimina documento).
-- Esiti nel registro docs/migrations.log.
--
-- Un solo statement per il vincolo: DROP IF EXISTS + ADD della stessa CHECK
-- nella stessa ALTER TABLE, quindi mai un istante senza vincolo e
-- rieseguibile. Nessun BEGIN/COMMIT. SOLO vocabolario del registro.
-- ------------------------------------------------------------
-- PERCHE' DUE TIPI: l'evento di eliminazione si scrive PRIMA di rimuovere il
-- file, così il path resta tracciato anche se il processo si interrompe. Il
-- registro è append-only, quindi quella riga non può poi riportare l'esito
-- della rimozione: un fallimento è un fatto a sé, con la sua riga. Il conteggio
-- di documento_eliminato resta uguale ai documenti eliminati.
--
-- CONTRATTO DEI PAYLOAD (JSONB, piatto, non esprimibile in un CHECK):
--
-- documento_eliminato (un evento per documento, snapshot al momento dell'atto):
--   {
--     "document_id":           <uuid>,
--     "title":                 <TEXT>,
--     "file_name":             <TEXT>,
--     "doc_type":              <TEXT> | null,
--     "sistema":               <TEXT> | null,
--     "category":              <TEXT>,
--     "unit_id":               <uuid> | null,   -- null = documento della residenza
--     "file_date":             <DATE ISO> | null,
--     "classification_status": <TEXT>,
--     "storage_path":          <TEXT>,          -- nel bucket documents
--     "uploaded_by":           <uuid> | null,
--     "document_created_at":   <TIMESTAMPTZ ISO>
--   }
--
-- documento_file_non_rimosso (solo se la rimozione del file fallisce):
--   {
--     "document_id":  <uuid>,
--     "title":        <TEXT>,
--     "storage_path": <TEXT>,
--     "reason":       "errore_storage" | "file_non_rimosso"  -- codice, mai frase
--   }
--
-- La colonna unit_id dell'evento vale l'unità del documento (null = residenza).
-- La frase a schermo si costruisce a lettura (activity-event-view.ts), mai
-- qui. Chi e quando sono già colonne (actor_*, created_at). I dati estratti e
-- le correzioni (document_extractions, document_field_overrides) non entrano
-- nello snapshot: spariscono in CASCADE col documento.
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
    -- per atto (051).
    'documento_unita_cambiata',
    -- Eliminazione di un documento, un evento per documento con snapshot.
    -- Contratto del payload sopra.
    'documento_eliminato',
    -- La rimozione del file dopo un'eliminazione è fallita: il file è rimasto
    -- nel bucket. Contratto del payload sopra.
    'documento_file_non_rimosso'
  ));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA (solo SELECT)
--
-- (a) Il vincolo ammette 13 valori, i due nuovi compresi:
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
-- (c) Registro invariato (85 righe prima, 85 dopo):
--   SELECT count(*) FROM public.activity_events;
--
-- (d) Probe INSERT NON eseguito: registro append-only senza DELETE, una riga di
-- prova resterebbe. Sostituito dall'ispezione di pg_get_constraintdef (a).
-- ============================================================

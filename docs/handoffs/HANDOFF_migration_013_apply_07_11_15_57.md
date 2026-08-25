# Handoff — Migration 013 apply · 11/07/2026 15:57

## Sommario
Bug riportato: "Nuova unità" falliva su Residenza Cavaccio con errore PostgREST
"function public.czero_add_unit_with_items not found in schema cache". Diagnosi
read-only ha confermato che la funzione, benché versionata in
`supabase/migrations/013_add_unit_atomic.sql` con un commento che dichiarava
"applicata a mano il 2026-07-03", non esisteva realmente sul DB (0 righe su
`pg_proc`). Esteso il censimento a tutte le migration 009-017: tutti gli altri
oggetti (colonne, enum, funzioni, policy RLS, bucket storage) sono risultati
presenti e conformi. Filippo ha applicato la 013 a mano nel SQL Editor,
verificato con query diretta su `pg_proc` e testato dall'app. Un commit ha
corretto la data di apply nel file e aggiunto un footer di verifica standard.

## Lavoro completato
- [x] Individuata la chiamata client a `czero_add_unit_with_items` in
      `src/app/(dashboard)/admin/residences/[id]/units/actions.ts:29-33`
- [x] Confrontata la firma client con quella della migration 013 (nomi/tipi/ordine
      combacianti — nessuna divergenza di firma)
- [x] Verificato su `pg_proc` che la funzione non esisteva sul DB reale
      (project ref `kuvekkseclhhcamojysj`) nonostante il commento "applicata"
- [x] Censimento completo migration 009-017: oggetto per oggetto, query di
      verifica diretta (`pg_proc`, `pg_policies`, `information_schema.columns`,
      `pg_type`, `storage.buckets`) — unico oggetto assente: la funzione della 013
- [x] Anteprima SQL della 013 mostrata a Filippo per apply manuale
- [x] Filippo ha applicato la 013 nel SQL Editor, smoke test ok, verifica
      `pg_proc` ok, test dall'app ok
- [x] Commit `ce4752a`: corretta la data di apply in testa al file
      (2026-07-03 → 2026-07-11, con nota esplicita che il commento precedente
      era falso) e aggiunto footer con la query di verifica `pg_proc` eseguita
      e il suo output annotato

## File toccati
### Creati
- Nessuno

### Modificati
- `supabase/migrations/013_add_unit_atomic.sql` — corretta la data di apply
  reale in testa al file (era falsa: dichiarava applicazione l'8 luglio prima
  del fatto), aggiunto footer "VERIFICA POST-APPLY" con la query di controllo
  su `pg_proc` e il suo output annotato

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — chiamata RPC
  `createUnit`, per confrontare i parametri passati con la firma DB
- `supabase/migrations/013_add_unit_atomic.sql` — funzione mancante, oggetto
  del bug
- `supabase/migrations/009_rls_profiles_super_admin.sql` … `017_builder_logos_bucket.sql`
  — censimento completo per escludere altri gap oltre alla 013
- `supabase/migrations/012_create_residence_atomic.sql` — confronto firma con
  `czero_create_residence_with_units`, presente e conforme sul DB

## Decisioni chiave
- **Diagnosi via query dirette, non fidarsi dei commenti nei file di migration**:
  il file 013 dichiarava "applicata... smoke test ok" ma la funzione non
  esisteva sul DB. La sola prova accettata è stata l'output di `pg_proc`
  (0 righe → assente, poi 1 riga → presente), non il commento in testa al file.
  Alternativa scartata: fidarsi della tabella di tracking Supabase
  (`list_migrations`), che comunque si è rivelata inaffidabile per le migration
  applicate a mano (mostrava solo fino alla 008, ma la 012 risultava comunque
  applicata sul DB).
- **Censimento esteso a tutto il range 009-017 prima dell'apply**, non solo
  alla 013 incriminata, per escludere che il gap fosse sintomo di un problema
  più ampio (apply mancate multiple). Risultato: gap isolato, solo la 013.

## Stato attuale
### Funziona
- `czero_add_unit_with_items(uuid, text, integer)` esiste sul DB, verificata
  su `pg_proc` (firma: `p_residence_id uuid, p_label text, p_floor integer`)
- Flusso "Nuova unità" da Residenza Cavaccio → Unità e inviti, testato
  funzionante da Filippo dopo l'apply
- Tutti gli altri oggetti delle migration 009-017 (RLS policy, colonne, enum,
  bucket storage) confermati presenti e conformi sul DB — nessun altro gap noto

### Non funziona / da verificare
- Nessuno noto legato a questo bug. Non verificato in questa sessione: se
  esistano altri script/funzioni con lo stesso pattern "commento applicata ma
  mai eseguita" al di fuori del range 009-017 controllato (es. migration 001-008
  non riverificate, essendo tracciate correttamente da `list_migrations`)

## Prossimi passi
1. Nessuna azione di codice pendente su questo fronte — bug chiuso
2. Valutare se applicare il nuovo footer di verifica standard anche alle
   migration più vecchie applicate a mano (012, 016) per coerenza, non
   urgente
3. `CLAUDE.md` e `docs/spec.md` risultano modificati/eliminati nel working
   tree ma non toccati in questa sessione (stato preesistente all'inizio
   della conversazione) — verificare con Filippo se sono modifiche in corso
   da un'altra sessione prima di committare o scartare

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Le modifiche non commitate a `CLAUDE.md` (M) e `docs/spec.md` (D, cancellato)
  visibili in `git status` sono lavoro in corso da un'altra sessione? Non
  sono state toccate qui e non è chiaro se vadano committate, scartate o
  sono parte di un task separato in sospeso
- Ha senso un audit periodico (es. prima di ogni milestone) che confronti
  tutte le funzioni/policy versionate nelle migration contro lo stato reale
  del DB, invece di scoprirlo solo quando un bug utente lo rivela?

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** — aggiungere dopo
  il punto "Migrazioni e RLS: solo anteprima...":

  > Ogni migration applicata a mano si chiude con una query di verifica
  > diretta sul catalogo di sistema (`pg_proc` per funzioni, `pg_policies`
  > per RLS, `information_schema.columns` per colonne, `pg_type` per enum,
  > `storage.buckets` per bucket) eseguita subito dopo l'apply, incollata
  > come footer nel file della migration insieme al suo output. La prova che
  > un oggetto esiste sul DB è l'output della query, mai il commento in testa
  > al file: la 013 ha portato un commento "applicata" falso per 8 giorni
  > prima che un bug utente lo rivelasse.

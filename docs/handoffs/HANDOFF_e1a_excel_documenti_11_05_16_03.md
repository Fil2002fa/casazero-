# Handoff — E1a Excel dati documenti e quadro per unità · 05/11/2026 16:03

## Sommario
Il costruttore può ora scaricare un solo Excel a più schede con i dati estratti dai documenti
(Riepilogo unità, Scadenze, Fornitori, Documenti) e vedere in cima alla pagina Documenti un quadro
unità × documenti attesi (APE, planimetria catastale, DiCo dell'impianto elettrico). Per rendere il
quadro affidabile si è aggiunta l'assegnazione/cambio unità di un documento, con evento nel registro
(migrazione 051). Si sono anche distinti gli errori tecnici da "nessun documento" e resa visibile la
causa dei fallimenti dei batch AI. **Tutto è in 17 commit locali su `main`, mai pushati; la UI e la
route Excel non sono state provate dal vivo** (le prove sono per il 6/11).

## Lavoro completato
- [x] FASE 0 e decisioni D1-D6 (`docs/handoffs/e1a-fase0.md`): `709a319`, `5bd3a42`
- [x] a — helper export condivisi `xlsx-helpers`: `dbd2b0d`
- [x] b — scheda Documenti: File, Stato classificazione, Origine del dato, Campi corretti a mano: `734f88b`
- [x] b2 — colonna Confidenza classificazione (Alta ≥ 0,8 · Media 0,6-0,79 · Bassa < 0,6): `b70ab63`
- [x] c — assegna/cambia/togli unità di un documento (`setDocumentUnit` + pannello): `ade2f2d`
- [x] d — helper documenti attesi per unità (`unit-documents`): `f5a7f3c`
- [x] e1 — `confirmDocument` valida l'unità sulla stessa residenza: `7dda611`
- [x] e2 — migrazione 051 `documento_unita_cambiata` applicata e verificata; evento scritto da `setDocumentUnit` e reso nel registro: `41fc8fa`
- [x] f1 — scheda Scadenze + file a più schede + voci lette a pagine: `3a6328f`
- [x] f2 — scheda Riepilogo unità: `24aff6f`
- [x] f3 — scheda Fornitori (solo super_admin): `1d89609`
- [x] f4a — helper `compareUnitLabels`, `formatKeyData`: `510f1db`
- [x] f4b — quadro unità × documenti in cima alla pagina: `0fe0e6b`
- [x] g1 — errore tecnico distinto da "nessun documento" / residenza inesistente: `ef70a17`
- [x] g2 — causa dei fallimenti dei batch di classificazione ed estrazione: `ff011ed`
- [x] docs finali, lista delle prove dal vivo: `0015e0d`
- [x] `npm run build` pulito (5/11); dev server (pid 488, porta 3000) fermato per il build
- [ ] Prove dal vivo (super_admin e admin): da fare il 6/11
- [ ] Push: NON fatto, in attesa delle prove

## File toccati
### Creati
- `src/lib/xlsx-helpers.ts` — celle tipizzate (testo, data, numero), `toSheetCell`, `buildSheet`, `fileSlug`
- `src/lib/document-unit.ts` — `checkUnitAssignment` (unità della stessa residenza), payload e frase dell'evento 051
- `src/lib/unit-documents.ts` — `unitDocumentRows`, `UNIT_EXPECTATIONS`, `formatKeyData`, `documentsMentioningUnitWithoutAssignment`
- `src/lib/unit-export.ts` — scheda Riepilogo unità
- `src/lib/deadline-export.ts` — scheda Scadenze (invariante promemoria)
- `src/lib/supplier-export.ts` — scheda Fornitori, unione delle due fonti
- `src/lib/maintenance-labels.ts` — etichette di modalità, tipo e stato delle manutenzioni
- `src/lib/supabase/fetch-all.ts` — `fetchAllRows`, lettura a pagine da 1000
- `src/lib/batch-failures.ts` — cause fisse dei fallimenti dei batch AI
- `src/app/(dashboard)/admin/residences/[id]/documenti/AssignUnitPanel.tsx` — pannello "Assegna unità / Cambia unità"
- `src/app/(dashboard)/admin/residences/[id]/documenti/UnitDocumentMatrix.tsx` — quadro unità × documenti
- `supabase/migrations/051_activity_event_documento_unita_cambiata.sql` — CHECK di `activity_events.event_type` a 11 valori
- `scripts/verify-document-unit.mjs`, `verify-unit-documents.mjs`, `verify-residence-export.mjs`, `verify-batch-failures.mjs` — script di verifica
- `docs/handoffs/e1a-fase0.md`, `docs/handoffs/e1a-prova-dal-vivo.md` — diagnosi/stato e lista delle prove

### Modificati
- `src/app/api/documenti-xlsx/route.ts` — da una scheda a quattro (tre per l'admin), letture a pagine, nome file `dati-<residenza>-<data>.xlsx`, fornitori solo se `auth.role === 'super_admin'`
- `src/lib/document-export.ts` — da 12 a 17 colonne
- `src/lib/document-rows.ts` — `dataOrigin`, `correctedFieldLabels`
- `src/lib/document-classification.ts` — `classificationConfidenceBand`
- `src/lib/unit-utils.ts` — `compareUnitLabels`
- `src/lib/activity-event-view.ts`, `src/types/database.ts` — nuovo tipo evento
- `src/components/MaintenanceBadge.tsx` — usa le etichette condivise (ri-esporta `OBLIGATION_LABELS`)
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `setDocumentUnit`, validazione unità in `confirmDocument`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — pannello unità, quadro, cause dei fallimenti
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — errore tecnico distinto
- `scripts/verify-document-export.mjs`, `package.json` (script `verify:unitdocs`, `verify:docunit`, `verify:schede`, `verify:batch`), `docs/migrations.log`

### Letti (rilevanti)
- `src/lib/document-access.ts` — `authorizeResidenceActor`, `authorizeDocumentActor`
- `src/lib/document-checklist.ts` — checklist B4 (solo residenza; lo scope `unit` è ignorato)
- `src/lib/document-overrides.ts` — `fieldProvenance`, `overridableKeys`
- `src/lib/maintenance-status.ts` — stato live, invariante promemoria
- `src/lib/activity-log.ts`, `supabase/migrations/049_*.sql` — registro attività append-only
- `src/lib/document-rows.server.ts` — loader condiviso pagina/Excel
- `src/app/api/classify-document/route.ts`, `extract-document/route.ts` — messaggi di errore grezzi
- `docs/handoffs/HANDOFF_b4_checklist_consegna_07_23_11_47.md` — perché B4.5 (unità) era rimandata
- `docs/handoffs/n1-account-nicola-piano.md`, `HANDOFF_b23_isolamento_builder_11_05_15_17.md` — builder di prova e account

## Decisioni chiave
- **Quadro solo su `documents.unit_id`**: l'unità citata nel testo ("interno 3") è un dato libero dell'AI e non si confronta con le etichette. Scartato: matching sul testo (fragile). I documenti che citano un'unità senza essere assegnati si contano in un avviso e si assegnano a mano.
- **Origine del dato a livello di documento, non di campo**: la confidenza per campo non è salvata da nessuna parte. Valori: Da verificare > Non estratto > Corretto a mano > AI > vuoto ("altro"). Il "da verificare" per campo è rimandato a E1b.
- **Confidenza Alta/Media/Bassa**: ≥ 0,8 (la soglia esistente) / 0,6-0,79 / < 0,6. Dati reali al 5/11: da 0,60 a 0,99.
- **"Da verificare" nel quadro più stretto del previsto**: marca la cella solo se la proposta AI non confermata indica proprio quel tipo (e sistema compatibile). Scartato: segnare tutte e tre le celle per ogni documento non classificato dell'unità.
- **Tipi attesi per unità** (D1): APE, planimetria catastale, DiCo con sistema elettrico, costanti in `unit-documents.ts`; nessuna migrazione, lo scope `unit` di `document_checklist_template` non si usa.
- **Promemoria negli Excel** (D3): Stato "Consigliata · ogni X mesi", data vuota, mai "Scaduta", anche con `status` scaduta e data passata.
- **Fornitori per ruolo, alla fonte** (D5): per l'admin la scheda non esiste e la colonna fornitore non c'è; non si lascia alla RLS, che darebbe celle vuote indistinguibili da "nessun fornitore".
- **Migrazione 051 con un solo `ALTER TABLE`** (DROP + ADD della CHECK): mai un istante senza vincolo. Probe INSERT positivo/negativo non eseguito perché il registro è append-only senza DELETE; sostituito da `pg_get_constraintdef`, dichiarato in `docs/migrations.log`.
- **Evento `unit_id`**: destinazione, oppure origine se il documento torna alla residenza. Payload piatto: `document_id, title, doc_type, from_unit_id, to_unit_id`.
- **Gate di `setDocumentUnit`**: `requireCaller` + `authorizeDocumentActor` (stesso perimetro di `authorizeResidenceActor`, risolto dal documento); unità letta con service client e confrontata con la residenza del documento; scrittura dal client di sessione (la RLS resta una seconda barriera).
- **Voci lette a pagine**: una richiesta sola è troncata in silenzio al tetto di righe (default 1000). Scartato: fidarsi del limite.
- **Cause dei fallimenti tradotte, mai `err.message`**: nel ramo `document_error` le route rispondono con il messaggio grezzo dell'SDK/parser; a schermo vanno cause fisse.
- **Scelta per ruolo, non per RLS, dei dati interni**: vedi sopra, fornitori.

## Stato attuale
### Funziona
- `npm run build` e `npm run verify` puliti (tsc + lint), anche su ogni commit
- Script verdi: `verify:export` 61, `verify:schede` 60, `verify:unitdocs` 26, `verify:docunit` 18, `verify:batch` 14, `verify:overrides` 155, `verify:extraction` 91, `verify:evento` 28
- Mutazioni di prova: rompendo la regola del sistema e l'invariante promemoria i test falliscono (3 e 5 casi)
- Migrazione 051 applicata: una sola CHECK su `event_type`, 11 valori, registro invariato a 70 righe, 0 righe fuori dai nuovi valori
- Un xlsx a due fogli generato con la libreria e letto: nomi dei fogli corretti nel `workbook.xml`
- Le 8 query di controllo delle prove girano senza errori (a vuoto)

### Non funziona / da verificare
- **Mai eseguiti**: la UI (pannello unità, quadro, avvisi), la route Excel con una sessione vera, la scrittura di `setDocumentUnit` e `confirmDocument`, le frasi del registro
- **Non provabile da UI**: la pagina "Impossibile caricare i documenti" (guasto lato server) e il rifiuto di un'unità di un'altra residenza (coperto solo da `verify:docunit`)
- **Manca un account admin** nel builder di prova "TEST prova Nicola" (c'è solo `casazero.prova`, super_admin)
- Il login in locale di `casazero.prova` non è stato provato
- Il dev server è fermo: va riavviato
- Tetto `max_rows` del progetto Supabase non verificato; `loadResidenceDocumentRows` non pagina

## Prossimi passi
1. Riavviare `npm run dev` in una finestra PowerShell separata e creare un account admin nel builder di prova (invito da `/admin/administrators`, poi assegnarlo a "Residenza Prova").
2. Eseguire `docs/handoffs/e1a-prova-dal-vivo.md` passo per passo (13 documenti, parte super_admin 1-13, parte admin 14-17), annotando PASSA / NON PASSA per passo.
3. Se un tipo o un sistema vengono classificati male dall'AI, correggerli con "Rivedi classificazione" e riportarlo: è un dato per Nicola.
4. Con le prove verdi, decidere il push dei 17 commit (CI) e verificare in produzione il download come super_admin e come admin.
5. Commit di sola pulizia: unificare `sistemaMatches` con il match di B4 (`document-checklist.ts`) e riportare le etichette duplicate di `ui/Badge.tsx` e `formatRegisteredBy.ts` in `maintenance-labels.ts`.
6. Mettere in backlog: `classify-document` scarta `error` su letture e update (documento che resta "in corso"); batch che si ferma chiudendo la scheda (P1); paginazione di `loadResidenceDocumentRows`; verifica di `max_rows`.
7. E1b: confidenza per campo estratto e "da verificare" per campo (richiede cambio dell'estrazione AI e quasi certamente una migrazione).
8. Ereditato dall'handoff B23: B39v il 6/11 dopo le 07:00 UTC (link nell'email del cron), Step 4 del piano con `casazero.prova` (wizard e impostazioni logo/colore), B40, B41, B42, B46, B44, B5, R10d.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Gate pre-commit
npm run verify

# Script di verifica E1a
npm run verify:export && npm run verify:schede && npm run verify:unitdocs && npm run verify:docunit && npm run verify:batch

# Produzione (solo dopo il push)
npm run build && npm start
```

## Domande aperte
- Quale email usare per l'account admin del builder di prova?
- Dopo la consegna a Nicola, il builder "TEST prova Nicola" e `casazero.prova` restano o si tolgono? (già aperta nel handoff B23)
- Il quadro sta sopra "Da caricare" e non sopra i pulsanti di upload: va bene per "in cima"?
- Un documento con unità già assegnata e un secondo documento dello stesso tipo sulla stessa unità: il quadro mostra il più recente. Serve un segnale di "duplicato"?
- La colonna Piano del riepilogo è vuota per le unità senza `floor` (il wizard non lo imposta sempre): va bene?
- Cosa fare del `HANDOFF_b23_isolamento_builder_11_05_15_17.md` ancora non tracciato (non è di questa sessione)?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: **Una foreign key non è un controllo di perimetro.** Una colonna che punta a un'altra tabella (es. `documents.unit_id` → `units(id)`) accetta qualunque id esistente, anche di un'altra residenza o di un altro builder, e una policy RLS che guarda solo la riga scritta non lo vede. Ogni server action o route che scrive una colonna di questo tipo verifica prima, con una lettura, che la riga puntata appartenga alla stessa residenza (o builder) della riga scritta (`checkUnitAssignment` in `src/lib/document-unit.ts`). Trovata due volte nella stessa sessione: `setDocumentUnit` e `confirmDocument`.
- **Regole di codice ricorrenti**: **Mai fidarsi di una richiesta sola per un export.** PostgREST tronca in silenzio al tetto `max_rows` del progetto (default 1000): un file o un conteggio costruito da una sola richiesta consegna dati incompleti senza errore. Gli export leggono con `fetchAllRows` (`src/lib/supabase/fetch-all.ts`), con ordinamento stabile, e un errore su una pagina ferma tutto: mai un risultato parziale presentato come completo.
- **Regole di codice ricorrenti**: **Il testo grezzo di un errore di route non va mai a schermo.** Nelle route AI il ramo `document_error` risponde con `err.message` dell'SDK o del parser: non è scritto per l'utente e può contenere dettagli interni. L'interfaccia traduce `cause` e status HTTP in una causa fissa (`src/lib/batch-failures.ts`); il messaggio grezzo resta nel log del server e nella console.
- **Invarianti**: **I dati interni del costruttore (fornitori) non escono mai verso l'admin, in nessuna superficie.** Vale per schermo, Excel e PDF: si escludono per ruolo alla fonte (scheda o colonna assente), non si lasciano alla sola RLS, che darebbe celle vuote indistinguibili da "nessun fornitore". Nell'Excel di residenza la scheda Fornitori e la colonna Fornitore delle Scadenze esistono solo per il super_admin.
- **Invarianti**: **L'invariante promemoria vale anche negli export.** In ogni file scaricabile (Excel, PDF) una voce a Modalità Promemoria ha Stato "Consigliata · ogni X mesi", data vuota, e non legge mai `status` né confronta date, qualunque cosa dica il DB. Testato in `scripts/verify-residence-export.mjs` con `status` scaduta e data passata.
- **Metodo di lavoro**: **Un test di una regola di dominio si prova con una mutazione.** Prima del commit di un modulo coperto da uno script `verify:*`, si rompe di proposito la regola (es. `sistemaMatches` che ritorna sempre `true`, il ramo promemoria disattivato) e si controlla che almeno un caso fallisca; poi si ripristina. Un test che passa al primo colpo senza essere mai stato visto fallire non prova niente.

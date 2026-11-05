# Handoff — R10 evento documento_corretto nel registro · 05/11/2026 10:59

## Sommario
CasaZero (Next.js 15 App Router + Supabase, milestone attiva M5). In questa sessione è stato chiuso il commit 6 di R10 (correzione manuale dei campi estratti dai documenti): la migrazione 049 allarga il CHECK di `activity_events` con `documento_corretto`, e ogni correzione o ripristino di un campo scrive ora un evento nel registro, mostrato in /attivita. Il commit è `9830cf2`, pushato su `origin/main` con CI `verify` verde (run 42006698614, success, 1m5s). **Con questo R10 è chiuso**; restano solo le voci di backlog elencate sotto.

## Lavoro completato
- [x] **FASE 0** del commit 6 con numerazione reale (049 libera su disco, in `list_migrations` e in `docs/migrations.log`), CHECK attuale a 9 tipi, posizioni su payload, fallimento del log e testo in /attivita; approvata da Filippo con le risposte 1-4
- [x] **Migrazione 049** applicata via MCP il 2026-11-05 (SQL approvato così com'era); verifiche (a)-(d) PASS; riga in `docs/migrations.log`
- [x] Evento `documento_corretto` scritto dall'helper unico `upsertDocumentFieldOverride` (copre `saveDocumentFieldOverride` e `confirmSupplierProposal`) e da `clearDocumentFieldOverride`
- [x] Frase in /attivita, icona `PencilLine`, etichetta neutra
- [x] Script `verify-correction-event.mjs` (28 casi) con `npm run verify:evento`
- [x] Prova dal vivo su f949ac0f (TEST wizard A): una correzione da Correggi dati e un ripristino, due righe in `activity_events`, due righe in /attivita, console e rete puliti, log del server senza errori
- [x] Pulizia: f949ac0f a 0 override (gli eventi restano, sono eventi veri); server sulla 3000 fermato (porta libera, verificato con `Get-NetTCPConnection`)
- [x] Commit `9830cf2`, push `bfc1251..9830cf2`, CI verde
- [ ] `docs/handoffs/r10-piano.md` non è stato aggiornato con lo "Stato 5/11 sera" (commit 6 fatto): da fare, vedi Prossimi passi

## File toccati
### Creati
- `supabase/migrations/049_activity_event_documento_corretto.sql` — DROP/ADD di `activity_events_event_type_check` con 10 tipi; contratto del payload nei commenti; rimando alla 048 (che non è stata modificata, è già applicata); verifiche (a)-(d) in fondo.
- `scripts/verify-correction-event.mjs` — 28 casi su payload, `isNoopCorrection`, frase e etichette.
- `docs/handoffs/HANDOFF_r10_evento_registro_11_05_10_59.md` — questo handoff.

### Modificati
- `src/lib/document-overrides.ts` — nuove funzioni pure: `overrideFieldLabel`, `isNoopCorrection`, `documentCorrectionPayload`, `documentCorrectionText`, costante `DOCUMENT_CORRECTED_NEUTRAL_LABEL`, tipi `CorrectionSource` e `PreviousOverride`. Import relativi (vedi "Leggi emerse").
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `upsertDocumentFieldOverride` legge la correzione precedente (SELECT per chiave primaria, `error` destrutturato e loggato), fa l'upsert e scrive l'evento salvo salvataggio identico; `clearDocumentFieldOverride` cancella con `.select('value')` e scrive l'evento solo se ha tolto una riga; `getAuthorizedSupplierLinker` restituisce anche `fullName` (stessa select di `profiles`, `full_name` in più); `confirmSupplierProposal` aggiunge `unit_id` e `title` alla select del documento e passa l'attore; commento stantio sul "commit 6" aggiornato.
- `src/lib/activity-event-view.ts` — icona `PencilLine` e etichetta per `documento_corretto` (le due mappe `Record<ActivityEventType, …>`), ramo in `describeActivityEvent` che chiama `documentCorrectionText`.
- `src/lib/document-access.ts` — `unit_id` nel tipo `DocumentForAction` e nella select di `authorizeDocumentActor`.
- `src/types/database.ts` — `'documento_corretto'` nell'union `ActivityEventType`.
- `package.json` — script `verify:evento`.
- `docs/migrations.log` — riga 049 (PASS).

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/activity-log.ts` — `logActivityEvent` non solleva mai e logga su console; `PayloadValue` ammette solo valori piatti (niente `null` negli array): ha deciso "un evento per campo".
- `src/lib/require-caller.ts` — restituisce `{ userId, role, fullName }`, cioè l'attore congelato per il registro.
- `src/app/(dashboard)/admin/residences/[id]/attivita/page.tsx` — compone `"{soggetto} — {frase}"`; unico consumatore della vista.
- `supabase/migrations/043_event_data_consegna_modificata.sql` — precedente per allargare il CHECK e per i test DO con `RAISE EXCEPTION`.
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — precedente `voce_archiviata`: evento solo se `count > 0`, attore dalla sessione.
- DB (sola SELECT): `pg_constraint`, `pg_policies` e conteggi per tipo di `activity_events`; colonne di `documents` (ha `unit_id` e `title`).

## Decisioni chiave
- **Un evento per campo, payload piatto**: Correggi dati salva un campo per chiamata; la proposta fornitore ne scrive fino a due (ragione sociale e P.IVA) e produce due righe. Alternativa scartata: un evento per atto con array paralleli, impossibile perché `PayloadValue` non ammette `null` negli array e qui `null` significa "il documento non lo riporta".
- **Payload**: `document_id, title, doc_type, field_key, action ('impostato'|'ripristinato'), value (solo impostato), had_previous (true|false|null), previous, source ('correggi_dati'|'proposta_fornitore')`. Il titolo è congelato nel payload come in `voce_archiviata`.
- **"Precedente" = correzione manuale precedente, mai il valore AI**: il valore AI può essere sovrascritto da una riclassificazione e richiederebbe più query. `had_previous` distingue "nessuna correzione prima" da "correzione che dichiarava il campo non riportato" (`previous` null).
- **Il ripristino si logga, con lo stesso tipo** (`action: 'ripristinato'`): senza, il registro mostrerebbe una correzione non più in vigore. Un solo tipo, come ragionato nella 043. Se il DELETE non cancella righe ("già al valore AI") non si scrive nulla, perché non è un atto.
- **Salvataggio identico alla correzione già presente: nessun evento** (`isNoopCorrection`). L'override viene riscritto (set_by/set_at) ma non è un atto. Il salvataggio che replica il valore AI senza correzione precedente invece si registra.
- **Il log sta nell'helper unico di scrittura**, non nelle action chiamanti: una sola riga di log copre `saveDocumentFieldOverride` e `confirmSupplierProposal`. Alternativa scartata: loggare nelle due action (duplicazione, e `confirmSupplierProposal` scrive in un ciclo).
- **Il registro non blocca mai l'atto**: `logActivityEvent` non solleva; se la lettura del precedente fallisce si logga e l'override si scrive lo stesso con `had_previous: null`. Lettura precedente e upsert non sono atomici: due salvataggi concorrenti possono lasciare un `previous` datato; accettato.
- **L'attore in `confirmSupplierProposal` non ha una query nuova**: `getAuthorizedSupplierLinker` già leggeva `profiles`, ora seleziona anche `full_name` e lo restituisce; il ruolo è fisso `super_admin` perché quell'helper rifiuta ogni altro ruolo. Alternativa scartata: una seconda SELECT sul profilo.
- **La frase vive in `document-overrides.ts`, non nella vista**: `activity-event-view.ts` importa `@/` e lucide, non è caricabile dagli script con strip-types; la logica della frase, accanto alle etichette dei campi, è verificata da script e la vista si limita a chiamarla. I valori (nuovo e precedente) restano nel payload e non compaiono nella frase.
- **049 come migrazione applicata via MCP dopo approvazione esplicita del SQL** (DROP/ADD di CHECK, approvato da Filippo il 1/11 e riconfermato il 5/11). I test (d) sono due blocchi DO che terminano in `RAISE EXCEPTION`, quindi nessun residuo.
- **Il buco della 029 su disco non si tocca**: va nella voce di backlog sulla ricostruzione delle migrazioni.

## Stato attuale
### Funziona
- `npm run verify` pulito (resta solo il warning preesistente in `src/app/api/reconcile-documents/route.ts:12`); `npm run verify:evento` ✓ 28 casi; `npm run verify:overrides` ✓ 155; `npm run verify:match` tutti i casi ok.
- CI su `main`: run 42006698614 success dopo il push di `9830cf2`.
- DB: CHECK di `activity_events` a 10 tipi, una sola CHECK su `event_type`; `document_field_overrides` vuota; `activity_events` ha 70 righe, di cui 2 `documento_corretto` (prova dal vivo su f949ac0f, ora eventi veri e immutabili).
- Dal vivo su TEST wizard A (`8e309f07-c274-43af-b7a5-7af53fed9a51`), documento f949ac0f (`f949ac0f-ecaf-40ec-94d9-ca5faf13dc41`, titolo «test-r3»), campo Impresa installatrice:
  - correzione: riga con `action: impostato`, `had_previous: false`, `previous: null`, `source: correggi_dati`, `unit_id` null, attore super_admin «Filippo test» dalla sessione;
  - ripristino: riga con `action: ripristinato`, `previous: "Prova Evento srl"`, nessuna chiave `value`;
  - /attivita: `Condominiale — Dato corretto a mano: «test-r3», Impresa installatrice` e `Condominiale — Valore AI ripristinato: «test-r3», Impresa installatrice`;
  - console senza errori (solo l'info React DevTools), rete tutta 200, log del server senza errori e senza `[ACTIVITY LOG]`.

### Non funziona / da verificare
- **Proposta fornitore: evento non provato dal vivo.** Passa dallo stesso helper, ma la lettura di `fullName` nel ramo super_admin di `getAuthorizedSupplierLinker` (e quindi `actor_name` dell'evento con `source: proposta_fornitore`) non è provata.
- **Ramo "il log fallisce" coperto solo da codice** (`src/lib/activity-log.ts:88-90`): l'override resta e l'errore va solo in console; non provato dal vivo perché richiederebbe di rompere il DB.
- **Evento scritto da un admin non provato**: tutte le prove sono state fatte da super_admin. Il ramo `admin` usa `caller.role` e `caller.fullName` di `requireCaller`; la service role bypassa le policy INSERT della 037.
- **`getAuthorizedSupplierLinker` (`documenti/actions.ts:111`) scarta `error` sulla lettura del profilo** (`const { data: profile } = … .single()`): viola la regola di CLAUDE.md sullo scarto di `error`. Preesistente, non toccato su indicazione di Filippo: va in **R1b**.
- **`documenti/page.tsx` scarta `error`** nelle select di `supplier_installations` e fornitori: già in backlog R1b dal 5/11 mattina.
- Excel e PWA residente con installatore corretto a mano non riverificati (stesso loader); avviso di disallineamento non provato dal vivo come admin (`filippoloro02`).
- Ordine delle scritture del 7b provato dal codice (sequenza di `await`), non dai timestamp.

## Prossimi passi
1. **Aggiornare `docs/handoffs/r10-piano.md`** con una sezione "Stato 5/11 sera": commit 6 fatto (`9830cf2`), R10 chiuso, rimandi a questo handoff. Commit docs separato.
2. **R1b**: correggere la lettura senza `error` in `documenti/page.tsx` (select di fornitori e collegamenti) e in `getAuthorizedSupplierLinker` (`actions.ts:111`), con messaggio all'utente che distingua "nessun dato" da "errore, riprova". Commit separato, con FASE 0 prima.
3. **Provare dal vivo la proposta fornitore** (evento con `source: proposta_fornitore`, due righe per nome e P.IVA, `actor_name` valorizzato): serve un fornitore di prova su TEST wizard A e un DELETE di pulizia mostrato prima e approvato (regola del 5/11). Prova anche un admin (`filippoloro02`) che salva una correzione.
4. **R10c** (backlog): pulsante «Collega {impresa effettiva} al posto di {fornitore collegato}»; prima FASE 0 su `maintenance_items.supplier_id` del vecchio fornitore e sul caso `gia_collegato`.
5. **R10b** (backlog): rendere correggibili anche i documenti senza estrazione corrente (decisione del 2/11 ancora aperta).
6. **Ricostruire `docs/migrations.log` per le migrazioni 001-047** (lavoro R8d), tenendo conto che su disco manca la 029 (si passa da 028 a 030) e che `list_migrations` del MCP mostra solo alcune migrazioni.
7. Guard DB sul write-once dei verbali AI: backlog P2, fuori scope R10.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra separata). Per fermarlo davvero non basta
# chiudere il task: verificare la porta e fermare il PID figlio di Next.
npm run dev
# PowerShell: Get-NetTCPConnection -LocalPort 3000 -State Listen

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify

# Verifiche delle funzioni pure (Node 22.x: usare sempre gli script npm, mai node nudo)
npm run verify:evento      # 28 casi
npm run verify:overrides   # 155 casi
npm run verify:match       # 70 casi
npm run verify:export
npm run verify:extraction

# CI
gh run list --limit 1
```

Note operative della sessione: dopo ogni azione server dalla UI aspettare che l'interfaccia segnali il completamento (testo "Modificato a mano" in comparsa, oppure scomparsa della riga "Installatore") prima della SELECT di verifica; `wait_for` accetta il testo come array JSON; gli uid dello snapshot cambiano dopo ogni refresh; i test DO via `execute_sql` tornano come errore con il testo del `RAISE EXCEPTION`, che è l'esito atteso.

## Domande aperte
- **Pulsante «al posto di» (R10c)**: farlo o tenere solo il link? Se sì, cosa fare delle voci del piano (`maintenance_items.supplier_id`) che puntano al vecchio fornitore.
- **R10b**: sintetizzare una riga di estrazione dalle sole correzioni o forzare prima l'estrazione.
- **Handoff precedente** `HANDOFF_r10_integrazione_fornitori_11_05_10_37.md`: questo lo sostituisce nel contenuto, ma non è stato cancellato (il comando di handoff vieta di sovrascrivere). Eliminarlo, come fatto il 5/11 con quello del 2/11?
- **Branch locale `fix/sicurezza-accesso`**: esiste ancora e non è chiaro se sia già integrato in `main`. Non toccato.
- **Dati sensibili nel registro**: i valori (ragione sociale, P.IVA, date) finiscono nel payload di una tabella append-only senza DELETE per nessun ruolo, quindi un errore di battitura resta per sempre. Accettato per ora; da riconsiderare se si decide di mostrare i valori nella frase.

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: L'evento di registro di un dato si scrive nello stesso helper che scrive il dato (`upsertDocumentFieldOverride`), mai nelle action chiamanti. Un solo punto di scrittura = un solo punto di log, e un nuovo chiamante non può dimenticarlo. L'attore (id, ruolo, nome) arriva dal chiamante, che lo ha letto dalla sessione, mai da input.
- **Regole di codice**: Il registro attività registra ATTI, non operazioni: nessun evento per una scrittura che non cambia nulla (salvataggio dello stesso valore già corretto, DELETE a zero righe). Il DELETE usa `.select()` per sapere se ha tolto qualcosa; il precedente nel payload è il valore dello stato corrente che è stato sostituito o tolto, con un flag (`had_previous`) che distingue "nessun precedente" da "precedente null".
- **Regole di codice**: Le frasi del registro che hanno logica (etichette dei campi, ripiego su payload incompleti) vivono in una funzione pura in `src/lib/` con import relativi, verificata da uno script `verify:*`; la vista (`activity-event-view.ts`, che importa `@/` e lucide e non è caricabile da strip-types) si limita a chiamarla. Il payload contiene solo dati, mai testo pronto per lo schermo.
- **Metodo di lavoro**: Per provare un nuovo tipo nel CHECK di `activity_events` si usano due blocchi DO che terminano sempre in `RAISE EXCEPTION` (positivo con INSERT valido, negativo con tipo inventato che deve essere respinto da `activity_events_event_type_check`), seguiti da una SELECT che mostra 0 righe residue: il registro è append-only, quindi un test non deve lasciare righe.

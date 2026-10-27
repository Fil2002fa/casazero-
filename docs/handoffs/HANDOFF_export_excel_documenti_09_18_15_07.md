# Handoff — Export Excel dei documenti · 18/09/2026 15:07

## Sommario
Sessione su un solo blocco: export Excel dei documenti di una residenza dalla pagina Documenti del costruttore, con dodici colonne (titolo, tipo, ambito, unità, data documento, scadenza o formula di validità, installatore, partita IVA, compagnia, numero polizza, classe energetica, oggetto coperto) e tutti i documenti, anche quelli senza estrazione. FASE 0 approvata da Filippo con tutte le assunzioni, poi sei commit da `3d874bc` a `9dedc99`, uno per concern, ciascuno con `npm run verify` verde. Filippo ha aperto il file di Cavaccio in Excel: tutto ok.

## Lavoro completato
- [x] FASE 0 read-only con subagent: pattern di download esistente (route GET, mai server action), confronto librerie xlsx sul registry, gate da riusare, mappa colonne → dati reali, piano in 6 commit. STOP e approvazione esplicita
- [x] `3d874bc` — dipendenza `write-excel-file@4.1.1` (MIT, unica dipendenza `fflate`, già nell'albero via react-pdf: zero pacchetti transitivi nuovi)
- [x] `59662d4` — tipi `DocRow`/`UnitRow`/`ClassificationMetadata` e funzioni `currentExtraction`, `displayDate`, `hasValidity`, `extractionFacts`, `validitySubject` spostati senza modifiche da `DocumentiClient.tsx` a `src/lib/document-rows.ts`; select documenti + normalizzazione embed spostate da `page.tsx` a `loadResidenceDocumentRows`
- [x] `6f01968` — `authorizeResidenceActor` in `src/lib/document-access.ts`; `api/fascicolo-pdf` migrata come prova di equivalenza (otto casi identici prima e dopo, via `git stash`); commento in `manutenzioni/actions.ts` aggiornato perché citava righe rimosse
- [x] `63b440e` — `src/lib/document-export.ts` (modulo puro, 12 colonne, celle tipizzate) + `scripts/verify-document-export.mjs` (`npm run verify:export`, 27 casi); `documentFacts` in `document-rows.ts` come fonte unica dei valori estratti; import di `document-rows.ts` resi relativi
- [x] `1410e49` — route `GET /api/documenti-xlsx?residenceId=UUID`
- [x] `9dedc99` — link "Esporta Excel" nello slot `actions` di `PageHeader` in `documenti/page.tsx`
- [x] Prova in Excel da parte di Filippo sul file di Residenza Cavaccio: ok

## File toccati
### Creati
- `src/lib/document-rows.ts` — riga documento della pagina Documenti (`DocRow`, `UnitRow`, `ClassificationMetadata`) e funzioni pure condivise tra schermo ed export: `currentExtraction`, `displayDate`, `hasValidity`, `documentFacts` (tipo `DocumentFacts`: installatore, partitaIva, ambito etichettato, unitaRiferimento, oggetto, rilasciataDa, classeEnergetica, compagnia, numeroPolizza, validUntil, validityFormula), `extractionFacts`, `validitySubject`. Import relativi tra moduli di lib
- `src/lib/document-rows.server.ts` — `loadResidenceDocumentRows(supabase, residenceId)`: select documenti con embed `document_extractions(...)` normalizzato con `normalizeEmbed`, più `units(id, label)`; `error` destrutturato e loggato con prefisso `[document-rows]`, restituito al chiamante come `error: string | null`. Va chiamato col client di SESSIONE
- `src/lib/document-export.ts` — `DOCUMENT_EXPORT_HEADERS` (12), tipo `ExportCell` (`{type:'text'}` | `{type:'date', value ISO}` | null), `documentExportRow(doc, unitLabel)`, `documentExportRows(docs, units)`: prima i documenti di residenza nell'ordine ricevuto, poi le unità in ordine naturale di etichetta (`localeCompare` numeric, come `residences/[id]/page.tsx:107`), poi eventuali orfani. Unità via `formatUnitLabel`
- `src/app/api/documenti-xlsx/route.ts` — route GET, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`; `getUser` con `error` destrutturato (401 sessione assente, 500 su `isAuthRetryableFetchError`); gate `authorizeResidenceActor` col service client; dati dal loader col client di sessione; foglio "Documenti", intestazione in grassetto e bloccata, larghezze colonne, date come `Date.UTC` con `format: 'dd/mm/yyyy'`, nome file ASCII `documenti-<slug>.xlsx`, `Cache-Control: no-store`
- `scripts/verify-document-export.mjs` — 27 casi: intestazioni, non classificato, data da `created_at`, DiCo con P.IVA `01234567890` che resta testo, ragione sociale vuota, garanzia, polizza con formula, APE di unità, estrazione non attuale, estrazione saltata, 12 celle per riga, nessuna cella testo vuota, ordine righe, `documentFacts`/`extractionFacts`/`validitySubject`
- `docs/handoffs/HANDOFF_export_excel_documenti_09_18_15_07.md` — questo documento

### Modificati
- `package.json` / `package-lock.json` — dipendenza `write-excel-file ^4.1.1`; script `verify:export`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — solo righe rimosse e import da `@/lib/document-rows` (diff: 10 righe aggiunte, 157 tolte). Nessun cambio di comportamento
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — usa `loadResidenceDocumentRows` al posto della select inline; `actions` di `PageHeader` con `<a href="/api/documenti-xlsx?residenceId=..." download>` "Esporta Excel", icona `FileDown`, stile del download della pagina Fascicolo, reso solo se `docs.length > 0`, identico per super_admin e admin. L'errore del loader qui rende la lista vuota come prima (già loggato lato server)
- `src/lib/document-access.ts` — aggiunti `ResidenceForAction`, `ResidenceActorResult`, `authorizeResidenceActor(admin, userId, residenceId, logPrefix)`. Convenzione di stato ereditata da fascicolo-pdf: 403 "Accesso negato" (ruolo sbagliato, residenza fuori perimetro), 404 "Residenza non trovata" (anche id non UUID, codice Postgres `22P02`), 500 "Errore tecnico, riprova" su errore di lettura. `maybeSingle()` per distinguere "non trovata" da errore
- `src/app/api/fascicolo-pdf/route.ts` — blocco di autorizzazione inline (profilo, residenza, ramo super_admin/admin) sostituito da `authorizeResidenceActor(..., '[fascicolo-pdf]')`. Unica differenza di comportamento, voluta: errore tecnico → 500 invece di 403/404
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts` — solo commento: non cita più `fascicolo-pdf/route.ts:50-61` (righe rimosse) e indica l'helper condiviso come destinazione della migrazione

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/api/report/route.ts` — seconda route PDF, gate inline alle righe 137-149 (ancora da migrare)
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx`, `src/app/(app)/fascicolo/page.tsx` — pattern `<a href download>` in `PageHeader actions`
- `src/components/PageHeader.tsx` — slot `actions` (riga 58, dentro un `div`)
- `src/app/api/extract-document/route.ts:124-185` — `cleanString`/`normalizeTypedFields`: i campi stringa in `fields` sono sempre stringa ripulita o null (giustifica `nonEmpty` in `documentFacts`)
- `src/app/api/classify-document/route.ts:304-305` — installatore e P.IVA nascono qui in `extracted_metadata`, solo per DiCo. **Non toccato**
- `src/lib/document-extraction.ts` — `validityFormula`, `computeValidUntil`, `normalizeIsoDate`, `FIELD_KEYS`, tipi dei `fields`
- `src/app/(dashboard)/admin/residences/[id]/page.tsx:98-108` — ordinamento naturale delle unità
- `supabase/migrations/001_schema.sql` (`documents.unit_id`, `units`), `040_document_extractions.sql`
- `node_modules/write-excel-file/node/index.d.ts`, `types/SheetData.d.ts`, `modules/xlsx/helpers/convertDateToSerialNumber.js` — API v4 (`writeXlsxFile(data, opts).toBuffer()`), conversione date via `getTime()` cioè UTC
- `scripts/ts-resolve-hooks.mjs`, `scripts/verify-extraction.mjs` — pattern degli script di verifica con strip-types

## Decisioni chiave
- **Route GET, non server action**: nel repo ogni file scaricabile passa da una route GET con `<a download>` (`api/report`, `api/fascicolo-pdf`); nessuna server action restituisce binari. Una server action avrebbe portato il binario in base64 nel payload RSC con ricostruzione Blob lato client
- **`write-excel-file` invece di `xlsx`/`exceljs`**: `xlsx` su npm è ferma a 0.18.5 con vulnerabilità note; `exceljs` porta 9 dipendenze (jszip, archiver, unzipper) e 21,8 MB. `write-excel-file` ha una sola dipendenza già installata e tipi inclusi. Approvata da Filippo
- **Gate condiviso a livello residenza con migrazione di fascicolo-pdf come prova**: la logica "super_admin del builder o admin assegnato" era duplicata in 4 punti con commento "unificare"; una quinta copia avrebbe violato la regola sugli helper condivisi. Convenzione 403/404 di fascicolo-pdf mantenuta (non quella 404/404 di `authorizeDocumentActor`) perché la migrazione fosse verificabile a esiti identici
- **Id non UUID come 404 via codice `22P02`**, non con una regex: l'unica regex UUID è locale in `documenti/actions.ts:191`, una seconda copia sarebbe stata un duplicato
- **Dati col client di sessione, service role solo per il gate**: la route legge i documenti dallo stesso loader della pagina, così l'export ha il perimetro RLS della pagina e le stesse righe
- **`documentFacts` come fonte unica dei valori estratti** invece di ricalcolare in `document-export.ts`: `extractionFacts` e `validitySubject` ora passano da lì. Prova di identità dello schermo: versione vecchia (da `git show`) e nuova eseguite su tutti i 38 documenti reali del DB, 190 confronti, 0 differenze
- **Celle tipizzate nel modulo puro, conversione nella route**: `document-export.ts` non importa la libreria xlsx ed è verificabile da script; la route traduce `ExportCell` in celle `write-excel-file`
- **Date come date Excel, P.IVA e numero polizza come testo**: date ordinabili e filtrabili; come numero la P.IVA perderebbe lo zero iniziale (Bortoluzzi `01847320938`)
- **"Unità" = unità assegnata all'upload** (`documents.unit_id`), non quella citata nel testo, che resta nella colonna Ambito ("Unità: interno 3"). Assunzione approvata
- **Ordine righe**: residenza prima, poi unità in ordine naturale di etichetta (approvato). Lo schermo invece ordina i gruppi di unità per prima apparizione
- **Bottone nascosto senza documenti**, stesso link per super_admin e admin, nessuna variante di pagina né JSX duplicato
- **Import relativi in `document-rows.ts`**: lo script con strip-types risolve solo import relativi (`ts-resolve-hooks.mjs`); stesso stile già usato da `document-extraction.ts`

## Stato attuale
### Funziona
- `npm run verify` verde su tutti e 6 i commit (solo il warning noto su `reconcile-documents/route.ts:12`); `npm run verify:export` 27 casi; `npm run verify:extraction` 91 casi
- Test di mutazione: rendendo la P.IVA numerica, `verify:export` fallisce con exit 1 sul caso DiCo
- `GET /api/fascicolo-pdf`, otto casi identici prima e dopo la migrazione: 307 senza sessione (middleware), 400 parametro mancante, 200 PDF super_admin su Cavaccio (5645 B), 403 admin non assegnato, 200 admin assegnato su "test atomico", 403 residente, 404 UUID inesistente, 404 id non UUID
- `GET /api/documenti-xlsx`, stessi otto casi con gli stessi esiti; file di Cavaccio `documenti-residenza-cavaccio.xlsx`: 27 righe dati, 336 celle identiche alle righe calcolate dal DB, foglio "Documenti", intestazione in grassetto e bloccata, date con formato `dd/mm/yyyy`, P.IVA come stringhe condivise
- Pagina Documenti: link presente come super_admin su Cavaccio, assente su "test atomico" (0 documenti) sia per super_admin sia per admin
- Apertura in Excel verificata da Filippo

### Non funziona / da verificare
- **Lettura RLS di un admin su una residenza con documenti non esercitata**: filippoloro02 è assegnato solo a "test atomico" e "Test manutenzione", entrambe senza documenti. I documenti stanno in Cavaccio (27), Teolo (6), Arcella (3), "test documenti" (1), "test 01" (1)
- **Due utenti admin illeggibili dall'admin API**: `auth.admin.getUserById` risponde "Database error loading user" per due profili admin (uno assegnato a dublin, Arcella, "test after redesign", Teolo; l'altro senza assegnazioni), e `auth.admin.listUsers` risponde "Database error finding users". Non indagato
- **Pagina Documenti per admin non assegnato risponde 200** con il contenuto "non trovato" (marker 404 presente, nessun dato): effetto dello streaming di `src/app/(dashboard)/loading.tsx`. Preesistente
- **Nomi file non ASCII in `api/fascicolo-pdf` e `api/report`**: `Content-Disposition` costruito dal nome residenza senza traslitterazione; una residenza con accento può rompere l'header. La route nuova usa uno slug ASCII
- **`main` avanti di 18 commit su `origin/main`**: nessun push richiesto né eseguito; ogni push su main fa deploy in produzione
- **Handoff precedente non tracciato**: `docs/handoffs/HANDOFF_estrazione_documenti_09_18_14_21.md` è ancora `??` in git status
- `npm audit` segnala 6 vulnerabilità preesistenti (next, postcss, sharp, nanoid, js-yaml, brace-expansion), nessuna dal nuovo pacchetto

## Prossimi passi
1. **Push** quando Filippo decide (18 commit: 12 della sessione estrazione + 6 di questa).
2. **Decidere il punto 4 dell'handoff precedente** (sistema incoerente sugli APE, tre opzioni in `HANDOFF_estrazione_documenti_09_18_14_21.md`): ancora aperto.
3. **Commit di sola pulizia sui gate**: migrare `api/report/route.ts:137-149` e `manutenzioni/actions.ts:103-115` a `authorizeResidenceActor`, con la stessa prova di equivalenza prima/dopo usata per fascicolo-pdf. `classify-document` solo se Filippo toglie il vincolo "byte-identica" del 18/09.
4. **FASE 0 sugli utenti admin illeggibili**: diagnosi read-only di perché `getUserById`/`listUsers` falliscono (probabile riga `auth.users` con colonne a NULL). Serve anche per provare l'export admin con dati.
5. **Prova export come admin con documenti**: dopo il punto 4, oppure con un'assegnazione di filippoloro02 a Cavaccio applicata da Filippo nel SQL Editor (DELETE + INSERT su `admin_assignments`, stato corrente), scaricare il file e confrontare le righe con quelle del super_admin.
6. **Nome file ASCII anche in fascicolo-pdf e report**: estrarre lo slug della route nuova in un helper condiviso e usarlo nelle tre route (commit dedicato).
7. **Tracciare o archiviare** `HANDOFF_estrazione_documenti_09_18_14_21.md` insieme a questo handoff.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# verifiche delle funzioni pure
npm run verify:export       # 27 casi, export Excel e funzioni di riga
npm run verify:extraction   # 91 casi, estrazione dati

# commit di questa sessione
git log --oneline efc9dc7..HEAD

# export a mano (dev server attivo, sessione nel browser)
# http://localhost:3000/api/documenti-xlsx?residenceId=45196dac-bd81-4368-9452-1c066652e464
```

```sql
-- Documenti per residenza (sola lettura)
SELECT r.name, count(d.id) AS documenti
  FROM residences r LEFT JOIN documents d ON d.residence_id = r.id
 GROUP BY r.name ORDER BY documenti DESC;

-- Assegnazioni admin correnti (sola lettura)
SELECT a.profile_id, r.name
  FROM admin_assignments a JOIN residences r ON r.id = a.residence_id
 ORDER BY a.profile_id, r.name;
```

## Domande aperte
- **Ordine dei gruppi di unità a schermo**: l'export ordina per etichetta naturale, la pagina per prima apparizione del documento. Allineare la pagina all'export?
- **Gate di classify-document**: il vincolo "byte-identica" del 18/09 vale ancora, o si può migrare anche quella copia a `authorizeResidenceActor`?
- **Utenti admin illeggibili dall'admin API**: dati demo da ricreare o da riparare? Tocca `auth.users`, quindi è una decisione di Filippo.
- **Punto 4 e domande sulle polizze e sul costo del batch** dell'handoff precedente: ancora aperti.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice ricorrenti**: `Le funzioni che ricavano un valore mostrato (data in riga, fatti estratti, etichette) vivono in src/lib, mai dentro un modulo 'use client': una route API o uno script non possono importare da lì, e la seconda superficie (export, PDF) finirebbe per ricalcolare il valore inline. Esempio: document-rows.ts, condiviso da DocumentiClient e api/documenti-xlsx.`

- **Sezione Regole di codice ricorrenti**: `I moduli di src/lib verificati da uno script con --experimental-strip-types importano gli altri moduli di lib con percorsi relativi ('./formatDate'), mai con '@/': scripts/ts-resolve-hooks.mjs risolve solo import relativi. Gli import type-only con '@/' restano ammessi perché lo stripping li cancella.`

- **Sezione Regole di codice ricorrenti**: `Con error destrutturato, .single() trasforma "nessuna riga" in un errore: quando "non trovato" è un esito di dominio usare .maybeSingle(). Un id non UUID produce il codice Postgres 22P02, che è un esito di dominio (404), non tecnico. Per auth.getUser: sessione assente = 401, isAuthRetryableFetchError = 500 loggato.`

- **Sezione Regole di codice ricorrenti**: `File scaricabili (PDF, xlsx): route GET con runtime nodejs e dynamic force-dynamic, gate authorizeResidenceActor, Content-Disposition attachment con nome file solo ASCII, Cache-Control no-store, link <a href download> nello slot actions di PageHeader. Mai una server action che restituisce binari. Nei fogli di calcolo le date sono date (Date.UTC con format esplicito), P.IVA e numeri di polizza sono testo.`

- **Sezione Metodo di lavoro**: `Prova di equivalenza per refactor e migrazioni a helper condivisi: stessi casi eseguiti sul codice vecchio e sul nuovo, esiti affiancati e confrontati con diff (per le route: git stash delle modifiche con il dev server attivo, poi stash pop; per funzioni di rendering: versione vecchia presa da git show ed eseguita sugli stessi dati reali letti in sola lettura). Si riporta il numero di confronti e di differenze, mai "comportamento invariato" senza numeri.`

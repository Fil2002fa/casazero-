# Handoff — Estrazione dati documenti e ridisegno pagina Documenti · 18/09/2026 14:21

## Sommario
Sessione lunga su un solo blocco: estrazione di dati reali dai documenti classificati (seconda chiamata AI, separata dalla classificazione che resta byte-identica) e ridisegno della pagina Documenti del costruttore in tre blocchi (Da caricare, Scadenze, archivio con dati estratti). Dodici commit da `fca5185` a `efc9dc7`, uno per concern, tutti con `npm run verify` verde; la migrazione 040 è stata applicata da Filippo nel SQL Editor. In chiusura una FASE 0 sul sistema incoerente dell'APE (valore umano, non dell'AI), riportata con STOP: la decisione è ancora aperta.

## Lavoro completato
- [x] FASE 0 iniziale (subagent read-only + due probe DB in sola lettura): schema AI, migrazione, sorte dei 27 documenti di Cavaccio, riuso di `computeResidenceChecklist`, piano commit
- [x] `fca5185` — migrazione 040 `document_extractions` (tabella 1:1, RLS SELECT delegata a `documents`, scrittura solo service role). **Applicata da Filippo**, verificata: tabella esistente e vuota prima delle prove
- [x] `bd490ce` — `src/lib/document-extraction.ts` (fonte unica: vocabolari, chiavi per doc_type, `computeValidUntil`, `extractionIsCurrent`, `needsExtraction`, `upcomingDeadlines`), `src/lib/formatDate.ts` (`formatDateIT`, unico formatter dei blocchi nuovi), `scripts/verify-extraction.mjs` (`npm run verify:extraction`)
- [x] `66e3cef` — route `POST /api/extract-document`: schema di output scelto dal codice in base al doc_type finale, prompt unico cacheable, upsert su `document_extractions`; `src/lib/document-access.ts` (gate super_admin/admin con `error` destrutturato), helper PDF in `document-upload.ts`
- [x] Prova a mano degli 8 casi dal terminale con sessione generata via admin API (magic link + verify), risultati riportati caso per caso: 7/8 conformi, il caso polizza corretto ma senza date nel PDF
- [x] `d6c1aa8` — `model = null` nelle righe `saltata`
- [x] `9ded007` — polizza decennale con `durata_anni` + `evento_decorrenza`, `validityFormula` ("10 anni dalla data di fine lavori"), `scripts/ts-resolve-hooks.mjs`; ri-estrazione della polizza verificata (durata 10, evento "emissione del certificato di collaudo", valid_until null)
- [x] `835c623` — bottone "Estrai dati (N)", estrazione automatica in coda alla classificazione e alla conferma umana, embed di `document_extractions` in `page.tsx`
- [x] `3e61b59` — blocco "Da caricare (N)" + riga "Escluse dalla consegna (N)" al posto della checklist a riquadri; `document-checklist.ts` invariato (zero righe nel diff)
- [x] `a960162` — blocco "Scadenze" (sei voci, scadute in cima, formula al posto della data quando non calcolabile, data odierna dal server come prop)
- [x] `8bc00b2` — archivio con fatti estratti in riga, ricerca estesa, filtri ambito e "Con scadenza"
- [x] `8e7d592`, `8827520`, `efc9dc7` — rifiniture: titolo leggibile (`humanizeDocumentTitle`), riga secondaria di Scadenze con l'oggetto, "Non applicabile" con aspetto di azione
- [x] FASE 0 punto 4 (APE con `sistema = 'ascensore'`): diagnosi riportata, STOP inviato
- [ ] Decisione di Filippo sul punto 4 (tre opzioni proposte, vedi Domande aperte)
- [ ] Prova a schermo dei blocchi da parte di Filippo (i passi sono in fondo all'ultimo messaggio della sessione e ripetuti in Prossimi passi)

## File toccati
### Creati
- `supabase/migrations/040_document_extractions.sql` — tabella `document_extractions` (PK+FK `document_id`, `for_doc_type`, `status` completata/saltata/fallita, `document_date`, `ambito`, `unita_riferimento`, `valid_until`, `fields` JSONB, `model`, timestamps), trigger `set_updated_at`, RLS SELECT via `EXISTS` su `documents` con riferimento qualificato, REVOKE come 031/032, sei query di verifica con footer da compilare
- `src/lib/document-extraction.ts` — fonte unica dell'estrazione: `Ambito`/`AMBITI`/`AMBITO_LABELS`, `CLASSI_ENERGETICHE`, tipi `GaranziaFields`/`ApeFields`/`PolizzaFields`, `FIELD_KEYS`, `isExtractableDocType`, `isTypedDocType`, `emptyFields`, `normalizeIsoDate`, `addYearsIso`, `computeValidUntil`, `validityFormula`, `DocumentExtractionRow`, `extractionIsCurrent`, `needsExtraction`, `upcomingDeadlines`, `validityEntries`
- `src/lib/formatDate.ts` — `formatDateIT('2026-09-12') → '12 set 2026'`, deterministico senza `toLocaleDateString`; intestazione con il debito annotato (26 occorrenze inline in 22 file, elencate)
- `src/lib/documentTitle.ts` — `humanizeDocumentTitle`: underscore in spazi, prima maiuscola, resto intatto
- `src/lib/document-access.ts` — `authorizeDocumentActor(admin, userId, documentId, logPrefix)`: super_admin del builder o admin assegnato, 404 su entrambi i rami negativi, `error` sempre destrutturato e loggato
- `src/app/api/extract-document/route.ts` — seconda chiamata AI (Sonnet 5, thinking disattivato, structured output con `format: date`), schema per doc_type, normalizzazione, upsert; 409 `not_extractable`, 503 servizio senza riga, 500 su errore DB, 502 `document_error` con riga `fallita` che non sovrascrive dati buoni
- `scripts/verify-extraction.mjs` — 91 casi su funzioni pure (`npm run verify:extraction`)
- `scripts/ts-resolve-hooks.mjs` — hook `module.register` che risolve `./modulo` → `./modulo.ts` per gli script con strip-types
- `docs/handoffs/HANDOFF_estrazione_documenti_09_18_14_21.md` — questo documento

### Modificati
- `package.json` — script `verify:extraction`
- `src/lib/document-upload.ts` — aggiunti `MAX_PDF_BYTES_FOR_API` e `hasPdfMagicBytes` (additivo; `classify-document` tiene la sua copia)
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — select con embed `document_extractions(...)`, normalizzato con `normalizeEmbed`; prop `today={todayISO()}`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — `DocRow.extraction`; stato e loop `extractDocuments`; bottone "Estrai dati (N)"; concatenazione dopo classificazione e dopo `confirmClassification` (prop `onConfirmed` su `ReviewPanel`, `onClassificationConfirmed` su `DocCard`); `MissingDocumentsSection`/`MissingRow`/`ExcludedRow` al posto di `ChecklistSection`/`ChecklistItemRow`; `DeadlinesSection`; `currentExtraction`, `displayDate`, `hasValidity`, `extractionFacts`, `validitySubject`, `searchText`; filtri ambito e "Con scadenza"; titoli con `humanizeDocumentTitle`
- `src/lib/document-extraction.ts`, `scripts/verify-extraction.mjs` — estesi nei commit successivi (polizza, `validityEntries`, titolo)

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/api/classify-document/route.ts` — schema a 7 campi, prompt, validazione, scrittura: **non toccato** in nessun commit (verificato con `git diff 4352548 HEAD --stat` = vuoto)
- `src/lib/document-checklist.ts` — regola di match e reduce dei counts: **non toccato**
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `confirmClassification` (valida solo l'appartenenza di `sistema` a `SISTEMI`), `setChecklistException`/`clearChecklistException`
- `supabase/migrations/001, 002, 024-028, 031` — schema `documents`, RLS, pattern grants
- `node_modules/@supabase/ssr/dist/main/utils/chunker.js`, `cookies.js` — per costruire il cookie di sessione nelle prove da terminale

## Decisioni chiave
- **Due chiamate AI separate, classificazione intatta**: estendere lo schema unico avrebbe portato a ~20 campi nullable senza alcun eval per misurare la regressione sui 7 esistenti. La route di classificazione non ha una riga nel diff. Alternativa scartata: unione discriminata `anyOf` a 18 rami.
- **Tabella separata `document_extractions`, non colonne su `documents`**: ciclo di vita diverso (legata a `for_doc_type`, riestraibile, invalidata dalla riclassificazione umana); `extracted_metadata` è il verbale write-once e due rami della route lo sovrascrivono già. Colonne tipizzate solo per ciò che si ordina o filtra, `fields` JSONB per il resto.
- **`valid_until` calcolata in TS, mai chiesta all'AI**: garanzia = inizio + durata, APE = valida_fino_al, polizza = scadenza esplicita altrimenti decorrenza + durata, altrimenti null con formula in chiaro. Verificata da script, non da generated column.
- **Polizza con durata ed evento di partenza** (decisione di Filippo dopo la prova): le polizze reali dicono "10 anni da un evento"; l'AI non deduce mai date. Collegamento alla fine lavori della residenza NON fatto: in schema esiste solo `residences.delivery_date`.
- **`ambito` non alimenta mai `unit_id`**: quella colonna decide chi vede il documento (`czero_can_access_unit`). `unita_riferimento` è testo informativo.
- **Stessa pagina anche per l'amministratore** (accettato da Filippo): `page.tsx` e `DocumentiClient` sono condivisi, si ramifica solo sulle prop esistenti. Nessun JSX duplicato.
- **Riga "Escluse dalla consegna" subito sotto Da caricare, resa anche senza Da caricare**: un'esclusione è una decisione del costruttore che deve restare visibile e reversibile.
- **Scadenze con date nude, nessun colore di allarme**: "Scaduta il" è un fatto di calendario nello stesso colore. Il divieto del lessico scadenza copre promemoria e badge di classificazione, non la validità di polizze, garanzie e APE.
- **Un solo formatter data per i blocchi nuovi**, le 26 date inline restanti annotate come debito e non toccate (decisione esplicita di Filippo).
- **Modello Sonnet 5 per l'estrazione**, per parità con la classificazione (il default della skill sarebbe Opus 5).
- **Prove dal terminale con sessione generata via admin API** (magic link generato con service role e verificato, cookie costruito con le funzioni di `@supabase/ssr`): Filippo non poteva usare la console del browser. Il file di sessione è sempre stato cancellato a fine prova.

## Stato attuale
### Funziona
- `npm run verify` verde su tutti e 12 i commit (lint con il solo warning noto su `reconcile-documents/route.ts:12`); `npm run verify:extraction` 91 casi verdi
- Migrazione 040 applicata; 6 righe in `document_extractions` su Cavaccio dalle prove (5 `completata`, 1 `saltata`)
- Route provata su 8 casi: garanzia caldaia `valid_until` 2029-03-10; APE classe A2, ambito unità "interno 3", 2034-02-20; DiCo termico data 2025-03-28 senza campi tipizzati; garanzia coperture 2035-02-12; polizza con durata 10 ed evento; 409 sul volantino (`altro`); `saltata` sul non-PDF; rilancio idempotente
- Pagina Documenti di Cavaccio resa con sessione super_admin dopo ogni commit UI: bottone "Estrai dati (13)", "Da caricare", "Escluse dalla consegna", "Scadenze" con quattro voci, fatti in riga, filtri "Tutti gli ambiti" e "Con scadenza (4)"

### Non funziona / da verificare
- **Nessuna prova a schermo da parte di Filippo**: i passi sono in Prossimi passi. Le prove di questa sessione sono HTTP + HTML, non visive.
- **Bottone "Estrai dati (13)" non premuto**: i 13 candidati sono per lo più rifiuti di test riclassificati a mano; ogni click costa chiamate AI.
- **Riga `saltata` di `test-grande` con `model = 'claude-sonnet-5'`**: scritta prima della correzione, l'upsert delle saltata non sovrascrive. Dato di test, si sistema con la pulizia di Cavaccio.
- **Sistema incoerente su due APE** (`ascensore`, `gas`): prodotti dal pannello di revisione, non dall'AI. Decisione aperta (punto 4).
- **`main` avanti di 12 commit su `origin/main`**: nessun push richiesto né eseguito. Ogni push su main fa deploy in produzione.

## Prossimi passi
1. **Prova a schermo** su Residenza Cavaccio come pippoloro02: (a) "Da caricare (N)" con ambito accanto, nessuna frazione né pallino; (b) "Non applicabile" su una voce → campo Motivazione, Conferma disabilitato finché vuoto, la voce passa in "Escluse dalla consegna"; (c) apri "Escluse", "Annulla esclusione" la riporta su; (d) "Scadenze": garanzia caldaia 10 mar 2029, APE 20 feb 2034, garanzia coperture 12 feb 2035, polizza con "10 anni dalla data di emissione del certificato di collaudo"; (e) archivio: DiCo VMC "Installatore: Clima Nordest S.r.l. · Residenza", APE "Unità: interno 3 · Classe A2 · Valida fino al 20 feb 2034"; (f) ricerca "Clima Nordest", "DEC-2026", "interno 3"; (g) filtri ambito e "Con scadenza (4)", tasto ✕; (h) come filippoloro02 la pagina è la stessa senza le azioni sulle esclusioni.
2. **Decidere il punto 4** (sistema incoerente): opzione 1 = costante `SISTEMA_APPLICABLE_DOC_TYPES` in `document-classification.ts` usata da `confirmClassification` (rifiuto), pannello di revisione (select disabilitato/svuotato) e route (azzeramento come per l'installatore, una riga nella scrittura); opzione 2 = solo action + pannello; opzione 3 = bonifica SQL dei due APE.
3. **Se si vuole popolare Cavaccio**: premere "Estrai dati (13)" una volta; oppure prima la pulizia dei rifiuti di test già in priorità.
4. **Debiti annotati, da aprire come commit di sola pulizia quando si vuole**: le 26 date inline (elenco in `formatDate.ts`); le copie di gate di autorizzazione e magic bytes in `classify-document` e `api/report` (candidate a migrare su `document-access.ts` e `document-upload.ts`); il collegamento della polizza a una data di fine lavori (non esiste in schema).
5. **Push** quando Filippo decide.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# verifica delle funzioni pure dell'estrazione (91 casi)
npm run verify:extraction

# commit di questa sessione
git log --oneline 4352548..HEAD
```

```sql
-- Stato delle estrazioni su Cavaccio (SQL Editor, sola lettura)
SELECT d.title, e.for_doc_type, e.status, e.document_date, e.ambito,
       e.unita_riferimento, e.valid_until, e.fields, e.model
  FROM document_extractions e JOIN documents d ON d.id = e.document_id
 ORDER BY e.extracted_at;

-- I due APE con sistema incoerente (punto 4), sola lettura
SELECT id, title, doc_type, sistema, reviewed_by, reviewed_at
  FROM documents WHERE doc_type = 'ape' AND sistema IS NOT NULL;
```

## Domande aperte
- **Punto 4, sistema incoerente con il doc_type**: quale delle tre opzioni? La 1 tocca la scrittura della route di classificazione (una riga, azzeramento per tipo come già per l'installatore): rientra nella "classificazione intatta" decisa a inizio sessione?
- **Ambiguità nelle polizze**: la polizza di test cita due eventi diversi (collaudo per la decorrenza, ultimazione lavori per la durata); il modello ha preso il primo. Va bene così o si vuole un campo per entrambi?
- **Costo del batch su residenze grandi**: ogni documento non-`altro` fa una seconda chiamata (~2.000-3.000 token in input). Accettabile per il pilota, da misurare su una consegna reale.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: `L'AI non scrive mai documents.unit_id. Quella colonna decide chi vede il documento (czero_can_access_unit): resta una scelta umana all'upload. Un'unità citata nel testo (unita_riferimento, ambito) è informazione mostrata, mai una FK assegnata da un modello.`

- **Sezione Regole di codice ricorrenti**: `Dati estratti dall'AI: mai chiedere al modello un valore calcolabile (scadenza = inizio + durata). Si estraggono i fatti scritti nel documento, il calcolo vive in un helper TS puro verificato da script (computeValidUntil). Un valore che il documento non riporta resta null: un null è sempre preferibile a un valore dedotto.`

- **Sezione Regole di codice ricorrenti**: `Una data confrontata con "oggi" nel render di un client component (scaduta/non scaduta) va calcolata sul server e passata come prop (todayISO in page.tsx): letta nel client darebbe testo diverso tra server e browser a cavallo della mezzanotte, cioè un mismatch di hydration. Stessa famiglia del formatter deterministico formatDateIT, che evita toLocaleDateString per lo stesso motivo.`

- **Sezione Metodo di lavoro**: `Prove a mano di route autenticate dal terminale: quando la console del browser non è disponibile, la sessione si ottiene con l'admin API (generate_link magiclink con service role + /auth/v1/verify) e il cookie si costruisce con le funzioni di @supabase/ssr (prefisso base64-, chunk da 3180). Il file di sessione vive solo nello scratchpad e si cancella a fine prova; l'esito si riporta caso per caso con atteso vs reale.`

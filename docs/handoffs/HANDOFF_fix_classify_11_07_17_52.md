# Handoff — Fix classify-document · 07/11/2026 17:52

## Sommario
Corretto `/api/classify-document`, che scartava in silenzio gli `error` di Supabase: un guasto tecnico diventava 401/403/404 oppure un 200 con il documento bloccato su `in_corso`. Ora ogni guasto è un 500 "Errore tecnico, riprova", gli stati transitori hanno sempre una via di ritorno e tutto è provato con un client finto e dal vivo. Commit `df80899` (fix, già in `origin/main`) e `fcb490d` (solo docs, **non pushato**).

## Lavoro completato
- [x] Confronto del piano `docs/handoffs/fix-classify-piano.md` con il codice dopo E1b 8 e 9: route invariata, solo le righe di `DocumentiClient.tsx` spostate
- [x] A-E: autenticazione e letture tramite `authorizeDocumentActor`, più `error` di `getUser()` (`sessionOutcome`)
- [x] F-H: update su `documents` controllati (`writeDocumentState` → `ClassificationWriteError` → 500 `write_error` + rollback a `non_classificato`)
- [x] I-J-K: rollback e scrittura `fallita` loggati se falliscono; `console.error` del `document_error` con `documentId`
- [x] N: guasto dello storage nel download = 500 `storage_error` + rollback a `non_classificato` (mai `fallita`)
- [x] `expected_doc_type` validato dopo l'autorizzazione
- [x] `npm run verify:classifywrite` (47 casi), provato rotto a mano in 3 modi
- [x] Prova dal vivo su TEST wizard A con documento usa e getta, guasto storage forzato, ripristino (1 documento, 0 `in_corso`, file di storage rimosso)
- [x] Tutti i 26 `verify:*` verdi, `npm run build` verde, `main` pushato fino a `df80899`
- [ ] Push di `fcb490d` (docs): rimandato a fine domenica
- [ ] Punto L (P2) e punti 3-5 solo nel backlog, vedi sotto

## File toccati
### Creati
- `src/lib/classification-write.ts` — errori tipizzati, `writeDocumentState`, `downloadDocumentBuffer`, `sessionOutcome`, `handleClassificationFailure` (decide risposta e stato del documento). Non importa Next né l'SDK Anthropic.
- `scripts/verify-classify-write.mjs` — 47 casi con client Supabase finto; l'ultimo blocco controlla nel sorgente della route che non restino `.update(` diretti, che `getUser` legga `error` e l'ordine autorizzazione → `expected_doc_type`
- `docs/handoffs/fix-classify-piano.md`, `docs/handoffs/HANDOFF_parti_comuni_11_07_11_15.md` — committati in `fcb490d`. Il piano è **superato**: dice ancora "nulla implementato".

### Modificati
- `src/app/api/classify-document/route.ts` — usa i nuovi helper; il `catch` delega a `handleClassificationFailure`
- `src/lib/document-access.ts` — solo i commenti (righe ~7 e ~107): classify-document ha migrato qui la sua copia
- `package.json` — riga `verify:classifywrite`

### Letti (rilevanti)
- `src/app/api/extract-document/route.ts` — modello di `ExtractionWriteError` e del `console.error`
- `src/lib/batch-failures.ts` — mappa `write_error` → `errore_salvataggio`; cause sconosciute → status
- `DocumentiClient.tsx` (`classifyDocuments` ~436, `pendingClassification` ~295) — il client conta fallimenti solo con risposta non-ok
- `src/app/api/documenti-xlsx/route.ts` — pattern `isAuthRetryableFetchError` per `getUser`

## Decisioni chiave
- **Deroga "byte-identica"**: classify-document usa `authorizeDocumentActor` (approvata); scartata la copia inline.
- **Rollback dopo scrittura fallita (G/H)**: tenuto (approvato). Senza, il client vede l'errore ma il documento resta `in_corso` e il bottone "Classifica documenti" non lo riprende.
- **`getUser` con error**: solo `AuthRetryableFetchError` è tecnico (500); sessione assente o token non valido restano 401. Alternativa scartata: ogni `error` = 500, che avrebbe trasformato "non loggato" in 500.
- **Storage = errore tecnico** (500 `storage_error`, rollback), non `fallita`/502. Il client lo mostra come "errore tecnico del server".
- **Passo `in_corso` fallito**: 500 senza rollback (il documento non è mai entrato in `in_corso`; un rollback potrebbe sovrascrivere uno stato valido).
- **Ordine**: `documentId` valido prima del 403 (serve all'helper); `expected_doc_type` dopo l'autorizzazione.
- **Punto L fuori commit**: errori SDK di configurazione (`NotFound`, permessi, `BadRequest`) possibili scambiati per problema del documento. Ipotesi non provata → P2.

## Stato attuale
### Funziona
- Caso felice dal vivo: PDF caricato → classificato sulla route nuova → `da_revisionare` (confidenza 0,75)
- Guasto storage dal vivo: 500 `{"error":"Errore tecnico, riprova","cause":"storage_error"}`, DB a `non_classificato`, banner batch "Causa: errore tecnico del server"; log del dev server verificato da Filippo
- 26/26 `verify:*`, `npm run verify` e `npm run build` verdi

### Non funziona / da verificare
- Non coperti dalla prova: i rami di guasto reali di `update` in produzione (solo client finto) e la 503 `service_unavailable` dal vivo
- Rollback a `non_classificato` non azzera `doc_type` / `extracted_metadata` di una classificazione precedente (già così per il ramo servizio non disponibile)
- Commento in `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts:104` cita `classify-document/route.ts:134-150`, non più valido
- 404 `Failed to load resource` in console al ricaricamento della pagina Documenti, precedente al fix, causa non indagata
- File non tracciato `docs/handoffs/residenza-da-documento-piano.md`: non creato da questa sessione, non letto

## Prossimi passi
1. A fine domenica: `git push origin main` per `fcb490d` (e quanto altro si accumula); prima `git fetch` e controllo divergenze.
2. Aggiungere al backlog: P2 punto L; i tre punti sopra (rollback che non azzera i dati, commento stale in `manutenzioni/actions.ts:104`, 404 in console).
3. Decidere cosa fare di `docs/handoffs/residenza-da-documento-piano.md` (di un'altra sessione): leggerlo, poi committarlo o scartarlo.
4. Valutare se marcare `fix-classify-piano.md` come superato (una riga in cima) in un commit solo-docs.
5. Se si tocca ancora `classify-document` o `extract-document`: valutare un helper comune per `isServiceUnavailableError` (oggi duplicato nelle due route).

## Comandi da rilanciare
```bash
npm run dev                       # server di sviluppo (finestra PowerShell separata)
npm run verify:classifywrite      # 47 casi, client finto
npm run verify                    # gate: tsc + lint + stato git
npm run build                     # build di produzione
```
SELECT di controllo (sola lettura): `select count(*) from documents where classification_status = 'in_corso';` — atteso 0.

## Domande aperte
- Il punto L (errori SDK di configurazione) merita un fix o basta il backlog P2?
- Il rollback dovrebbe azzerare `doc_type`/`extracted_metadata` precedenti, o la proposta vecchia è voluta?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: "Mai scartare l'esito di un `update`/`insert`/`delete` Supabase il cui risultato condiziona la risposta al client: stessa bug class del `select` senza `error`. Va destrutturato `error`, loggato lato server e trasformato in errore tecnico (500 "Errore tecnico, riprova"), mai in 200 né in un esito di dominio."
- **Regole di codice ricorrenti**: "Uno stato transitorio (es. `classification_status = 'in_corso'`) deve sempre avere una via di ritorno: se la scrittura che lo chiude fallisce, si tenta un rollback a uno stato che rientra in coda e si logga il fallimento, mai si tace. Un rollback fallito non sostituisce l'errore originale verso il client."
- **Regole di codice ricorrenti**: "Per `supabase.auth.getUser()` senza utente: solo `AuthRetryableFetchError` è un guasto tecnico (500); sessione assente e token non valido sono 401. Mai trattare ogni `error` come 500."
- **Metodo di lavoro**: "Gli script verify con client finto si provano anche 'rotti a mano': si introduce il difetto nel modulo, si controlla che lo script lo veda, si ripristina e si verifica il `diff` identico."

# Handoff — E1b Elimina documento (commit 7b) · 06/11/2026 20:02

## Sommario
Il 7b di E1b (progetto CasaZero, Next.js 15 App Router + Supabase, milestone attiva M5) è chiuso: "Elimina documento" funziona dal cestino della riga e dalla barra azioni della tabella "Tutti i documenti", con migrazione 053, blocco esplicito e traccia nel registro prima della rimozione del file. I tre commit sono su `main` e provati dal vivo con `pippoloro02` (super_admin). Nessun push e nessuna `npm run build` in questa sessione.

## Lavoro completato
- [x] Commit `7b627b3` (7b-1): migrazione 053, CHECK di `activity_events` a 13 tipi, `documento_eliminato` e `documento_file_non_rimosso`, tipo TS, icone ed etichette neutre. Applicata, esito PASS in `docs/migrations.log`.
- [x] Commit `e55209f` (7b-2): regole pure, `checkDocumentsDeletable`, `deleteDocuments`; `logActivityEvent` restituisce l'esito.
- [x] Controlli prima della UI: policy, grant, trigger su `documents`; probe storage.
- [x] Commit `e54d4e1` (7b-3): cestino, bottone in barra, finestra di conferma, `deleteLimitReason`.
- [x] Prova dal vivo su Santa Giustina (solo finestra) e TEST wizard A (3 eliminazioni reali).

## File toccati
### Creati
- `supabase/migrations/053_activity_event_documento_eliminato.sql` — CHECK a 13 tipi e contratto dei payload.
- `src/lib/document-delete.ts` — blocchi, messaggi, limite di 50, payload, frasi del registro, esito rimozione file, riepilogo toast.
- `scripts/verify-document-delete.mjs` — 43 casi (`npm run verify:docdelete`).

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `authorizeDelete`, `readDeleteBlockers`, le due server action.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentsTable.tsx` — `DeleteDocumentsDialog`, cestino, bottone in barra, colonna Azioni.
- `src/lib/activity-log.ts` — `logActivityEvent` restituisce `Promise<boolean>`; gli altri chiamanti possono ignorarlo.
- `src/lib/activity-event-view.ts` — icone, etichette, frasi dei due nuovi tipi.
- `src/lib/document-table.ts` — `namesList` esportata.
- `src/types/database.ts`, `docs/migrations.log`, `package.json` — union dei tipi, riga migrazione, script `verify:docdelete`.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/document-access.ts` — `authorizeDocumentActor`, confrontato con la policy DELETE.
- `src/components/ui/Modal.tsx`, `src/components/ui/Button.tsx` — portal e regola "rosso solo nel footer della Modal".
- `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts` — corpo inviato da `remove`.

## Decisioni chiave
- **Blocco nell'action, non nel DB**: `supplier_installations.source_document_id` è SET NULL e `attachments.document_id` è CASCADE, quindi il DB eliminerebbe senza protestare. Nel multiplo, un bloccato ferma tutto e il messaggio elenca tutti i bloccati.
- **Sequenza DELETE → eventi → rimozione file**: DELETE singolo col client di sessione. Il file si rimuove solo se l'evento col suo path è stato scritto; se l'evento fallisce il file resta come unica traccia. Nessun rollback.
- **Secondo tipo `documento_file_non_rimosso`**: il registro è append-only, quindi il fallimento è una riga a sé, scritta solo quando serve. Scartato l'aggiornamento dell'evento originale.
- **Vale la lista restituita da `remove`**: lo storage può rispondere 200 senza aver rimosso (probe: seconda `remove` sullo stesso path dà 200 e `[]`). `data[].name` è il path completo.
- **Client di sessione per storage e DELETE**: la policy `documents bucket: delete scoped residenza` basta. Il service client serve per snapshot, blocchi e registro.
- **`checkDocumentsDeletable` all'apertura**: il bottone Elimina compare solo in fase `ready`/`deleting`; `deleteDocuments` ripete il controllo. Finestra di concorrenza tra controllo e DELETE accettata.
- **Nessuna risposta da `deleteDocuments`**: esito ignoto, quindi niente Riprova; finestra chiusa, toast persistente, refresh.
- **Limite di 50 documenti**: scelto per coerenza con lo ZIP, frase unica in `deleteLimitReason`.
- **Cestino diretto invece del menu ⋯**: `aria-label` "Elimina <nome>", cella con stopPropagation, raggiungibile da tastiera. Finestra montata fuori dalla tabella perché i clic risalgono dai portal.

## Stato attuale
### Funziona
- **Policy `documents: admin e super_admin gestiscono`** (comando ALL): stesso perimetro di `authorizeDocumentActor`, confrontato sul codice. Grant DELETE per `authenticated` presente, RLS attiva, nessun trigger.
- **Santa Giustina** (`52c6495d-2195-41de-b1bd-17c50241c589`): su `07_DiCo_impianto_termico_SantaGiustina` (`9d3f248e-ac21-460f-aa1e-ab7b0de567f6`), singolo e multiplo con `12_Agibilita`, solo Chiudi e motivo. 6 documenti intatti.
- **TEST wizard A** (`8e309f07-c274-43af-b7a5-7af53fed9a51`): eliminati `prova-7b` dalla riga, `prova-7a-senza-unita` e `prova-7a-unita-1` dalla barra. Righe e file assenti, snapshot a 12 chiavi, `test-r3` intatto. Console del browser senza errori né warning.
- **Delta registro**: `documento_eliminato` +3, `documento_file_non_rimosso` +0, altri tipi invariati. Il caricamento e la classificazione di `prova-7b` hanno prodotto 0 eventi.
- **Gate**: `npm run verify` exit 0, `verify:docdelete` 43 casi, `verify:doctable` 99 casi.

### Non funziona / da verificare
Nessun difetto noto. Non provato dal vivo:
- Ruolo `admin` assegnato (solo confronto policy/gate).
- Ramo `attachments` (0 righe nel DB), fallimento rimozione file, fallimento evento: solo regole pure da script.
- Esito "bloccato" del secondo controllo in `deleteDocuments` (concorrenza) e assenza di risposta dall'action.
- Limite oltre 50 dalla UI: solo script.

## Prossimi passi
1. Decidere il prossimo blocco di E1b (nessuno è stato indicato in questa sessione).
2. Commit di sola pulizia a fine E1b: `authorizeDelete` e `getDocumentsDownloadUrls` ripetono lo stesso gate (decisione di Filippo: ora non si tocca).
3. Committare gli handoff non tracciati `docs/handoffs/HANDOFF_e1b_tabella_documenti_11_06_15_43.md` e questo (decisione di Filippo: insieme, a fine giornata).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# Gate e regole del 7b
npm run verify
npm run verify:docdelete
npm run verify:doctable
```

## Domande aperte
- File orfano nel bucket `documents`: `45196dac-bd81-4368-9452-1c066652e464/proprieta/1781300312305_Certeficato_enegertico.pdf` (Cavaccio). Filippo: non toccarlo. Spiega i 60 oggetti contro 59 documenti.
- `documento_caricato` e `documento_classificato` non hanno righe nel registro e il caricamento non ne scrive: un documento eliminato ha una traccia di uscita ma non di ingresso. Va bene così?
- Il testo della finestra cita "dati estratti e correzioni" anche per documenti che non ne hanno: resta generico?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: `storage.remove()` può rispondere senza errore senza aver rimosso nulla (policy che nega, file assente: 200 e lista vuota). L'esito si legge solo confrontando i path richiesti con `data[].name`, che contiene il path completo; mai fidarsi della sola assenza di `error`.
- **Metodo di lavoro**: Scrivendo da shell PowerShell su un file con fine riga LF si introduce CRLF. Dopo un append da shell controllare `git ls-files --eol <file>` e `git diff --numstat <file>` prima di committare.

# Handoff — E1b tabella Documenti (commit 7a) · 06/11/2026 15:43

## Sommario
Proseguita E1b dopo l'handoff `docs/handoffs/HANDOFF_e1b_06_11_pomeriggio.md`. Il commit 7a-1 (tab "Tutti i documenti" con tabella e filtri) è **committato e provato** (`7dc6d89`). Il commit 7a-2 (selezione + "Assegna unità" multiplo) e il commit 7a-3 (card cliccabile per intero) sono **scritti, con `npm run verify` e tutti i `verify:*` verdi, ma NON committati e NON provati dal vivo**: la sessione del browser di prova è scaduta e il login lo fa Filippo. Nessun push. `npm run build` non lanciata.

## Lavoro completato
- [x] Controllo preliminare: riga documento `09e204d6-e1b1-4c47-9b92-1e88dd549d3b` è `completata`, `reviewed_by`/`reviewed_at` (2026-11-06 11:43:56+00) intatti.
- [x] Diagnosi FK verso `documents` (per il 7b), con conteggi dei documenti bloccati (vedi "Decisioni chiave").
- [x] Commit 7a-1 `7dc6d89`: tab bar, tabella, filtri Unità/Tipo/Stato/ricerca, riga cliccabile. Provato nel browser su Residenza Santa Giustina (vedi "Funziona").
- [x] Commit 7a-2 scritto (selezione + Assegna unità), verify verdi, **non committato**.
- [x] Commit 7a-3 scritto (card cliccabile, stretched link), verify verdi, **non committato**.
- [x] Verifica CORS del bucket `documents` senza browser, per il commit 4 (esito positivo).
- [ ] Prova di scrittura del commit 7a-2: **non fatta** (login assente). Piano pronto su "TEST wizard A".
- [ ] Prova a schermo del commit 7a-3: **non fatta**.
- [ ] Commit 7a-4 (Scarica in ZIP): non iniziato, aspetta le prove e i due commit sopra.

## File toccati
### Creati (già committati in `7dc6d89`)
- `src/lib/document-table.ts` — funzioni pure: filtri (`filterTableDocs`), ordine (`sortTableDocs`), `documentNameText`, `presentDocTypes`, `sortedUnits`, `tableStateLabel`, `STATE_FILTER_OPTIONS`. **Non committate (commit 2)**: `pruneSelection`, `selectAllState`, `toggleSelectAll`, `splitBulkAssign`, `summarizeBulkAssign`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentsTable.tsx` — la tabella (filtri, righe cliccabili). **Non committato (commit 2)**: checkbox, barra azioni, ciclo di assegnazione.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentTabs.tsx` — barra a due tab ("Panoramica", "Tutti i documenti"), frecce/Home/End; pronta per i tab dei commit 8 e 9.
- `src/app/(dashboard)/admin/residences/[id]/documenti/ClassificationBadge.tsx` — `classificationBadgeInfo` e `ClassificationBadge` spostati da `DocumentiClient.tsx` senza modifiche al testo.
- `scripts/verify-document-table.mjs` — `npm run verify:doctable`: 47 casi nel commit 1, **77** con i casi del commit 2 (non committati).

### Modificati
- `src/lib/document-rows.ts` (committato) — esportata `CLASSIFICATION_STATUS_LABELS`, fonte unica per tabella ed Excel.
- `src/lib/document-export.ts` (committato) — importa `CLASSIFICATION_STATUS_LABELS` invece di tenerne una copia.
- `scripts/verify-cell-contrast.mjs` (committato) — il controllo del badge ora legge `ClassificationBadge.tsx`; aggiunto un controllo sull'ambra della tabella (12 casi).
- `package.json` (committato) — script `verify:doctable`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — committato: tab bar, wrapper "Panoramica" (non reindentato di proposito), `DocumentsTable` sempre montata e nascosta se non attiva, `searchText`/`presentDocTypes` condivisi. **Non committato (commit 3)**: `DocCard` con stretched link (+17/−5 righe).
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — **non committato (commit 2)**: `setDocumentUnit` accetta `revalidate?: boolean` (default `true`); il `revalidatePath` finale è condizionato. Il pannello non cambia.

### Letti (solo quelli rilevanti)
- `docs/handoffs/HANDOFF_e1b_06_11_pomeriggio.md` — stato e piano E1b.
- `src/lib/document-rows.ts`, `src/lib/unit-utils.ts`, `src/lib/formatUnitLabel.ts`, `src/lib/pluralize.ts` — helper riusati.
- `src/components/ui/Toast.tsx` — tipi `success|error|warning` e opzione `persistent`.
- `src/app/api/download/route.ts` (via riscontro) — il download singolo passa da `/api/download` (signed URL 1 h).
- `scripts/verify.ps1` — il gate è solo `tsc` + `next lint` + `git status`: **gli script `verify:*` non ne fanno parte**, vanno lanciati a parte.

## Decisioni chiave
- **Quattro commit per 7a** (approvato): 1 tabella+filtri+tab, 2 selezione+Assegna unità, 3 card cliccabile, 4 Scarica ZIP.
- **Scarica sulla selezione = ZIP generato nel browser** (decisione A): non un endpoint che restituisce lo ZIP (limite ~4,5 MB di risposta delle funzioni Vercel + timeout). Server action con gate di ruolo che riceve gli id, controlla che ogni documento sia della residenza corrente, restituisce signed URL brevi; se anche un solo id è fuori residenza → errore, nessun URL. Il browser scarica dai signed URL e comprime con **fflate** (dipendenza approvata). Nome zip `<residenza>_documenti_<data>.zip`. Bottone "Preparo lo ZIP… (n/N)". Un file fallito → ZIP con gli altri + toast con i nomi mancanti. Massimo 50 file, oltre → bottone disabilitato con messaggio.
- **CORS verificato** (prerequisito del commit 4): signed URL da 60 s su un documento di TEST wizard A. GET con `Origin: http://localhost:3000` → 200, `access-control-allow-origin: *`; stesso con un'origine qualunque; OPTIONS preflight → 200 con `allow-methods` e `max-age: 3600`. Quindi il `fetch` dal browser è consentito. L'origine di produzione non è stata provata (`*` la copre).
- **Assegna unità = ciclo sequenziale di `setDocumentUnit`** (decisione B), un solo `router.refresh()` alla fine, un solo toast "N assegnati, M falliti: nomi" (persistente se ci sono fallimenti, max 3 nomi + "e altri N", motivo mostrato solo se uguale per tutti), dopo il ciclo restano selezionati solo i falliti. I documenti già nell'unità di destinazione si saltano prima del ciclo (nessuna chiamata, nessun evento) e il toast li dice a parte.
- **Parametro `revalidate` su `setDocumentUnit`** (approvato, tenuto): senza, ogni chiamata del ciclo rigenera la pagina. Default `true`, quindi nessun altro chiamante cambia. Nel codice: `DocumentsTable.tsx:144` passa `revalidate: false`, `DocumentsTable.tsx:162` fa l'unico `router.refresh()`. Il numero di refresh in rete **non è ancora provato**.
- **Filtri della tabella con stato proprio** (decisione C): non toccano `filtered` della lista a card né il toggle "Da verificare" vecchio, che spariscono quando sparisce la lista a card.
- **La selezione vale solo per le righe visibili**: `pruneSelection` toglie dalla selezione le righe che un filtro nasconde (e non tornano togliendo il filtro). Provato in sola lettura nel browser.
- **Stretched link nella card** (commit 3): il bottone del nome non è posizionato e il suo `::after` copre la card `relative`; download e "Gestisci i collegamenti" hanno `relative z-10`. Conseguenza accettata da Filippo: il testo nella card non è selezionabile. L'ordine di `Tab` nel DOM è nome → "Gestisci i collegamenti" → download, accettato (segue l'ordine visivo).
- **Wrapper "Panoramica" non reindentato** (decisione di Filippo): diff piccolo; l'eventuale reindentazione va in un commit di sola formattazione a fine E1b.
- **Avviso LF/CRLF di git**: ignorato di proposito, non è di questi commit.
- **FK verso `documents`** (per il 7b, query su `pg_constraint`): `attachments.document_id` CASCADE · `document_extractions.document_id` CASCADE · `document_field_overrides.document_id` CASCADE · `supplier_installations.source_document_id` **SET NULL** (il DB non blocca). Nessun'altra colonna `*document*_id` in `public` è priva di FK; `completions` non punta a `documents`. Documenti oggi con `supplier_installations`: Cavaccio 1, Portello 1, Santa Giustina 1, Prova 0; con righe in `attachments`: 0 ovunque. Decisioni già approvate per il 7b (non implementate): blocco esplicito nell'action se esiste `supplier_installations.source_document_id` **oppure** una riga `attachments` sul documento; nel multiplo, se uno è bloccato non si elimina niente; dopo il DELETE riuscito si rimuove anche il file nello storage con service role (se fallisce lo si registra nell'evento `documento_eliminato`, nessun rollback, e lo snapshot include lo storage path); nella FASE 0 del 7b si leggono le policy del bucket `documents`.
- **Etichette**: nella tabella "Da verificare" (`REVIEW_LABEL`, ambra `semantic-amber`) è lo stato del documento con classificazione non chiusa; "Da rivedere" resta riservata al tab del commit 8. Il filtro Stato raggruppa per `reviewState` ("Da verificare", "Classificato", "Da classificare"); la colonna mostra la parola precisa (`CLASSIFICATION_STATUS_LABELS`).
- **Proprietà delle residenze di prova** (scoperta in questa sessione, query su `residences`/`builders`/`profiles`): Residenza Prova → costruttore "TEST prova Nicola" (super_admin `3b68770c-6341-4543-99fc-42f6a4fc0939`); Cavaccio, Teolo, "test 01", "test documenti" → "Archivio pre-demo" (solo due profili `admin`, nessun super_admin); Santa Giustina, "TEST wizard A" e le altre → **Furlan srl** (super_admin `99b90ec5-6a80-4ec3-8884-377163c5510b`, cioè `pippoloro02@gmail.com`). Quindi `pippoloro02` riceve **404** su Prova e su Cavaccio, ed è il comportamento corretto del multi-tenant.
- **Prova di scrittura spostata su "TEST wizard A"** (`8e309f07-c274-43af-b7a5-7af53fed9a51`, Furlan, 5 unità "Unità 1"…"Unità 5", 1 documento `test-r3` `f949ac0f-ecaf-40ec-94d9-ca5faf13dc41` senza unità, 0 eventi `documento_unita_cambiata`): Cavaccio non è raggiungibile e ha solo 2 documenti con unità, entrambi nella stessa. Scelta di Filippo.

## Stato attuale
### Funziona
- `7dc6d89`, provato nel browser su Santa Giustina (6 documenti): console senza errori (unico 404 `favicon.ico`, estraneo); tabella ordinata per data decrescente; filtri singoli e combinati (Unità 2 → 1; Senza unità → 4; "Da verificare" → 1, coerente con il toggle della Panoramica; ricerca "agibilita" → 1; filtri incompatibili → "0 documenti su 6"); clic su una cella qualsiasi apre il pannello (richieste 200, anteprima 200); frecce Sinistra/Destra cambiano tab e spostano il focus; filtri conservati cambiando tab; ordine `Tab` tab → ricerca → 3 filtri → ✕ → nome riga; Invio sul nome apre il pannello.
- Commit 2, sola lettura nel browser (prima della scadenza della sessione): il clic sul checkbox non apre il pannello; checkbox di intestazione seleziona le 6 righe e va in indeterminato; "Assegna" disabilitato senza destinazione; selezionate 6 righe e filtrato su Unità 2 la selezione scende a 1 e non torna togliendo il filtro; "Deseleziona" chiude la barra.
- Verifiche automatiche, tutte verdi sul working tree attuale: `npm run verify` (tsc + lint), `verify:doctable` 77, `verify:export` 61, `verify:unitdocs` 57, `verify:panel` 41, `verify:contrast` 12, `verify:schede` 60, `verify:unitmatch` 41, `verify:preview` 16, `verify:expected` 22, `verify:extraction` 91, `verify:batch` 14, `verify:docunit` 18, `verify:overrides` 155, `verify:evento` 28, `verify:due` 38, `verify:basis` 39, `verify:consegna` 39, `verify:link` 22, `verify:assegnazione` 11, `verify:features`, `verify:sistemi`, `verify:match`.

### Non funziona / da verificare
- **Assegnazione multipla vera (commit 2)**: mai eseguita. Da provare: toast "2 assegnati", selezione vuota, un solo refresh (richieste di rete), `unit_id` cambiati nel DB, 2 eventi `documento_unita_cambiata`, documento già a destinazione saltato (nessuna chiamata, nessun evento), ripristino.
- **Card cliccabile (commit 3)**: nessuna prova a schermo (clic su tutta la card, incluse le 3 della sezione "Residenza"; download e "Gestisci i collegamenti" non aprono il pannello; focus ring sulla card).
- **Console**: Chrome segnala "A form field element should have an id or name attribute (count: 7)" sul tab già all'apertura della pagina; non indagato (i select/input della pagina non hanno `name`), probabilmente preesistente.
- **Sessione del browser**: la finestra DevTools è tornata a `/auth/login` due volte. Il login è con Google o email, lo fa solo Filippo.
- **Passo D dei 6b/6c (versioni)**, 6b-1 (400 della route, toast "Apri"), Excel dopo il cambio etichetta, Firefox, `npm run build`: ancora non provati, come nell'handoff precedente.
- **Sotto 1280px** la tabella con il pannello a cassetto non è stata ricontrollata.

## Prossimi passi
1. **Aspettare il login di Filippo** come `pippoloro02` nella finestra DevTools (pagina `http://localhost:3000/admin/residences/8e309f07-c274-43af-b7a5-7af53fed9a51/documenti`).
2. **Prova di scrittura del commit 2 su TEST wizard A**: creare i PDF di prova (già fatti in `C:\Users\raffa\AppData\Local\Temp\claude\C--progetti-casazero\5006e4b0-e7f0-4a8f-8f6d-c5d1399aa014\scratchpad\prova-7a-senza-unita.pdf` e `...\prova-7a-unita-1.pdf`, rigenerabili con `mkpdf.mjs` nella stessa cartella) e caricarli dall'interfaccia ("Carica documenti": uno senza unità, uno su Unità 1; la classificazione automatica può dare "Non classificabile" ed è irrilevante); annotare id e `unit_id` dal DB; selezionarli e assegnarli entrambi a Unità 3 (atteso: toast "2 documenti assegnati a Unità 3", selezione vuota, un solo `POST` di refresh in rete dopo i due `setDocumentUnit`); verificare nel DB `unit_id` e 2 eventi; ripetere con un documento già a destinazione (atteso: niente chiamata né evento nuovo); riportare i 2 documenti alle unità originali e riconfrontare con il punto di partenza.
3. **Prova a schermo del commit 3**: clic sulle card (anche le 3 di "Residenza"), download e link senza aprire il pannello, ordine di `Tab`.
4. **Committare in ordine**, ciascuno con `npm run verify` incollato per intero e diff mostrato: prima il commit 2 (`scripts/verify-document-table.mjs`, `DocumentsTable.tsx`, `actions.ts`, `src/lib/document-table.ts`), poi il commit 3 (`DocumentiClient.tsx`). Messaggio su file con `git commit -F`, mai here-string PowerShell con virgolette doppie, con la riga `Co-Authored-By` richiesta. Mostrare gli hash.
5. **Commit 4 (Scarica in ZIP)** solo dopo i punti sopra: `fflate`, server action con gate di ruolo e controllo `residence_id` per ogni id (un id fuori residenza → errore, nessun URL), signed URL brevi, ZIP nel browser, max 50 file, nome `<residenza>_documenti_<data>.zip`, toast con i nomi dei file falliti; prova con 2 file e con un id di un'altra residenza.
6. **STOP prima del 7b**: la verifica FK è già riportata e le condizioni sono approvate (vedi "Decisioni chiave"); nella FASE 0 del 7b leggere le policy del bucket `documents`; poi 7b (Elimina + migrazione 053 `documento_eliminato`), 8 (tab "Da rivedere"), 9 (Parti comuni), 10 (scala >12), fix `error` scartati in `classify-document`, 11, 12, `npm run build` con il dev server spento, eventuale push e handoff di fine E1b. Ordine come nell'handoff precedente.

## Comandi da rilanciare
```bash
# Il dev server dell'utente è già in ascolto sulla porta 3000 (non avviarne un altro)
npm run dev

# Gate pre-commit (solo tsc + lint + git status) e poi gli script, che NON ne fanno parte
npm run verify
npm run verify:doctable && npm run verify:export && npm run verify:unitdocs && npm run verify:panel && npm run verify:contrast

# Prima di ogni prova nel browser: a quale costruttore appartiene la residenza e se l'account ci arriva (SELECT)
# residences.builder_id vs profiles.builder_id dell'account in sessione
```

## Domande aperte
- Il warning di Chrome "form field should have an id or name" (7) è preesistente o l'ha aggiunto la tabella (select/ricerca senza `name`)? Da controllare prima del commit 4.
- Dopo il commit 4, serve reindentare il wrapper "Panoramica" in un commit di sola formattazione a fine E1b (già deciso come eventuale).
- Residenza Prova e Cavaccio non sono raggiungibili con gli account del CLAUDE.md: la prova della versione (passo D dei 6b/6c) richiede l'account del costruttore "TEST prova Nicola"?

## Leggi emerse (candidate per CLAUDE.md)
- **Metodo di lavoro**: Prima di una prova nel browser su una residenza, verificare con una SELECT a quale costruttore appartiene (`residences.builder_id`) e se l'account in sessione ci arriva (`profiles.builder_id`, `admin_assignments`). Un 404 su una residenza esistente è il multi-tenant che funziona, non un bug: non va aggirato.
- **Metodo di lavoro**: Una prova di scrittura si fa dall'interfaccia, con l'account reale, mai con SQL o service role che sostituiscono il percorso sotto prova: altrimenti si prova il database e non il codice. Il service role si usa solo per leggere o per verifiche d'infrastruttura (es. CORS di uno storage), con la chiave letta da script e mai stampata.
- **Regole di codice**: Una server action che rigenera la pagina (`revalidatePath`) e che si chiama anche in cicli multipli accetta `revalidate?: boolean` con default `true`; il ciclo la chiama con `false` e fa un solo `router.refresh()` alla fine. Il comportamento degli altri chiamanti non cambia.
- **Regole di codice**: Una card o una riga cliccabile per intero usa il pattern "stretched link": il bottone principale non è posizionato e il suo `::after` (`absolute inset-0`) copre il contenitore `relative`; gli altri elementi interattivi interni (download, link) stanno sopra con `relative z-10`. Mai `onClick` sul contenitore con bottoni e link dentro. Il focus visibile si disegna sul `::after`.
- **Invarianti**: Una FK `ON DELETE SET NULL` non blocca l'eliminazione: se il riferimento è una prova (es. `supplier_installations.source_document_id`) o un allegato del fascicolo (`attachments`, anche con `completion_id`), il blocco va fatto esplicitamente nell'action prima del DELETE, con un messaggio di dominio, e nessuna nuova FK `ON DELETE CASCADE` verso `documents`.
- **Metodo di lavoro**: `npm run verify` (tsc + lint + stato git) non esegue gli script `verify:*`: prima di ogni commit che tocca `src/lib` o gli script lanciare anche quelli pertinenti e incollarne l'esito.
- **Metodo di lavoro**: Account di test: aggiungere in CLAUDE.md "Account di test" che `pippoloro02` è super_admin del solo costruttore Furlan srl; Residenza Prova appartiene a "TEST prova Nicola" e Cavaccio a "Archivio pre-demo" (solo admin), quindi non si aprono con gli account elencati.

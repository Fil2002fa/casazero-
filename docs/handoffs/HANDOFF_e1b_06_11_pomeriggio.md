# Handoff — E1b pagina Documenti (commit 1-6, 6b, 6c) · 06/11/2026 pomeriggio

## Sommario
Rifatta la UX della pagina Documenti della residenza (admin e super_admin, solo desktop, stile verde attuale): quadro unità × documenti a celle, pannello laterale con anteprima reale, proposta di unità dal testo letto, caricamento da cella con tipo atteso. Fatti i commit 1-6, le correzioni 6b (7) e 6c (4). **Non fatti**: i tab (7a, 8, 9), la scala >12 (10), il fix errori di `classify-document`, il caricamento multiplo (11), la testata (12). **Nessun push. `npm run build` non lanciata** (il dev server dell'utente tiene `.next` sulla porta 3000). Ultimo commit: `e82a016`. Working tree pulito.

## Commit E1b fatti (in ordine)
| Hash | Una riga |
|---|---|
| `1b4bacd` | 1 · `reviewState`/`isReviewClosed`/`REVIEW_LABEL` unici; `sistemaMatches` unificata in `document-classification.ts` (usata anche dalla checklist B4) |
| `cfe1af7` | 2 · migrazione 052 additiva: `proposed_unit_id`, `unit_proposal_confidence`, `unit_proposal_dismissed_at` su `documents` + indice parziale |
| `cd357d4` | 3 · matcher di proposta unità (puro, conservativo), scritto da `classify-document`/`extract-document`, script `backfill-unit-proposals.mjs` |
| `6a1ce00` | 4 · action `getDocumentPreviewUrl` (signed URL 120 s, no download) + `DocumentPreview` |
| `53db5cf` | 5 · `DocumentPanel` con un solo Salva; elimina `ReviewPanel`, `CorrectDataPanel`, `AssignUnitPanel` |
| `4034397` | 6 · quadro a celle `<button>`; "Carica" dalla cella apre l'upload con unità e categoria preimpostate |
| `37c5071` | 6b-1 · `expected_doc_type` in `classify-document` (non valido = 400; tipo diverso → `da_revisionare` anche ≥ 0,8) |
| `9a96cfc` | 6b-2 · etichetta unica "Da verificare" (`REVIEW_LABEL`) |
| `af12d87` | 6b-2bis · Excel `document-export.ts:59` "Da verificare" |
| `abb3465` | 6b-3 · "Impianto di riferimento" solo per DiCo, collaudo, manuale, garanzia, libretto (`docTypeHasSistema`, `effectiveSistema`) |
| `e3e255e` | 6b-4 · ambra vero nel quadro (contrasto 5,87:1), `verify:contrast` |
| `b79a20c` | 6b-5 · anteprima = unico bottone con overlay "Apri a schermo intero", PDF prima pagina senza scroll |
| `fbe5600` | 6b-6 · pannello `clamp(480px,40%,640px)` |
| `7a19ff6` | 6b-7 · "+N versioni" nella cella, "Altre versioni (N)" nel pannello |
| `cc6deb3` | 6c-1 · toast warning persistente con X e bottone "Apri" (`persistent`, `action` in `showToast`) |
| `e7e00b6` | 6c-2 · stesso ambra (`semantic-amber`) su badge, filtro, banner, icona toast |
| `b660f11` | 6c-3 · nello slot decide sempre il documento più recente (a parità di data il confermato) |
| `e82a016` | 6c-4 · sotto 1280px il pannello è un cassetto (`PanelShell`), da 1280px affiancato |

Dati e DB: migrazione 052 applicata e registrata in `docs/migrations.log`; script di riempimento lanciato con `--apply`: 2 documenti (Prova `DiCo_elettrica_senza_unita.pdf` → B2 alta; Cavaccio `fascicolo-unità-1 (3).pdf` → Unità 1 alta), seconda esecuzione 0.

## Decisioni approvate (da Filippo)
- Hard delete dei documenti, **con 3 condizioni**: (a) prima di 7b verificare e riportare le FK verso `documents` (`document_extractions`, `document_field_overrides`, `supplier_installations.source_document_id`, `completions` o altro), nessun `ON DELETE CASCADE` nuovo; (b) se il documento è referenziato l'eliminazione è BLOCCATA con messaggio di dominio che dice cosa lo usa; in selezione multipla, se anche uno solo è bloccato non si elimina niente e si dice quale; (c) evento `documento_eliminato` (migrazione 053) con nome file, `doc_type` e etichetta unità nel payload. Conferma con elenco dei nomi.
- Proposte sui documenti esistenti: solo script una tantum idempotente, nessun bottone, nessuna scrittura al caricamento della pagina (fatto).
- "Da rivedere" è il tab con TUTTI i documenti senza unità e non ignorati: con proposta Accetta/Cambia/Ignora, senza proposta "Nessuna proposta" e solo Cambia/Ignora. "Accetta tutte ad alta confidenza": nessuna conferma, il bottone mostra il conteggio, toast col numero accettato, solo match univoci in fascia Alta.
- **Due parole, due concetti**: "Da verificare" = stato ambra di un documento con unità e classificazione non chiusa (cella, badge, filtro, banner, Excel); "Da rivedere" = solo il tab dei documenti senza unità.
- Ambito e Unità di riferimento fuori dal pannello (testo letto in sola lettura "Letto nel documento: …"). "Apri a schermo intero" genera una signed URL nuova al clic.
- Planimetria: cella con sola data (la "scala" non esiste nell'estrazione). Salva non atomico: ok, backlog P2.
- Toast `warning` ammesso in `Toast.tsx`; testo «Sembra «X», non «Y»: controlla.»; toast del mismatch persistente.
- Firefox può ignorare alcuni parametri del PDF in anteprima: accettato.
- Sotto 1280px cassetto con sfondo scuro, X e clic fuori; sopra 1280px affiancato.
- Scala >12 (commit 10): niente scroll orizzontale oltre 5 colonne (non provabile). Solo toggle "Solo unità incomplete", celle compatte, sticky, ricerca; nessun raggruppamento (non esiste un campo palazzina/scala su `units`).
- Prima del push: `npm run build` (l'utente spegne il dev server quando glielo si chiede). **Niente push.**

## Cosa è stato provato a mano e cosa no
**Provato da Filippo (esito ok):** passi 1-3 dei commit 1-6 (quadro su Prova, pannello/anteprima, modifica/salvataggio), passo 7 (`filippoloro02` su Residenza Prova → 404), conteggio "Da assegnare a un'unità: 2 documenti" coerente (DiCo senza unità + libretto d'impianto con ambito `unita`). La riga APE di A1 (`09e204d6-…`) è stata confermata dal pannello (`reviewed_by`/`reviewed_at` valorizzati, **lasciati**: è una conferma vera).

**Non provato a mano:**
- I passi **A-D dei 6b/6c**: ambra ovunque, anteprima cliccabile con overlay, pannello al 40% e cassetto sotto 1280px, versioni (+1 versione con la DiCo di B2). Preparati ma senza il "prova finita".
- 6b-1: nessuna prova manuale (crediti AI), solo `verify:expected` (22 casi sulla regola pura). Il 400 della route e il toast persistente "Apri" non sono mai stati eseguiti.
- Anteprima su Firefox; signed URL contro lo storage reale oltre ai passi 1-3.
- `npm run build`: mai lanciata su questi commit.
- L'Excel dopo il cambio etichetta (solo `verify:export`, 61 casi).

**⚠ STATO DB DI PROVA DA RIPRISTINARE.** La riga APE/A1 di Residenza Prova è lasciata a `da_revisionare` per la prova ambra. Prima di altro, se la prova è finita o rimandata:
```sql
update documents set classification_status = 'completata' where id = '09e204d6-e1b1-4c47-9b92-1e88dd549d3b' and classification_status = 'da_revisionare' returning id, classification_status;
```
(`reviewed_by`/`reviewed_at` non si toccano.) Se in prova DiCo_elettrica_senza_unita.pdf è stata assegnata a B2, riportarla a "Nessuna unità".

## Verifiche automatiche (ultima esecuzione, tutte verdi)
`npm run verify` (tsc + lint); `verify:unitdocs` 57; `unitmatch` 41; `preview` 16; `panel` 41; `expected` 22; `contrast` 11; `export` 61; `schede` 60.

## Prossimi commit, in ordine
1. **7a** — tab "Tutti i documenti": tabella con checkbox (Nome, Tipo, Unità, Data, Stato), filtri Unità/Tipo/Stato + ricerca nome; barra azioni con selezione: Assegna unità ▾ e Scarica. **Tutta la riga apre il pannello** (esclusi checkbox e menu ⋯); finché esiste la lista a card, anche la card intera è cliccabile. Menu ⋯: Apri, Scarica (Elimina arriva in 7b). Filtro Stato = dove vive il filtro dei "da verificare" per ora.
2. **STOP** — riportare l'esito della verifica FK verso `documents` (vedi condizioni sopra) e aspettare l'ok.
3. **7b** — Elimina singolo e multiplo + migrazione 053 (`documento_eliminato`). Un concern, commit separato.
4. **8** — tab "Da rivedere" (regole sopra). Qui sparisce la riga "Da assegnare a un'unità" del quadro.
5. **9** — tab "Parti comuni": la checklist "Da caricare" spostata.
6. **10** — scala >12 (vedi decisioni). Cavaccio ha 15 unità: oggi mostra il quadro completo.
7. **Fix `classify-document`**: `error` scartati — `const { data: profile }` senza `error`, `const { data: doc }` senza `error`, gli `await admin.from('documents').update(...)` che ignorano l'`error`. Errori tecnici → messaggio ritentabile; errori di dominio → messaggio di dominio; mai "Permessi insufficienti" per un guasto tecnico.
8. **11** — "Carica documenti" dalla testata, multiplo → classify-document → finiscono in "Da rivedere".
9. **12** — testata "Documenti · <residenza>", "N slot mancanti su M" + "K da verificare".
Poi: `npm run build` (dev server spento), eventuale push, e l'handoff di fine E1b.

## Debiti e note
- Backlog P2: Salva del pannello non atomico (classificazione → unità → campi, ognuna con la sua action).
- `Toast`: uno alla volta; un toast successivo sostituisce anche il persistente.
- `documents.reviewed_by` resta valorizzato dopo il ripristino della riga di prova.
- Da verificare prima del push: `supplier_installations.source_document_id` (blocca l'eliminazione 7b?) e se `completions` o altro punta a `documents`.
- Modifica ai file: `classify-document/route.ts` e `ui/Toast.tsx` hanno fine riga CRLF — gli script `node -e` con `\n` non li trovano, usare lo strumento Edit. Nei `node -e` tra doppi apici la shell mangia i backtick: scrivere lo script su file.

## Leggi emerse (da proporre a CLAUDE.md, non modificate qui)
1. Una proposta di unità non assegna mai nulla: `documents.unit_id` lo scrive solo una persona (Accetta/Cambia nella UI).
2. Etichette di stato: "Da verificare" (documento con unità, classificazione non chiusa) ≠ "Da rivedere" (tab dei documenti senza unità). Una sola costante (`REVIEW_LABEL`).
3. Lo stato ambra usa `semantic-amber`/`semantic-amber-bg`: `status-inprogress` al 8% di opacità appariva rosa/rosso. Va ricomposto con la "Regola delle Due Generazioni" in B3.
4. Regole di classificazione da un indizio del chiamante (tipo atteso) vivono in funzioni pure di `src/lib`, non nella route.

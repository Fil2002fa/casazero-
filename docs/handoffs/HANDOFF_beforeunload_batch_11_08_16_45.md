# Handoff — Avviso beforeunload nel batch Documenti (E1b-11-3, B58) · 08/11/2026 16:45

## Sommario
Chiuso il sotto-commit 3 del commit 11 di E1b: durante il batch di caricamento, classificazione ed estrazione nella pagina Documenti il browser avvisa prima di chiudere o ricaricare la scheda, e compare la riga "Non chiudere la pagina finché non finisce." dentro la modale e, a modale chiusa, fuori da essa. Il batch gira nel browser, quindi chiudere la scheda lo interrompe a metà. Commit `fef2bc8`, 1 file, +24 righe, nessun push.

## Lavoro completato
- [x] FASE 0 con evidenze sul comportamento dei cicli allo smontaggio (R3)
- [x] `batchBusy = isUploading || classifying || extracting` come fonte unica
- [x] `useEffect` con `beforeunload`, rimosso a batch finito e allo smontaggio, indipendente da `showModal`
- [x] Riga di testo nel ramo `submitted` della modale e riga fuori dalla modale con `batchBusy && !showModal`
- [x] `npm run verify` pulita (tsc, lint) prima del commit
- [x] Prove su TEST wizard A con evento sintetico, ripristino completato (2 documenti, 0 `in_corso`)
- [ ] Catena automatica classificazione → estrazione non vista girare con l'avviso attivo (estrazione provata dal bottone "Estrai dati")
- [ ] Testo a modale chiusa non fotografato a 390 px

## File toccati
### Creati
- `docs/handoffs/HANDOFF_beforeunload_batch_11_08_16_45.md` — questo documento

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — `batchBusy`, effetto `beforeunload`, due righe di testo (+24)

### Letti (rilevanti)
- `src/app/api/classify-document/route.ts` — nessuna guardia su `classification_status` prima di scrivere `in_corso` (`:196`)
- `src/app/api/extract-document/route.ts` — rifiuta con 409 `not_extractable` se non `completata` (`:226-231`)
- `src/lib/document-access.ts` — `authorizeDocumentActor` seleziona lo stato ma non lo controlla (`:63`)
- `src/lib/document-delete.ts` — eliminazione multipla, tetto 50
- `docs/handoffs/e1b-11-piano.md` — piano del commit 11

## Decisioni chiave
- **Nessun intervento sulla navigazione interna (B65)**: allo smontaggio i cicli `for...of` continuano (nessun abort, nessuna pulizia) e l'estrazione parte comunque; il listener però si rimuove, quindi il batch resta senza protezione. Correggere richiede stato a livello di modulo o layout: fuori scope, voce nuova.
- **Testo fuori dalla modale come elemento nuovo**: il "progresso a modale chiusa" esistente sono le etichette dei bottoni, condizionate a `pendingClassification`/`pendingExtraction` (`:968`, `:988`), quindi inaffidabili. Alternativa scartata: appoggiare il testo ai bottoni.
- **Il testo dipende da `batchBusy` anche nella modale**: la riga di progresso esistente (`:780`) non copre l'estrazione.
- **Pulsante Chiudi invariato**: resta disabilitato solo durante `isUploading`.

## Stato attuale
### Funziona
- Sonda `beforeunload`: `false` prima, `true` in caricamento, classificazione ed estrazione (modale aperta e chiusa), `false` a fine batch
- Navigazione interna a metà batch: sonda `false` dopo, nessun ricaricamento; il documento in volo risulta comunque classificato in background
- Riga di testo visibile a 390 px con modale aperta
- TEST wizard A ripristinata: `test-r3` (completata, 1 estrazione) e `DiCo_elettrica_senza_unita` (da_revisionare), nessun file `b58` nel bucket

### Non funziona / da verificare
- Catena automatica classificazione → estrazione con avviso attivo: non vista (stesso `batchBusy`, due fasi nello stesso tick `:615-633`)
- Testo a modale chiusa a 390 px: non fotografato
- Le 3 DiCo da 600 KB (`DiCo_DM37_modello.pdf`) finiscono `da_revisionare` con `doc_type` nullo e senza estrazione: NON indagato
- A 390 px la pagina ha `scrollWidth` 411 (scroll orizzontale ~21 px, forse il quadro unità × documenti): NON indagato
- Orfano preesistente nel bucket: `8e309f07-.../amministrativi/1794046295423_test-parti-comuni.pdf`

## Prossimi passi
1. Aprire B65: il batch sopravvive allo smontaggio senza protezione né stato condiviso; al ritorno `classifying=false` e "Classifica documenti" può rilanciare sugli stessi documenti. Gravità proposta P2 (costo AI doppio e risultato non deterministico, nessun dato corrotto).
2. Indagare perché le DiCo da 600 KB non vengono classificate (`doc_type` nullo, `da_revisionare`).
3. Indagare lo scroll orizzontale a 390 px sulla pagina Documenti.
4. Proseguire il piano E1b-11 col passo 4: misura su 10 PDF realistici (token e tempi da `[ai-usage]`) su TEST wizard A.
5. Valutare se `classify-document` deve rifiutare un documento già `in_corso` (decisione di Filippo, collegata a B65).

## Comandi da rilanciare
```bash
npm run dev
npm run verify
git log --oneline -10
```

## Domande aperte
- B65 è P1 o P2? Proposta: P2.
- Una guardia lato route su `in_corso` basta, o serve stato condiviso lato client?

## Leggi emerse (candidate per CLAUDE.md)
- **Metodo di lavoro**: "Nelle prove con strumentazione nel browser (wrapper su `fetch`, `emulate`, ecc.) verificare che la strumentazione non alteri il comportamento: un wrapper su `window.fetch` deve gestire input `URL`/`Request` (`String(input)`), e `emulate` con `mobile` ricarica la pagina e azzera i patch. Dopo una modifica al codice, ricaricare la scheda (`reload` con cache ignorata) e verificare che il chunk servito contenga il codice nuovo prima di dare valore a una prova: l'HMR non è garantito su una scheda aperta in precedenza."
- **Metodo di lavoro**: "Prima di attribuire un ricaricamento inatteso a un bug dell'app, leggere i messaggi di console (`Failed to fetch RSC payload ... Falling back to browser navigation`): indicano un errore nel fetch dell'RSC, spesso causato dalla strumentazione di prova."

Ci sono 2 leggi candidate per CLAUDE.md — vuoi promuoverle?

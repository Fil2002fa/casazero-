# E1b commit 11 — caricamento multiplo nella pagina Documenti: piano approvato

Data: 2026-11-07. Stato: piano approvato da Filippo, nessun codice ancora scritto.

## Diagnosi (FASE 0)

Il caricamento multiplo **esiste già**: l'11 è un rifinimento, non una funzione nuova.

- Input con `multiple`: `DocumentiClient.tsx:770-777`. Un task per file: `:387-390`. Upload con `Promise.all`: `:405-406`. Auto-classificazione sugli id appena caricati: `:424-426`.
- Il file va dal browser allo storage con signed URL (`actions.ts:187-215`, `DocumentiClient.tsx:146-149`), poi `confirmDocument` scrive la riga (`actions.ts:252-331`). Il limite di ~4,5 MB di Vercel non vale per i file.
- Limiti: 50 MB per file e formati jpeg/png/webp/pdf/doc/docx (`document-upload.ts:4-13`). Oltre 32 MB o non PDF: `da_revisionare` senza chiamata AI (`classify-document/route.ts:207-224`).
- B62: l'upload non scrive nessun evento. `documento_caricato` e `documento_classificato` esistono nel tipo e nel CHECK (`037:43`) ma nessun `logActivityEvent` li scrive.
- Classificazione ed estrazione: due cicli sequenziali nel browser (`DocumentiClient.tsx:436-513`, `:529-576`), concorrenza 1, guardia `classifying`/`extracting`.
- `pendingClassification` prende solo `non_classificato` e `fallita` (`:295-297`). Un documento fermo su `in_corso` non rientra in nessuna coda (`classification-write.ts:5-8`).
- Nessun `beforeunload` in `src`.
- Nessun tetto sul numero di file. `Promise.all` sull'upload è illimitato.
- Stati per file oggi: `in_coda | in_caricamento | fatto | errore` (`:85`). Classificazione ed estrazione sono solo contatori. "Riprova" svuota tutto (`:664`).
- Il tipo atteso della cella viaggia su tutti i file del gesto (`:416,422`).

## Decisioni di Filippo

1. Tetto di 20 file per gesto, costante in `src/lib`.
2. `multiple` tolto quando la modale arriva da una cella del quadro o da una riga di Parti comuni.
3. B62 (evento `documento_caricato`) e il recupero dei documenti fermi su `in_corso` (B64, P1) restano fuori dall'11.

## Piano commit

0. Questo documento, solo documentazione.
1. Regola pura `src/lib/document-upload-batch.ts` con `verify:uploadbatch`: tetto, filtro formato e dimensione con elenco dei respinti, stati per file, composizione del riepilogo, selezione dei soli falliti. Prova: `npm run verify:uploadbatch` e mutazioni a mano con ripristino identico.
2. UI, divisa in due commit:
   - 2a: stati per file (classifico/estraggo con callback per id, senza riscrivere i due cicli oltre il necessario), toast unico a fine upload sul modello di `summarizeBulkAssign`, Riprova solo sui falliti con gli stessi valori del form.
   - 2b: selezione, con zona di trascinamento, tetto con messaggio chiaro e `multiple` solo senza preset. La selezione resta "sostituisce".
   - Dopo il 2a: `/clear`.
3. `beforeunload` attivo durante upload, classificazione ed estrazione, più riga di testo nella modale. Prova con evento sintetico via `evaluate_script`, mai con la chiusura reale della scheda.
4. Misura: 10 PDF di 2-3 pagine con testo realistico (DiCo/APE) generati nello scratchpad su TEST wizard A. Token e tempi da `[ai-usage]`. È una stima: la misura vera arriva con i documenti di Nicola.

Ampiezza: un componente solo per tutti i ruoli. Nessuna modifica a `completions`, RLS o classificazione. Nessuna migrazione. Un concern per commit, diff e stat mostrati prima di ogni commit, `npm run verify` con output completo prima di ogni commit di codice, nessun push.

## Prove da fare nella sessione

- SELECT di sola lettura prima del commit 1: colonne di `documents` da `information_schema` (c'è un timestamp di ultimo aggiornamento o di inizio classificazione?) e righe `in_corso` su TEST wizard A.
- Percorso storage con upload in parallelo (`${Date.now()}_nome`, nome troncato a 40 caratteri): se due file collidono devono finire in `errore` e Riprova deve riuscire. Il percorso non si modifica, si riporta solo l'esito.
- `.doc` con `file.type` vuoto su Windows: non si assorbe, si dice solo se è stato riproducibile.
- Solo TEST wizard A. Cavaccio, Santa Giustina, Portello e Bassanello fuori. Ripristino con Elimina dall'app, file orfani nel bucket (P3-8).

## Rischi segnalati e non assorbiti

- B62 e B64 (vedi sopra).
- Collisione del percorso storage: `actions.ts:154-161`.
- `.doc` con tipo vuoto: respinto come "Tipo file non supportato".

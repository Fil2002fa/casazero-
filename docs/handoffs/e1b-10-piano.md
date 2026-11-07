# E1b commit 10: scala oltre 12 unità nel quadro unità × documenti (piano, FASE 0 approvata)

Stato: **solo piano, nulla implementato, nessuna migrazione.** Base: HEAD `2fae625` (07/11/2026).
Nessun push: si fa a fine domenica con il resto.

## Decisioni chiuse

- Colonne = tipi di documento (3), righe = unità. Crescono le righe (20-50), non le colonne.
- Oltre 12 unità: toggle "Solo unità incomplete" ACCESO di default, celle compatte
  (icona e stato, dati chiave nel tooltip e nel pannello), intestazione e colonna unità
  sticky, campo di ricerca per unità, contatore "N di M unità". Fino a 12 unità: stesso
  markup di oggi, nessun toggle, nessuna ricerca.
- Nessun raggruppamento per palazzina o scala (la tabella `units` non ha quel dato).
- Niente scroll orizzontale oltre 5 colonne: idea futura, non in questo commit.
- Le celle restano `<button>` interi: presente apre il pannello, mancante apre il
  caricamento con unità e tipo già scelti, da verificare (ambra) apre il pannello in revisione.
- Un solo componente per tutti i ruoli, nessun JSX duplicato.
- Nessuna modifica a completions, RLS, migrazioni, classificazione, Excel, `unit-documents.ts`,
  `DocumentiClient.tsx`.

Risposte alle domande di FASE 0:

1. "Incompleta" = almeno una cella `da_verificare` o `mancante`.
2. Ricerca e toggle in AND. Lista vuota con toggle acceso: messaggio "Nessuna unità incompleta
   corrisponde a ..." con azione "Mostra tutte".
3. "+N versioni" non è più nella cella compatta: solo in tooltip (`title`) e `aria-label`.
4. Scroll area annidata con `max-h` solo sopra 12 unità. A 390 px si controlla che non intrappoli
   lo scroll della pagina; se lo fa si abbassa la `max-h` e lo si dice.
5. Si riusa il dev server già attivo sulla 3000 (PID 20428, `C:\progetti\casazero\node_modules\next`).
   Non si spegne a fine prove: lo ferma Filippo prima del build.

## Riscontri (path:riga al 07/11/2026)

- Il quadro si renderizza in `DocumentiClient.tsx:890-896`, dentro `tab === 'panoramica'` (`:887`);
  unico punto d'uso, nessuna prop di ruolo (`UnitDocumentMatrix.tsx:102-108`).
- Contenitore `overflow-x-auto` (`UnitDocumentMatrix.tsx:129`), tabella `border-spacing-y-2` (`:130`),
  colonne `min-w-44` (`:135`), nessun `sticky`, nessun `tfoot`: **la riga di totale non esiste** e non
  viene aggiunta.
- Uno `sticky top-0` dentro un `overflow-x-auto` si aggancia al contenitore, non alla pagina
  (`(dashboard)/layout.tsx:35,44`: `lg:overflow-hidden`, `main lg:overflow-auto`). Soluzione: solo in
  modalità compatta il contenitore passa a `overflow-auto` con `max-h`; `border-spacing-0` e `py-1` sulle
  celle al posto di `border-spacing-y-2`, che lascerebbe fessure sotto l'intestazione sticky.
- Le celle sono già `<button>` interi (`:73-79`); `onUpload` e `onOpenDoc` in `:67-70`;
  `openUploadFor` in `DocumentiClient.tsx:365-371`. Il `title` nativo non è ancora nella matrice
  (pattern esistente: `ReviewList.tsx:203`, `DocumentsTable.tsx:140`).
- Stato delle celle: `UnitDocState` (`unit-documents.ts:63`), 3 colonne da `UNIT_EXPECTATIONS` (`:51-61`),
  ordine unità `compareUnitLabels` (`unit-utils.ts:7-9`).
- `npm run verify` (`scripts/verify.ps1`) fa solo tsc, lint e git status: non lancia i `verify:*`.
  Ogni commit di codice li lancia a parte.
- Residenze con più di 12 unità (SELECT di conteggio, sola lettura): Residenza Cavaccio (15) e
  residenza teolo (12, nessun documento). Cavaccio è nel builder "Archivio pre-demo" (404 per
  pippoloro02): fuori da tutte le prove. "residenza teolo" resta per il confine, solo lettura.

## Piano commit

0. Questo documento, solo documentazione, path esplicito.
1. Regola pura `src/lib/unit-matrix-view.ts` + `scripts/verify-unit-matrix-view.mjs` +
   `verify:unitmatrix` in `package.json`. Soglia come costante nominata, `isCompactMatrix`,
   `isUnitIncomplete`, `filterMatrixRows`, toggle effettivo (`override ?? isCompactMatrix(n)`),
   scelta del messaggio di lista vuota. Prova: `npm run verify:unitmatrix`, `npm run verify:unitdocs`,
   `npm run verify`, più una mutazione a mano del modulo (verify rosso, ripristino con diff identico).
2. UI in `UnitDocumentMatrix.tsx`. Stato solo client (`useState`, nessuna persistenza). Si ferma al
   diff con tsc e lint verdi, in attesa dell'ok di Filippo.

## Piano di prova del commit 2

La residenza sopra 12 unità non è usabile, quindi si prova su **TEST wizard A (5 unità)** con la
costante della soglia abbassata a 3 solo in locale, **mai committata**; a fine prove si ripristina
e si mostra che `git diff` sul file non contiene più traccia dell'abbassamento.

- Modalità compatta su TEST wizard A: toggle, ricerca, tooltip, sticky a 1440, 1024 e 390 px
  (a 390 px: la scroll area non intrappola lo scroll della pagina).
- Scala 20-50 righe: duplicazione delle `<tr>` solo nel DOM con `evaluate_script`, dopo l'abbassamento
  della soglia, senza scrivere dati.
- Click su cella mancante: modale con unità e tipo precaricati, chiusa senza inviare.
- Confine: "residenza teolo" (12 unità), nessun toggle, 12 righe come oggi, solo lettura.
- TEST wizard A con la soglia a 12 (5 unità): snapshot identico a quello di prima.

**Non provabili dal vivo senza scrivere dati** (TEST wizard A non ha unità con documenti): "cella ambra
apre il pannello in revisione" e "riga completa nascosta dal toggle". Coperti solo da lettura del codice
(`UnitDocumentMatrix.tsx:29-30,67-70`) e dal verify del commit 1, non da una prova visiva. Non si
scrivono dati per ottenerla.

Ampiezza attesa: `unit-matrix-view.ts` (nuovo, ~60 righe), `verify-unit-matrix-view.mjs` (nuovo, ~120),
`package.json` (+1 riga), `UnitDocumentMatrix.tsx` (~+90 righe).

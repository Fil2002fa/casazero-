# Handoff — Affordance card Manutenzioni + tap-feedback v2 · 14/07/2026 18:00

## Sommario
Il brief di partenza diceva che le card della pagina Manutenzioni residente non erano cliccabili;
la diagnosi FASE 0 ha provato che era falso (erano già tutte `Link` verso `/manutenzioni/<id>`) e ha
identificato il problema reale: nessuna affordance visiva (niente chevron, niente feedback al tap) e
area di tocco parziale sulla card "Da fare" (il Link era dentro il padding della card, quindi bordi e
fasce vuote non rispondevano). Fix in due commit: affordance uniforme sulle tre sezioni di
Manutenzioni con il pattern v2 (`active:bg-background`), poi migrazione delle card della home dallo
stesso feedback legacy (`active:scale-[0.98]`) a quello v2, così la shell residente ha un solo
tap-feedback sulle card.

## Lavoro completato
- [x] FASE 0: smontata la premessa del brief con prove (card già cliccabili; il "Vincolo A" del brief
      descriveva un bug di annidamento inesistente)
- [x] Commit `cd1aadc` — `ManutenzioniList.tsx`: chevron su tutte e tre le sezioni, area di tocco
      piena su "Da fare" (Link con `p-4` fratello del Button), `active:bg-background`
- [x] Commit `106a161` — home: `MaintenanceCard` e le due card inline di `(app)/page.tsx`
      ("Prossima manutenzione" e teaser Fascicolo) passano da `active:scale-[0.98] transition-transform`
      a `active:bg-background`
- [x] `npx tsc --noEmit` verde su entrambi i commit, diff mostrato prima di ogni commit
- [ ] Aggiornamento della voce `tap-feedback` in `.impeccable/design.json` — lo fa Filippo con
      `/impeccable` (vedi Prossimi passi)

## File toccati
### Creati
- Nessuno.

### Modificati
- `src/app/(app)/manutenzioni/ManutenzioniList.tsx` — le tre sezioni (Da fare / In programma /
  Consigli) condividono ora lo stesso pattern: riga flex con contenuto a sinistra e `ChevronRight`
  (`w-4 h-4 text-text-secondary`, `strokeWidth 1.6`) a destra, feedback `active:bg-background`.
  In "Da fare" il contenitore card non ha più padding: il `Link` porta lui `p-4` + `rounded-t-xl`
  (così lo stato attivo non sborda dagli angoli) e il `Button` "Registra completamento" vive in una
  striscia propria `px-4 pb-4`. Link e Button restano fratelli: zero elementi interattivi annidati.
- `src/components/MaintenanceCard.tsx` — riga 35: `active:scale-[0.98] transition-transform` →
  `active:bg-background`. Il componente è usato solo nella home residente (`(app)/page.tsx`).
- `src/app/(app)/page.tsx` — stesse sostituzioni sulle due card inline: "Prossima manutenzione" e
  teaser Fascicolo.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(app)/manutenzioni/[id]/page.tsx` — conferma che la route di dettaglio residente esiste
  (`/manutenzioni/<id>`, con Garanzia collegata, Fornitore, Storico, Commenti).
- `.impeccable/design.json` e `DESIGN.md` — la voce `tap-feedback` (design.json riga 142) marca
  `active:scale-[0.98]` come pattern legacy "non presente sui componenti ui/ v2"; le eccezioni
  codificate su `border-l-4` del solo `MaintenanceCard`.
- `src/components/N3AdminActions.tsx`, `src/components/AddCommentForm.tsx`,
  `src/components/UploadDocumentForm.tsx` — censimento delle occorrenze residue di `active:scale`.

## Decisioni chiave
- **Verificare la premessa del brief prima di eseguirlo**: il brief chiedeva di rendere cliccabili
  card che lo erano già e imponeva una soluzione (div con `role`/`tabIndex`/`onClick` +
  `stopPropagation`) a un problema inesistente. Applicarla avrebbe sostituito `Link` semantici
  funzionanti con navigazione JS, perdendo href reale, apertura in nuova scheda e prefetch. Scartata
  in FASE 0 con prove; approvata invece la diagnosi reale (affordance + area di tocco).
- **Feedback al tap: `active:bg-background` (v2) e non `active:scale-[0.98]` (legacy)**: le due
  letture di "riusa il pattern esistente" divergevano (la home usava il legacy). Deciso da Filippo:
  pattern v2 (superficie per colore) ovunque, e migrazione della home nello stesso set di commit
  perché il legacy si estingua sulle card invece di divergere tra pagine.
- **Teaser Fascicolo incluso nel commit 2 oltre alle righe citate dal brief**: i numeri indicati
  (:213, :227) puntavano a una card e al suo chevron; la seconda card inline con il feedback legacy
  era il teaser Fascicolo (:235). Incluso perché l'obiettivo dichiarato era "un solo tap-feedback
  nella shell residente"; interpretazione segnalata esplicitamente prima del commit.
- **Finding "side-tab" del design hook lasciato invariato**: durante il commit 2 il hook impeccable
  ha segnalato il `border-l-4` colorato di `MaintenanceCard` come anti-pattern. È l'eccezione
  codificata dal design system stesso (DESIGN.md e design.json: "riservare border-l-4 al solo
  MaintenanceCard legacy") ed era fuori dal diff: non toccato, non soppresso in config senza
  conferma di Filippo.
- **Bottoni legacy NON migrati (scope segnalato, non assorbito)**: `active:scale` resta su
  `AddCommentForm`, `N3AdminActions` (x2), `UploadDocumentForm` e `DocumentiClient` (dashboard).
  Migrare quei bottoni al componente `Button` v2 è un task a sé.

## Stato attuale
### Funziona
- `npx tsc --noEmit`: zero errori su entrambi i commit.
- Nessun elemento interattivo annidato in `ManutenzioniList.tsx` (Link e Button fratelli, come prima
  del refactor ma con area di tocco piena).
- Il chevron sulla sezione "Consigli per la tua casa" non tocca l'invariante Promemoria: nessun
  linguaggio di scadenza, nessun confronto di date.

### Non funziona / da verificare
- **Nessuna verifica visiva eseguita** (niente Playwright/MCP browser nel progetto; login residente
  magic-link/Google). Da controllare a mano con sessione residente: tap su card nelle tre sezioni di
  `/manutenzioni` (navigazione + flash `bg-background`), tap sul bordo della card "Da fare" (prima
  era zona morta), Button "Registra completamento" che apre lo sheet SENZA navigare, card della home.
- Il tap-feedback legacy `active:scale` NON è estinto nella shell (app): vive ancora nei bottoni di
  `AddCommentForm.tsx:34` (dettaglio item via CommentsSection), `N3AdminActions.tsx:42` e `:138`
  (dettaglio item aperto da admin), `UploadDocumentForm.tsx:44` (`(app)/documenti/page.tsx:93`);
  più `DocumentiClient.tsx:296` fuori shell (dashboard).
- Il working tree contiene modifiche PREESISTENTI non di questa sessione e non committate:
  `CLAUDE.md` modificato (sezione Wiki Knowledge Base), `docs/spec.md` cancellato, e i non tracciati
  `.claude/skills/`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`, `docs/Nuovo File PY.py`.

## Prossimi passi
1. Aggiornare (Filippo, con `/impeccable`) la voce `tap-feedback` in `.impeccable/design.json` riga
   142: il legacy `active:scale-[0.98]` non è più su nessuna card, solo sui bottoni legacy elencati
   sopra — la voce va riscritta come "solo bottoni legacy", non rimossa.
2. Verifica manuale con sessione residente (`lorofilippo2002`): le tre sezioni di `/manutenzioni`,
   il bordo della card "Da fare", il Button che apre lo sheet senza navigare, le card della home.
3. Task dedicato di migrazione dei bottoni legacy al componente `Button` v2
   (`AddCommentForm`, `N3AdminActions`, `UploadDocumentForm`, `DocumentiClient`): è il passo che
   estingue davvero `active:scale` dal codebase.
4. Riprendere i punti aperti dell'handoff precedente (`HANDOFF_completion_sheet_redesign_07_14_17_48.md`):
   verifica visiva dello sheet dai due percorsi e domanda aperta su `todayISO()` UTC-based.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Il finding "side-tab" del design hook su `MaintenanceCard` va soppresso in config
  (`/impeccable hooks ignore-value`, decisione di Filippo) o si aspetta la migrazione v2 del
  componente che eliminerà il `border-l-4`?
- I bottoni legacy con `active:scale` vanno migrati al `Button` v2 in un unico task o componente per
  componente man mano che le schermate migrano?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Metodo di lavoro**: La FASE 0 verifica anche la PREMESSA del task, non solo il codice:
  se il brief afferma un comportamento ("le card non sono cliccabili", "manca X"), la diagnosi lo
  prova o lo smentisce con path + riga PRIMA di valutare la soluzione proposta. Una soluzione
  vincolata nel brief ("usare div con role e stopPropagation") non va applicata se il problema che
  presuppone non esiste: si riporta la smentita e ci si ferma.
- **Sezione Regole di codice ricorrenti (bug class note)**: Card con azione interna (es. bottone
  "Registra completamento"): il Link di navigazione e il bottone sono FRATELLI, mai annidati, e il
  padding della card sta sul Link (`p-4` sul Link, non sul contenitore) così l'area di tocco copre la
  card fino ai bordi. Una card cliccabile senza affordance (chevron + feedback al tap) è un bug di
  UX anche se il Link funziona.
- **Sezione Regole di codice ricorrenti (bug class note)**: Tap-feedback ufficiale: superficie per
  colore (`active:bg-background`), mai `active:scale-[0.98]` (legacy in estinzione, residuo solo su
  bottoni legacy non ancora migrati). Su un elemento con angoli arrotondati parziali, lo stato active
  deve rispettare il radius del contenitore (es. `rounded-t-xl` sul Link in testa a una card).

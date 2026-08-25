# Handoff — Feed Attività + fix contrasto token neutral-500 · 09/07/2026 20:40

## Sommario
Sessione in due parti sulla schermata `/admin/attivita` (super_admin): redesign da card-tabella a feed cronologico raggruppato per giorno, seguito da un ciclo `/impeccable critique` → fix mirati → `/impeccable audit`. L'audit ha isolato un problema di contrasto AA reale e sistemico (token `neutral-500` su `bg-background`), tracciato fino alla sua origine (residenza dettaglio, sessione precedente) e corretto a livello di token con un commit dedicato, dopo aver verificato che la premessa iniziale di Filippo ("login, residenze, feed") includeva un token diverso e non effettivamente rotto.

## Lavoro completato
- [x] FASE 0 — mappata la pagina esistente (`DEMO_EVENTS` hardcoded, card-tabella con icone colorate 32px, badge "Dati demo" in header con eyebrow uppercase ritirato)
- [x] COMMIT `d3a6ecb` — redesign a feed: righe `py-3` separate da bordo 1px, raggruppate per giorno (Oggi/Ieri/data estesa, calcolo `startOfDay` corretto), icona 16px neutral-400 (colore `status-overdue` solo sull'evento scaduto), riga a testo unico "Soggetto — azione", timestamp tabular a destra, badge "Test" outline per riga
- [x] `/impeccable critique` dual-agent (Assessment A design review + Assessment B detector) — 27/40, 2 P1 (semantica lista assente, badge Test ripetuto 7 volte), 2 P2/P3 (mix token legacy/v2, icone senza `aria-hidden`) — snapshot persistito in `.impeccable/critique/`
- [x] Fix applicati nello stesso commit: `<ul role="list">`/`<li>` + `aria-label` con conteggio, migrazione `text-text-primary`/`text-text-secondary` → `neutral-900`/`neutral-500`, `aria-hidden="true"` su tutte le icone decorative. Badge "Test" per riga mantenuto deliberatamente (era spec esplicita approvata in FASE 0, non un default modificabile da un finding di critique)
- [x] `/impeccable audit` mirato sul file — 17/20 (Good), individuato un vero P1: `text-neutral-500` (#737373) su `bg-background` (#F4F3EF) diretto, senza card di mezzo, dà ~4.27:1 — sotto soglia AA 4.5:1
- [x] Investigazione di scope prima di modificare `globals.css` (FASE 0 su un token condiviso): confermato che `neutral-500` non è oggi un token custom (è il default Tailwind v4), enumerati tutti i 13 usi in 7 file, distinti quelli falliti (diretti su `bg-background`) da quelli già passanti (dentro `bg-surface`)
- [x] Trovata e riportata a Filippo una discrepanza sulla richiesta iniziale: "login" nella sua lista non condivide il token con "residenze/feed" — usa `--color-text-secondary` (#6B7A74, legacy, 242 occorrenze/40 file), sta su `bg-surface`, contrasto ~4.505:1 (passa già, appena). Filippo ha confermato: `text-secondary` fuori scope
- [x] COMMIT `4b3c15a` — aggiunto `--color-neutral-500: #5E5E5E` in `@theme` (globals.css), scelto per restare distinto da `neutral-600` (#525252, ~7:1, già usato altrove per un secondo livello di grigio) pur superando 4.5:1 con margine (~5.84:1 su `bg-background`, ~6.49:1 su `bg-surface`)
- [x] `tsc --noEmit` verde su entrambi i commit

## File toccati
### Modificati
- `src/app/(dashboard)/admin/attivita/page.tsx` — riscrittura completa: da `EVENT_STYLE`/`DEMO_EVENTS` (testo libero, icone colorate, card wrapper) a `EVENT_ICON`/`buildDemoEvents` (subject/action separati, `Date` reali), aggiunte `dayLabel`/`formatTime`/`groupByDay`/`TestBadge`; struttura finale `<ul role="list">`/`<li>` senza card wrapper (feed puro sulla pagina)
- `src/app/globals.css` — aggiunta `--color-neutral-500: #5E5E5E` dentro `@theme` (prima assente, risolveva al default Tailwind `#737373`)

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_dettaglio_residenza_07_09_20_07.md` — stato di partenza sessione
- `.claude/skills/impeccable/reference/product.md`, `reference/critique.md`, `reference/audit.md` — flussi dei comandi usati
- `src/components/ui/Badge.tsx`, `Table.tsx` — pattern `PILL_BASE`, `TableHead` (`text-[13px] font-medium text-neutral-500`, stesso pattern arbitrario riusato)
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx`, `page.tsx` (righe 230-264, `StatCard`) — verificato quali usi di `neutral-500` stanno su `bg-surface` (passano) vs diretti su `bg-background` (falliscono): trovato che `ResidencePhotoUpload.tsx:122` (sottotitolo/indirizzo in testata residenza, dalla sessione precedente) condivide lo stesso bug del feed
- `src/app/auth/login/LoginForm.tsx` — verificato che l'unico uso di grigio secondario (riga 69, "oppure") usa `text-secondary` legacy dentro una card bianca, non `neutral-500` — origine della discrepanza di scope segnalata a Filippo
- `src/app/(dashboard)/admin/residences/page.tsx` — pattern testata H1 serif riusato identico nel feed

## Decisioni chiave
- **Badge "Test" mantenuto per riga nonostante il P1 del critique**: il critique lo segnalava come rumore ripetuto (7 badge identici durante una demo live) e suggeriva un avviso unico a livello pagina. Non l'ho cambiato perché era una decisione esplicita e approvata da Filippo in FASE 0 nella stessa sessione — un finding di critique non autorizza a sovrascrivere unilateralmente uno spec approvato. Segnalato come backlog, non fixato.
- **`text-[13px]` arbitrario (P3, confermato in 4 file) lasciato in backlog**: correggerlo solo nel file del feed avrebbe creato una nuova incoerenza invece di risolverne una, dato che è già il pattern standard in `Table.tsx`, `Input.tsx`, `residences/[id]/page.tsx`. Serve un'estrazione dedicata (`/impeccable extract`) che tocchi tutti e 4 i punti insieme.
- **`neutral-500` scurito a `#5E5E5E`, non riusato l'hex di `neutral-600`**: Filippo aveva suggerito "es. neutral-600 (~7:1)" come riferimento di massima, ma riusare letteralmente quell'hex avrebbe reso `neutral-500` e `neutral-600` visivamente indistinguibili ovunque compaiano insieme (es. label giorno + badge Test nella stessa riga del feed). Scelto un valore intermedio distinto che comunque supera 4.5:1 con margine reale.
- **`--color-text-secondary` esplicitamente fuori scope**: non fallisce oggi (~4.505:1, borderline ma passa) ed è un token diverso da `neutral-500` con un raggio d'azione enormemente più ampio (242 occorrenze/40 file, incluso tutto lo shell `(app)` residente mai toccato in questa sessione). Toccarlo nello stesso commit avrebbe violato sia "un concern per commit" sia il principio di non introdurre modifiche non richieste con blast radius sproporzionato.
- **Due commit separati, non uno**: il redesign del feed (`d3a6ecb`) e il fix del token di contrasto (`4b3c15a`) sono concern distinti — il secondo è emerso dall'audit del primo ma tocca un file condiviso (`globals.css`) con effetti su tutta l'app, non solo sulla pagina attività. Richiesta esplicita di Filippo di tenerli separati.

## Stato attuale
### Funziona
- `tsc --noEmit` verde su entrambi i commit
- `/impeccable critique` sul feed: 27/40, snapshot in `.impeccable/critique/2026-07-09T18-20-37Z__src-app-dashboard-admin-attivita-page-tsx.md`
- `/impeccable audit` sul feed: 17/20, nessun finding P0/P1 residuo dopo il fix del token
- Scan deterministico (`detect.mjs`) pulito su entrambi i file toccati

### Non funziona / da verificare
- **Nessuna verifica visiva a schermo** in questa sessione (stesso limite ambientale delle sessioni precedenti: nessun tool di browser automation disponibile). Il fix del contrasto è verificato solo per calcolo (formula WCAG relative luminance), non a occhio.
- L'effetto del nuovo `--color-neutral-500: #5E5E5E` sulle altre 11 occorrenze del token (Table.tsx, Input.tsx, ResidencesTable.tsx, StatCard, empty state residenza) non è stato verificato visivamente — per calcolo migliorano tutte, ma andrebbe controllato che il grigio più scuro non alteri la gerarchia visiva percepita nelle tabelle/form già in produzione.

## Prossimi passi
1. **Verifica visiva manuale** in `npm run dev`: pagina Attività (raggruppamento giorno, badge Test, colore rosso solo su scaduta) e le altre superfici che usano `neutral-500` (tabella Residenze, form Input, dettaglio residenza) per confermare che `#5E5E5E` non abbia reso il grigio "troppo scuro" rispetto all'intento originale del sistema.
2. Applicare lo stesso identico bug-pattern-check ("`neutral-500` diretto su `bg-background` senza card di mezzo") alle prossime pagine che verranno migrate al v2 — è un errore facile da ripetere ogni volta che si passa da un layout a card a un layout "nudo" sulla pagina.
3. `/impeccable extract` per `text-[13px] font-medium text-neutral-500` (ruolo Label, 4 file: `Table.tsx`, `Input.tsx`, `attivita/page.tsx`, `residences/[id]/page.tsx`) — backlog esplicito, non bloccante.
4. Follow-up eventuale su `--color-text-secondary` (#6B7A74): è borderline-passante (~4.505:1), non un'urgenza ma da tenere d'occhio se altri usi dello stesso token emergono su sfondi diversi da `bg-surface`.
5. Quando la pagina Attività verrà collegata a eventi reali (non più `DEMO_EVENTS`): il critique ha sollevato il punto che un feed a 7 righe statiche non dice nulla su come si comporterà con volumi reali (50+ eventi/giorno) — rivalutare se serve paginazione/filtro prima di quel momento.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- Il badge "Test" per riga resta la scelta giusta anche quando la pagina avrà eventi reali misti a eventuali eventi demo residui, o va ripensato come avviso a livello pagina prima di quel momento (punto sollevato dal critique, non risolto)?
- `--color-neutral-500` era l'unico modo pulito per risolvere il contrasto, ma ora introduce la prima customizzazione della scala neutra Tailwind in questo progetto — vale la pena documentare esplicitamente in DESIGN.md che `neutral-500` non è più il default stock, per chi in futuro assume che lo sia?
- Il pattern "componente client con stato di upload che possiede anche testo statico correlato" (`ResidencePhotoUpload.tsx`, già una eccezione dichiarata nell'handoff precedente) è anche il punto dove è nato il secondo bug di contrasto di questa sessione — vale la pena un giro di verifica mirato su quel componente prima della demo, dato che è nella testata più visibile della pagina residenza?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Quando un layout passa da un contenitore a card (`bg-surface`) a un layout "nudo" direttamente sulla pagina (`bg-background`), ogni testo `neutral-500`/`text-secondary` già usato in quel punto va riverificato per contrasto — il passaggio card→pagina nuda da solo può far scendere sotto soglia AA un token che sulla card passava per un margine risicato. Emerso da due bug identici e indipendenti (`attivita/page.tsx` in questa sessione, `ResidencePhotoUpload.tsx` nella sessione precedente) sullo stesso pattern.

- **Sezione "Metodo di lavoro"**: Quando una richiesta di fix descrive un problema come "sistemico su più superfici" (es. "login, residenze, feed"), verificare PRIMA che tutte le superfici citate condividano davvero lo stesso token/variabile prima di eseguire un fix a livello di token — token con nomi/ruoli simili ma valori diversi (qui `neutral-500` v2 vs `text-secondary` legacy) possono avere raggio d'azione radicalmente diverso (13 occorrenze/7 file vs 242 occorrenze/40 file). Un fix a livello di token eseguito senza questa verifica rischia di toccare superfici non fallite (o di mancarne una che non condivide il token assunto).

- **Sezione "Regole di codice ricorrenti"**: Quando si scurisce/schiarisce un token di colore condiviso per un fix di contrasto, verificare che il nuovo valore non collida con un token adiacente nella stessa scala già usato per un livello di gerarchia visiva diverso (qui: non riusare l'hex di `neutral-600` per `neutral-500`, altrimenti i due livelli di grigio del sistema diventano indistinguibili ovunque compaiano insieme).

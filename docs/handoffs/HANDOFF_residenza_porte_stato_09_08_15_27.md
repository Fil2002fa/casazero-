# Handoff — Residenza: porte unificate e riga StatCard eliminata · 08/09/2026 15:27

## Sommario

Il PDF del cliente segnalava due difetti sulla pagina di dettaglio residenza
(`/admin/residences/[id]`): la StatCard "Voci attive" mostrava un numero
grezzo (115 su Cavaccio) privo di significato per un costruttore, e le righe
del riepilogo piano manutenzioni non erano cliccabili. Due sessioni di FASE 0
in sequenza hanno prima decomposto il 115 (17 voci di catalogo × 15 unità +
condominio), poi ridisegnato l'intera riga di StatCard: eliminata, sostituita
da uno stato testuale nella porta Manutenzioni, con le righe del riepilogo
diventate link. Tre commit, un concern ciascuno, tutti su `npm run verify`
pulito.

## Lavoro completato

- [x] FASE 0 #1: decomposizione del contatore "Voci attive" (115 = 10 voci
      condominio + 7 voci unità × 15 unità = 17 voci distinte di catalogo;
      46/115 righe sono promemoria, mai "scadute")
- [x] FASE 0 #2: diagnosi read-only per la riprogettazione riga-unica
      (disponibilità dati per sottotitoli, formattazione ritardo, URL voce
      singola, token colore)
- [x] Commit 1 (`6fce465`) — blocco porte estratto in `PorteNav`, condiviso
      dai due rami di ruolo
- [x] Commit 2 (`e9ade5c`) — riga StatCard eliminata; porta Manutenzioni
      mostra `manutenzioniSub(overdueCount)` ("N scadute" rosso / "Tutto in
      regola")
- [x] Commit 3 (`fcca753`) — righe di `PlanSummaryRow` (ritardi + prossime
      scadenze) diventate `<Link>` cliccabili verso Manutenzioni
- [ ] Nessun item aperto di questo lavoro — le tre decisioni del piano
      (B.4, C.3/C.4, A.2/A.3) sono state chiuse dall'utente prima di
      implementare

## File toccati

### Creati

Nessun file nuovo.

### Modificati

- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — commit 1+2+3:
  `PorteNav` condiviso, tipo `Porta` con `subTone?: 'overdue'`,
  `manutenzioniSub()`, rimozione di `StatCard` e di `planItems`/`unitCount`
  ormai inutilizzati, `PlanSummaryRow` da `div` a `Link` con `overflow-hidden`
  sui contenitori e `focus-visible:ring-inset`

### Letti (solo quelli rilevanti per capire il contesto)

- `src/lib/maintenance-status.ts` — fonte di verità di `isCountable`,
  `isOverdueLive`, `countLive`, `resolveCompletionMode`, `formatRelativeDue`;
  confermato che NON esiste (e non è stato aggiunto) un conteggio di "voci
  distinte"
- `src/lib/pluralize.ts` — unico helper di pluralizzazione italiana esistente
  nel repo (`pluralize(n, singular, plural)`); usato da `manutenzioniSub`
- `src/lib/unit-utils.ts` — `unitHasNoActiveAccount`, già usato da
  `buildUnitSummary` per il gap "Unità senza account" (tile ambra)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — accerta
  la whitelist dei query param accettati (`filtro`, `modalita`); nessun
  parametro per targettare una voce singola
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx`
  — `daysOverdue()` locale non esportata (riga 69-72), pluralizzazione
  inline a riga 597 che diverge da `pluralize` usata a riga 189 nello stesso
  file (bug class nota, non toccata: fuori scope dichiarato)
- `src/app/globals.css` — token colore semantici (`--color-semantic-red`,
  `--color-status-overdue`, ecc.), nessun token `danger`

## Decisioni chiave

- **Il conteggio "voci distinte" non si aggiunge (B.4)**: misurato che vale
  17 sia su Residenza Cavaccio (15 unità) sia su Residenza Teolo (10 unità)
  — è il catalogo attivo, non una proprietà della residenza. Un numero
  identico ovunque non informa; l'utente ha annullato questo sub-task prima
  dell'implementazione, niente `countDistinctVoci`, niente modifica al tipo
  `LiveStatusItem`.
- **La porta Manutenzioni mostra stato, non conteggio**: `manutenzioniSub()`
  restituisce `"N scadute"` (rosso, stesso token `text-status-overdue` già
  usato da `PlanSummarySection`) oppure `"Tutto in regola"` quando
  `overdueCount === 0`. Nessun numero di "voci totali" nel sottotitolo.
- **Niente striscia di attenzione separata (C.3/C.4)**: `PlanSummarySection`
  rende già titolo + unità + data per le voci in ritardo, condivisa dai due
  rami. Una striscia aggiuntiva l'avrebbe duplicata; sostituirla avrebbe
  significato riscrivere un componente funzionante per un guadagno nullo.
  Scartata l'idea, si è reso invece cliccabile ciò che già esiste (commit 3).
- **"Unità e inviti" resta `"N unità"` (A.2/A.3)**: il conteggio
  attivo/in-attesa richiederebbe una query nuova su `invites` che la pagina
  non carica oggi; il gap "senza account" ha già un elemento dedicato (tile
  ambra `unitsSenzaAccount`), quindi non va duplicato nel sottotitolo.
- **Righe del riepilogo: `Link`, non `div` — verificata l'assenza di
  annidamento interattivo prima di implementare**: `PlanSummaryRow` non
  contiene elementi cliccabili al suo interno, e il link "Vedi tutte le
  manutenzioni" è fratello dei contenitori di riga nell'albero JSX, mai
  antenato. Le righe "prossime scadenze" linkano a `/manutenzioni` senza
  filtro (non `?filtro=scaduta`, che le escluderebbe essendo per
  costruzione non scadute) — deviazione dichiarata esplicitamente
  dall'istruzione originale "ogni riga linka a `?filtro=scaduta`".
- **`overflow-hidden` aggiunto ai contenitori delle liste**: necessario
  perché le righe ora hanno `hover:bg-background` — senza, lo sfondo hover
  sborda dagli angoli arrotondati del contenitore. Per lo stesso motivo il
  focus ring è passato da `ring-offset-2` a `ring-inset` (l'offset verrebbe
  ritagliato dall'`overflow-hidden`).

## Stato attuale

### Funziona

- `npm run verify` pulito su tutti e tre i commit (solo il warning
  preesistente e non correlato su `src/app/api/reconcile-documents/route.ts`)
- Gate di ogni commit verificato con `grep -c` mirato:
  - Commit 1: `<nav aria-label="Sezioni residenza"` → 1 occorrenza
  - Commit 2: `label="Voci attive"` → 0, `function StatCard` → 0
  - Commit 3: struttura JSX ispezionata a mano, nessun elemento interattivo
    annidato
- Dati riprodotti con query dirette (service role, read-only) su Residenza
  Cavaccio: 1 scaduta live → porta Manutenzioni mostra "1 scaduta" in rosso;
  Residenza Teolo: 0 scadute → "Tutto in regola"

### Non funziona / da verificare

- Nessuna verifica visuale in browser eseguita in questa sessione (il cron
  non gira in locale, ma questo non influisce sul rendering statico — solo
  non ancora controllato a schermo)
- File non correlato **non committato**, presente da prima dell'inizio
  sessione: `src/app/(dashboard)/admin/manutenzioni/page.tsx` — ridisegno dei
  contatori "In ritardo / In corso / In arrivo" con nuovo sistema `StatTone`
  (`overdue`/`inprogress`/`neutral`) e focus ring sui link. Non toccato in
  questa sessione, non è farina di questo lavoro: da chiarire con Filippo se
  va committato a parte o è un lavoro sospeso di una sessione precedente.

## Prossimi passi

1. Verifica visuale in browser della pagina residenza (ramo super_admin e
   ramo admin) su Cavaccio, per confermare che "1 scaduta" in rosso e il
   link della riga in ritardo funzionino come atteso a schermo.
2. Decidere il destino di `src/app/(dashboard)/admin/manutenzioni/page.tsx`
   (modifica non tracciata, preesistente): commit separato o scarto.
3. Se si vuole allineare la formattazione del ritardo tra
   `ManutenzioniClient.tsx:597` (inline) e `:189` (via `pluralize`) — sub-task
   segnalato come fuori scope in FASE 0 #2, punto E, mai assorbito.
4. Valutare se Residenza Cavaccio (demo throwaway, 15 unità) va eliminata
   secondo la nota in CLAUDE.md, ora che la sua UI di dettaglio è stata usata
   per verificare questo lavoro.

## Comandi da rilanciare

```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify
```

## Domande aperte

- Il file `manutenzioni/page.tsx` modificato-non-committato è farina di quale
  sessione? Non è stato toccato qui: va verificato con Filippo prima di
  scartarlo o committarlo, per non perdere lavoro fatto altrove.
- Le righe "prossime scadenze" linkano oggi a `/manutenzioni` senza filtro,
  non `?filtro=scaduta` come nell'istruzione originale (perché non sono
  scadute). Confermare che sia la lettura corretta, non una scorciatoia.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti**:
  "Un contatore aggregato è sospetto quando produce lo stesso numero su
  residenze diverse per dimensione (es. 'voci distinte' = 17 sia su una
  residenza da 10 unità sia da 15): è una proprietà del catalogo, non della
  residenza. Prima di esporre un contatore in UI, verificarlo su almeno due
  residenze di taglia diversa."

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti**:
  "Quando un contenitore con `divide-y` e bordo arrotondato (`rounded-xl`)
  ospita righe che diventano interattive (`hover:bg-*`), aggiungere
  `overflow-hidden` al contenitore — altrimenti lo sfondo hover della riga
  sborda dagli angoli arrotondati. Nello stesso caso, preferire
  `focus-visible:ring-inset` a `ring-offset-2` sulla riga, perché l'offset
  verrebbe ritagliato dall'`overflow-hidden`."

- **Sezione CLAUDE.md di destinazione: Metodo di lavoro**:
  "Prima di rendere cliccabile una riga dentro un blocco che contiene già un
  link 'vedi tutto' o simile, disegnare esplicitamente l'albero JSX
  (indentazione a mano) per dimostrare che il nuovo link è fratello e non
  antenato/discendente del link esistente — è la verifica minima per la bug
  class 'elementi interattivi annidati' quando il rischio non è ovvio a
  colpo d'occhio."

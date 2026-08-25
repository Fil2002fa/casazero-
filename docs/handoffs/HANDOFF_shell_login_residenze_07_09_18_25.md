# Handoff — Shell dashboard, login, residenze (redesign M5) · 09/07/2026 18:25

## Sommario
Sessione di migrazione di tre superfici `(dashboard)` al design system v2 introdotto nella sessione precedente: la shell condivisa (sidebar+layout), la pagina di login, e la home Residenze del super_admin. Ogni superficie ha seguito lo stesso metodo — FASE 0 read-only con STOP, spec approvata da Filippo, implementazione, `/critique` o `/impeccable audit` mirato ai file toccati, fix dei P0/P1 emersi prima del commit, P2/P3 esplicitamente lasciati in backlog. Tre commit separati, uno per superficie.

## Lavoro completato
- [x] COMMIT `6a35000` — shell dashboard: `AdminSidebar.tsx` riscritta (240px, sfondo `bg-background` invece del blocco verde pieno, stati attivo/hover su token, focus-visible + `aria-current` + `rounded-lg` dopo fix da critique), `layout.tsx` senza più la barra header piena
- [x] COMMIT `fd5133c` — login: `LoginForm.tsx` portata su `ui/Input`/`ui/Button`/`Label` (prima pagina reale ad usarli), Google OAuth mantenuto, CTA magic-link rinominata "Accedi con email", tagline marketing rimossa (tenuta solo quella funzionale "Accesso solo su invito"), `BrandMark.tsx` creato ed estratto per essere riusato da `AdminSidebar`
- [x] COMMIT `e2d1104` — residenze: card-grid sostituito da tabella di sistema (`ResidencesTable.tsx`), H1 serif 30/600 + bottone "Nuova residenza" in testata, empty state estratto (`ResidencesEmptyState.tsx`), query riscritta (rimosso fetch morto di `maintenance_items`/`countLive`, aggiunto `admin_assignments` per riga)
- [x] `/impeccable critique` dual-agent sulla shell (score 36/40) — degradato solo sull'ispezione browser (ambiente senza tool di automazione browser né Puppeteer), non sul dual-agent
- [x] `/impeccable audit` mirato sui file di login (18/20) e sui file di residenze (18/20), entrambi con scan deterministico pulito (0 finding)
- [x] `tsc --noEmit` verde su tutti e tre i commit

## File toccati
### Creati
- `src/components/BrandMark.tsx` — icona foglia SVG + wordmark "CasaZero" condivisi tra sidebar e login; render solo `<span>`, mai un heading (commento nel file a difesa dei riusi futuri)
- `src/app/(dashboard)/admin/residences/ResidencesTable.tsx` — client component, tabella Nome/Indirizzo/Unità/Amministratore, riga cliccabile via `useRouter().push()` (non un `<Link>` che avvolge `<tr>`, HTML non lo permetterebbe validamente)
- `src/app/(dashboard)/admin/residences/ResidencesEmptyState.tsx` — empty state estratto dalla pagina, stesso pattern visivo già in uso in `documenti`/`fornitori`/`fascicolo`

### Modificati
- `src/components/AdminSidebar.tsx` — sfondo, stati nav, radius, focus-visible, `aria-current`, `<ul>/<li>` semantici; usa `BrandMark` al posto dell'SVG inline duplicato
- `src/app/(dashboard)/layout.tsx` — rimossa la barra header piena; il logo vive ora solo in cima alla sidebar
- `src/app/auth/login/LoginForm.tsx` — markup portato sui componenti condivisi, `<h1 className="sr-only">` reintrodotto dopo la regressione del refactor (vedi Decisioni chiave)
- `src/app/(dashboard)/admin/residences/page.tsx` — query semplificata, testata serif, delega il rendering della lista a `ResidencesTable`/`ResidencesEmptyState`

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_design_system_v2_07_09_1724.md` — stato di partenza sessione
- `src/components/ui/Button.tsx`, `Input.tsx`, `Table.tsx` — API dei componenti condivisi riusati (incluso `buttonVariants()` applicato direttamente a `<Link>`)
- `src/app/globals.css` — token di sistema (`--color-background/border/brand-dark`, `--font-serif`)
- `src/lib/whitelabel.ts` — conferma che `brandDark` è ormai un valore fisso, non personalizzabile dal costruttore
- `src/app/(dashboard)/admin/residences/[id]/page.tsx`, `AdminBlock.tsx` — pattern esatto della query `admin_assignments` riusato identico nella lista
- `supabase/migrations/001_schema.sql` — schema `admin_assignments` (stato corrente, non storico — invariante rispettato, nessuna scrittura toccata)
- `src/app/(dashboard)/admin/administrators/page.tsx` — convenzione di padding/container di una pagina sorella, per coerenza

## Decisioni chiave
- **`BrandMark` resta uno `<span>`, mai un heading**: la prima estrazione (per riuso tra sidebar e login) ha eliminato senza volerlo l'unico `<h1>` della pagina di login — regressione trovata dall'`/impeccable audit`, corretta reintroducendo un `<h1 className="sr-only">` nella pagina che consuma il brand mark come titolo. Lezione: un componente visivo condiviso non deve mai portare con sé un ruolo semantico specifico di un solo contesto d'uso.
- **Riga di tabella cliccabile via `TableRow` (role="button" + onClick), non `<Link>` che avvolge `<tr>`**: un `<a>` non può contenere validamente elementi di tabella. La pagina Residenze resta un server component per il fetch, ma la tabella è un client component dedicato che naviga con `useRouter().push()`.
- **Bottone "Nuova residenza"/"Crea prima residenza" come `<Link>` con `buttonVariants()`, non un vero `<button>`**: evita di innestare un `<button>` dentro un `<Link>` e riusa esattamente gli stili del sistema (incluso focus-visible) senza duplicarli.
- **Google OAuth mantenuto nel login nonostante lo spec visivo menzionasse solo un campo+bottone**: non si rimuove un metodo di accesso già in uso solo per aderire a uno spec puramente visivo — decisione esplicita di Filippo.
- **CTA login "Accedi con email" invece del letterale "Accedi" richiesto dallo spec**: il bottone invia un magic link, non autentica subito; il testo deve restare onesto sul comportamento reale (segnalato in FASE 0, deciso da Filippo).
- **Fetch morto rimosso dalla query di `residences/page.tsx`**: la vecchia pagina calcolava conteggi di stato (`scadute_residente/amministratore/in_corso`) per alimentare `Stat` non più a schermo nella tabella; rimossi invece di lasciarli come dead code.

## Stato attuale
### Funziona
- `tsc --noEmit` verde su tutti e tre i commit
- `detect.mjs` (scanner deterministico `impeccable`) pulito — 0 finding su tutti i file toccati in sessione
- Shell dashboard: **verificata a schermo da Filippo**, confermata OK
- Login e Residenze: **NON ancora verificate in browser da un umano** — né io né i sub-agent del critique/audit abbiamo avuto un tool di automazione browser disponibile in questo ambiente (nessun Puppeteer installato, nessun tool screenshot/computer-use esposto), e le pagine sono dietro login. Solo lettura di codice + calcolo manuale dei contrasti.

### Non funziona / da verificare
- **Login e Residenze non sono mai stati visti a schermo in questa sessione** — priorità prima del prossimo giro di lavoro su queste superfici.
- Backlog P2/P3 esplicitamente non affrontato in nessuno dei tre commit (dettaglio sotto).

## Prossimi passi
1. **Verifica visiva manuale** di `/auth/login` e `/admin/residences` in `npm run dev` — nessuno screenshot reale esiste ancora per queste due schermate.
2. Creare dal vivo la seconda residenza demo (menzionato come contesto della sessione, non ancora fatto).
3. `/impeccable harden` post-demo, backlog accumulato in tre sessioni consecutive:
   - `scope="col"` mancante su `TableHead` in `ui/Table.tsx` (ora esposto per la prima volta in produzione via Residenze)
   - Pattern N+1 nella query di `residences/page.tsx` (2 round-trip per residenza) — **valutare se il numero di residenze per builder cresce oltre la scala demo**
   - Contrasto `text-neutral-500` su bianco al limite della soglia AA (4.735:1), condiviso tra placeholder di `Input` e cella "Non assegnato" della tabella residenze
   - `adminName` non distingue `null` da stringa vuota in `ResidencesTable.tsx`/`page.tsx` (edge case, non verificato a schema)
4. Continuare la migrazione delle schermate `(dashboard)` rimanenti (`administrators`, `manutenzioni`, ecc.) allo stesso design system v2, seguendo il metodo stabilito in queste tre sessioni.
5. `DESIGN.md` §5 descrive ancora la vecchia sidebar verde scura come "legacy invariata" — disallineamento segnalato dal critique della shell, mai corretto.

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
- `scope="col"` su `TableHead`: merita un fix isolato subito (tocca un solo componente condiviso, rischio basso) o resta bundlato nell'`/impeccable harden` post-demo insieme al resto?
- Il pattern N+1 sulle query per residenza è accettabile finché la demo resta a 1-2 residenze, ma prima di onboardare un builder con un catalogo grande va ripensato — quando decidere che è il momento?
- `BrandMark` come `<span>` neutro ha già causato una regressione una volta (login). Vale la pena imporre la regola con un commento (già fatto) o serve qualcosa di più forte (es. un secondo componente esplicito `BrandHeading` che avvolge `BrandMark` in un `<h1>`, per rendere l'errore impossibile invece che solo documentato)?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Quando un componente visivo condiviso (icona+wordmark, badge, ecc.) viene estratto perché riusato in più superfici, non deve mai portare con sé un ruolo semantico specifico di un solo contesto d'uso (es. essere l'`<h1>` della pagina in una superficie, ma solo un elemento di navigazione in un'altra). Il componente condiviso resta markup neutro; il chiamante applica la semantica corretta (heading, landmark, ecc.) nel proprio contesto. Emerso da una regressione reale: l'estrazione di `BrandMark` ha eliminato l'unico `<h1>` della pagina di login, trovata solo grazie a `/impeccable audit`.

- **Sezione "Regole di codice ricorrenti"**: Per rendere un'intera riga di tabella cliccabile verso una pagina di dettaglio, non avvolgere `<tr>` in un `<Link>` — un `<a>` non può contenere validamente elementi di tabella (markup non valido, rischio di hydration error). Usare `TableRow` con `role="button"`, `tabIndex`, `onClick` e `onKeyDown`, navigando programmaticamente con `useRouter().push()` da un client component dedicato, mentre la pagina resta un server component per il fetch dati. Questa è un'estensione della regola già in CLAUDE.md su "mai elementi interattivi annidati", applicata al caso specifico delle tabelle.

- **Sezione "Metodo di lavoro"**: In questo ambiente di sviluppo, sia `/impeccable critique` che `/impeccable audit` degradano sistematicamente sul passo di ispezione browser (nessun tool di automazione browser esposto, Puppeteer non installato, le pagine `(dashboard)`/`auth` sono dietro login). È una limitazione strutturale dell'ambiente, non un caso isolato — successo in tre sessioni consecutive. Prossime sessioni possono saltare direttamente al fallback (lettura di codice + calcolo manuale dei contrasti + richiesta esplicita a Filippo di una verifica visiva umana) invece di ritentare l'automazione ogni volta.

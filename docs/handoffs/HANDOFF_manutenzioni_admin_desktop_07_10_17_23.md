# Handoff — Manutenzioni admin desktop: lista a tabella + dettaglio pagina · 10/07/2026 17:23

## Sommario
Sessione sul profilo admin (amministratore di condominio) in shell desktop `(dashboard)`, sulla scia del Blocco 1 (gate azione di completamento già corretto a stato live in una sessione precedente). FASE 0 ha confermato che il Blocco 1 è vivo e condiviso correttamente tra lista e dettaglio, e ha scoperto due gap non nella spec originale: i tre contatori e la lista leggevano già lo stesso array (nessun bug da unificare) ma la colonna "Ambito" richiesta avrebbe mostrato "Condominio" costante su ogni riga (la pagina aggrega più residenze per admin multi-residenza). Due commit sequenziali: la lista da card impilate a tabella di sistema, il dettaglio da guscio quasi vuoto a pagina con badge v2 e fix di un bug di stato live ereditato dallo stesso bug-class del Blocco 1.

## Lavoro completato
- [x] FASE 0 read-only: confermato che `N3AdminActions` (azione di completamento) è già condiviso, non duplicato, tra lista (`page.tsx`) e dettaglio (`[id]/page.tsx`); confermato che contatori e card della lista leggevano già lo stesso array `adminItems` (nessuna query separata da unificare); mappato il dettaglio voce riga per riga
- [x] COMMIT `5109d6d` — lista manutenzioni admin da card impilate a tabella di sistema (`ui/Table`): colonne Voce/Residenza/Tipo/Stato/Prossima scadenza/Azione; azione di riga "Prendi in carico" (bottone secondario h-8) solo su righe scadute; contatori confermati sulla stessa fonte dati, dichiarato esplicitamente nel messaggio di commit
- [x] `/impeccable audit` su Commit A (18/20) — 2 fix applicati su richiesta esplicita (mix di generazioni token `semantic-red`→`status-overdue`, label pending disallineata "Attendere…"→"Caricamento…"), 1 finding confermato non-difetto (azione annidata in riga cliccabile, HTML valido, `stopPropagation` già presente)
- [x] COMMIT `27b0d63` — dettaglio voce admin da guscio a pagina: testata con titolo sans 18/600 (non serif: non è una destinazione di sidebar) + `StatusBadge`/`PromemoriaBadge` + `TypeBadge`; card residenza/ambito e fornitore allineate al sistema (p-6, label 13/500 senza uppercase, valori 14); fix di correttezza incluso nello stesso commit — banner "Scadenza" leggeva `status` grezzo invece dello stato live, ed era mostrato anche su voci promemoria (mai dovrebbero mostrare linguaggio di scadenza)
- [x] `/impeccable audit` su Commit B (19/20) — nessun fix richiesto, 1 finding P3 accettato come debito di migrazione parziale esplicito (coesistenza label eyebrow-uppercase legacy su Descrizione/Garanzia vs label di sistema su Residenza/Fornitore)
- [x] `tsc --noEmit` verde su entrambi i commit

## File toccati
### Creati
- `src/app/(dashboard)/admin/manutenzioni/ManutenzioniTable.tsx` — tabella di sistema (`ui/Table`, `StatusBadge`, `TypeBadge`) + azione di riga `TakeChargeAction` (bottone secondario `h-8`, chiama `takeChargeN3` condiviso con `N3AdminActions`, `stopPropagation` su click e keydown per evitare doppia attivazione con il click sulla riga)

### Modificati
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — query con `obligation_type` al posto di `priority`; `ItemRow`/nuova `toRow()` mappano l'item alla riga tabella; sezioni a card (`ItemCard`/`Section`, con `border-l-4` legacy) rimosse, sostituite da `<ManutenzioniTable rows={visibleRows} />`; colonna "Residenza" (non "Ambito") per la natura cross-residenza della pagina
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — query con `obligation_type`/`frequency_months`; rimossi `PriorityBadge`/`effectivePriority` legacy; testata con `StatusBadge`/`PromemoriaBadge`+`TypeBadge` via `resolveObligationType`/`resolveFrequencyMonths` (stesso pattern di `resolveCompletionMode`); banner scadenza corretto a `effectiveStatus` e gated `!isReminder`; card Residenza/Ambito e Fornitore riscritte a `p-6`/label 13/500/valori 14, token `neutral-500`/`neutral-900`

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_sblocco_fascicolo_07_07_17_32.md` (Blocco 1 = COMMIT `4d2a68e`), `docs/handoffs/HANDOFF_admin_manutenzioni_context_07_07_18_27.md` — stato di partenza, contesto contatori/card residenza/builder già committati
- `src/lib/maintenance-status.ts` — fonte di verità stato live, riusata (`isOverdueLive`, `resolveCompletionMode`, `resolveObligationType`, `resolveFrequencyMonths`)
- `src/components/N3AdminActions.tsx`, `src/components/PriorityBadge.tsx`, `src/components/MaintenanceCard.tsx` — componenti legacy, letti per capire il flusso a due stati (Prendi in carico → Segna completata) prima di decidere cosa riusare
- `src/components/ui/{Table,Badge,Button}.tsx` — componenti di sistema riusati tali e quali, nessuna variante nuova necessaria
- `src/app/(dashboard)/admin/residences/[id]/MaintenancePlanTable.tsx` — pattern di riferimento per tabella riga-cliccabile con badge condivisi
- `DESIGN.md`, `PRODUCT.md`, `.claude/skills/impeccable/reference/{audit,product}.md` — metodo e token di sistema per l'audit

## Decisioni chiave
- **Colonna "Residenza" al posto di "Ambito"** — la spec originale chiedeva "Ambito come testo (Condominio/unità)", ma la query di questa pagina filtra sempre `unit_id IS NULL`: quel valore sarebbe stato costante "Condominio" su ogni riga, zero informazione. La pagina aggrega più residenze per un admin multi-residenza (`filippoloro02` ne segue 2, Cavaccio e Teolo) e la vecchia card lista mostrava già il nome residenza per riga — sostituirlo con "Ambito" sarebbe stata una regressione silenziosa. Deviazione dichiarata esplicitamente prima di procedere, confermata implicitamente dal via libera al commit.
- **Bottone di riga "Prendi in carico", non "Registra completamento"** — la spec letterale nominava un'azione a singolo step; FASE 0 ha mostrato che `N3AdminActions` è una macchina a due stati (Prendi in carico → form "Segna completata"). Confermato esplicitamente da Filippo: l'azione di riga copre solo lo stato `scaduta` (singolo bottone, nessun form), le righe `in_corso` restano senza azione in tabella — il form multi-campo resta esclusivo del dettaglio.
- **Nessuna conversione dell'inline expand di `N3AdminActions` in una `Modal` di sistema** — confermato esplicitamente fuori scope: il pattern esistente funziona ed è già condiviso (stesso componente) tra lista e dettaglio.
- **Ramo `PromemoriaBadge` omesso nella tabella lista, incluso nel dettaglio** — `adminItems` in `page.tsx` è filtrato a `completion_mode==='amministratore'` prima di arrivare a `toRow()`: una riga promemoria non può strutturalmente comparire lì, quindi il ramo sarebbe stato codice morto. Il dettaglio (`[id]/page.tsx`) non ha lo stesso filtro (raggiungibile per id diretto), quindi lì il ramo è reale e necessario.
- **Fix del banner scadenza incluso nel Commit B anche se non testualmente nella spec** — Filippo l'ha esplicitamente esteso durante la sessione: stessa bug-class del Blocco 1 (`status` grezzo invece di stato live), toccando comunque la testata nello stesso commit. Incluso anche il gate `!isReminder`, non richiesto esplicitamente ma necessario per correttezza: `resolveLiveStatus`/`isOverdueLive` non vanno mai usati su voci promemoria (docstring di `maintenance-status.ts`), e senza quel gate il banner avrebbe potuto mostrare "Scaduta il..." su una voce che per garanzia di prodotto non è mai scaduta.
- **Token v2 (`status-overdue`/`status-inprogress`/`neutral-600`) nel banner scadenza del dettaglio, non `semantic-red`/`semantic-amber`** — trovato in audit: il banner sedeva direttamente sotto il nuovo `StatusBadge` v2 nella stessa testata; usare `semantic-*` avrebbe prodotto due rossi/ambra leggermente diversi per lo stesso stato sullo stesso schermo. Corretto per coerenza interna al commit, non una migrazione a pagina intera (Descrizione/Garanzia restano legacy, fuori scope).
- **Migrazione parziale dichiarata, non estesa** — le card "Residenza"/"Fornitore" sono state allineate al sistema (p-6, label senza uppercase) su istruzione esplicita; "Descrizione"/"Garanzia" restano sull'eyebrow uppercase ritirato da `DESIGN.md`. Coesistenza dei due stili nella stessa pagina accettata come debito esplicito di migrazione incrementale, non nascosto.

## Stato attuale
### Funziona
- `tsc --noEmit` verde su entrambi i commit
- Scan deterministico `/impeccable` (`detect.mjs`) pulito su tutti e 3 i file toccati
- Audit manuale: Commit A 18/20, Commit B 19/20 — nessun tell AI, fix P2/P3 applicati o confermati non-difetto

### Non funziona / da verificare
- **Nessuna verifica visiva reale in browser** in questa sessione — stesso limite ambientale delle sessioni precedenti. Da vedere a schermo prima della demo: la tabella (in particolare click su riga vs click sul bottone "Prendi in carico", toggle dei 3 contatori con la nuova tabella sotto), il dettaglio (badge in testata, banner scadenza, card residenza/fornitore).
- **RLS su `completions` per `mode='amministratore'`** — stessa domanda aperta ereditata dalla sessione precedente (`HANDOFF_app_residente_m5_07_10_16_17.md`), non affrontata qui: il gate `canAct`/`resolveCompletionMode` è lato UI, non verificato se il server/RLS blocca autonomamente un tentativo su una voce a carico dell'amministratore.
- **Coesistenza di due stili di label nel dettaglio** (P3 di audit, accettata come debito) — "Residenza"/"Fornitore" su Label di sistema, "Descrizione"/"Garanzia" su eyebrow uppercase legacy. Non bloccante, ma visibile se qualcuno guarda la pagina intera.
- Working tree ha `docs/spec.md` cancellato e file non tracciati (`DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py`) presenti da prima dell'inizio di questa sessione — non toccati né generati da questo lavoro, segnalati qui solo per completezza dello stato del repo.

## Prossimi passi
1. Test manuale in browser: login `filippoloro02`, verificare la tabella lista (click riga → dettaglio, click bottone "Prendi in carico" senza navigare, toggle contatori) e il dettaglio (badge testata, banner scadenza corretto su voce scaduta/in corso/pianificata, card residenza/fornitore)
2. Decidere se estendere la migrazione delle label (eyebrow uppercase → Label di sistema) a Descrizione/Garanzia nel dettaglio, o lasciarla come debito fino a un task dedicato di migrazione pagina intera
3. Verificare RLS `completions` per `mode='amministratore'` (domanda aperta ereditata, non ancora affrontata in nessuna sessione recente)
4. Continuare la migrazione delle schermate `(dashboard)` rimanenti al design system v2, se prossima priorità di Filippo (stessa nota lasciata dall'handoff precedente)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- La colonna "Residenza" al posto di "Ambito" nella tabella lista è la scelta giusta a lungo termine, o quando in futuro la query includerà anche item a livello unità servirà comunque una colonna Ambito separata (Condominio/Unità X) in aggiunta alla Residenza?
- Vale la pena un giro dedicato di migrazione label (eyebrow uppercase → Label di sistema) su tutte le card del dettaglio insieme, invece di farlo card per card ogni volta che se ne tocca una?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: "Prima di riusare una colonna/campo suggerito in una spec letterale (es. 'Ambito' come Condominio/Unità), verificare se la query della pagina lo rende costante su ogni riga per costruzione (es. `.is('unit_id', null)`). Un valore che non varia mai non porta informazione: preferire il campo che effettivamente distingue le righe di quella pagina specifica (qui: la residenza, per una pagina che aggrega più residenze di un admin), anche se diverge dalla spec letterale — dichiarandolo esplicitamente prima di procedere."

- **Sezione "Regole di codice ricorrenti"**: "Quando un componente nuovo (v2, in `components/ui/`) e un elemento JSX non ancora migrato convivono nella stessa vista adiacente (es. `StatusBadge` in testata sopra un banner di stato inline), verificare che usino la stessa generazione di token colore (`status-*` vs `semantic-*`). Due elementi che rappresentano lo stesso stato con palette leggermente diverse sullo stesso schermo sono un difetto di coerenza, non solo un errore di 'regola dei token' astratta."

- **Sezione "Invarianti"**: "Il gate `!isReminder`/`resolveCompletionMode(...) !== 'promemoria'` va verificato esplicitamente ogni volta che una superficie legge `next_due_date`/stato live per decidere un banner o un testo — non solo dove già presente un `PromemoriaBadge`. Bug reale di questa sessione: il banner 'Scadenza' nel dettaglio admin non aveva questo gate ed era raggiungibile (a differenza della lista, non filtrata per modalità) su una voce promemoria via id diretto."


# Handoff — Dettaglio residenza (redesign M5) · 09/07/2026 20:07

## Sommario
Sessione di redesign della schermata dettaglio residenza super_admin (`/admin/residences/[id]`), la superficie su cui Furlan passerà più tempo. Metodo seguito: FASE 0 read-only con STOP, spec approvata da Filippo con tre decisioni esplicite, implementazione, `/impeccable audit` mirato ai file toccati, fix del solo P1 (resto in backlog per l'harden post-demo), un commit unico.

## Lavoro completato
- [x] FASE 0 — mappa della pagina esistente: nessuna tabella unità/piano manutenzioni esisteva su questa pagina (vivevano solo nelle sotto-pagine `/units` e `/manutenzioni`); verificato che i contatori scadute/in corso attuali non avevano leak di `activation_status` grazie al filtro `isCountable` nell'helper condiviso
- [x] Decisioni approvate da Filippo: piano manutenzioni include tutti gli stati salvo completata · le "porte" di navigazione (Unità, Manutenzioni, Fascicolo, Documenti, Fornitori) restano · nessuna azione in testata
- [x] COMMIT `2ca5984` — redesign completo: testata unificata (foto 96×72 + H1 serif + indirizzo), 4 stat card (Unità/Voci attive/Scadute/Completamenti) derivate dagli stessi array delle tabelle sottostanti, card amministratore con gap state dedicato, zona attenzione ridotta al solo gap "unità senza account" (le due card rosse scadute sono state rimosse: quel numero ora vive nella stat card "Scadute" ed è consultabile riga per riga nella tabella piano manutenzioni), tabella unità, tabella piano manutenzioni, porte riflowate a griglia
- [x] `/impeccable audit` sugli 8 file toccati (scanner deterministico: 0 finding) — punteggio manuale 15/20 (Good), 0 P0, 1 P1, 4 P2, 2 P3
- [x] Fix P1 applicato nello stesso commit su richiesta esplicita di Filippo: `scope="col"` su `TableHead` (`ui/Table.tsx`) — componente condiviso, sistema contestualmente anche la tabella Residenze
- [x] `tsc --noEmit` verde prima del commit

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` — client component, tabella Unità (via `formatUnitLabel`) + pill "Attivo"/"In attesa" (badge locale, non `StatusBadge`: quello è tipato su `MaintenanceStatus`, sarebbe un abuso di tipo per uno stato invito), riga cliccabile verso `/units`
- `src/app/(dashboard)/admin/residences/[id]/MaintenancePlanTable.tsx` — client component, tabella Voce/Modalità (testo piano)/Tipo (`TypeBadge`)/Stato (`StatusBadge` o `PromemoriaBadge`)/Prossima scadenza, riga cliccabile verso `/manutenzioni`

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — riscrittura completa: da shell mobile (sticky back-bar + hero verde pieno + "porte" impilate) a layout desktop (`max-w-6xl`, stesso pattern di `residences/page.tsx`); query `units`/`maintenance_items` estese in loco (non duplicate) per alimentare sia i contatori sia le nuove tabelle dallo stesso array
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx` — da riga compatta "foto + sostituisci" a thumbnail 96×72 in testata; ora riceve `title`/`subtitle` e renderizza anche l'H1 serif + indirizzo (stessa riga visiva, stesso `<form>`); rimosso lo stato `pickedName` diventato morto col nuovo layout
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — riga "dettaglio" migrata a token v2 (`bg-brand-light`/`text-brand-medium` al posto di hex); gap "nessun admin" riscritto da tile ambra d'allerta a elemento neutro dedicato con `Button variant="secondary"` ("Invita amministratore"). **`AdminModal` (il modale interno, righe ~42-292) resta legacy hex, non toccato** — dichiarato esplicitamente fuori scope, non un oversight
- `src/app/(dashboard)/admin/residences/[id]/loading.tsx` — skeleton riallineato al nuovo layout desktop (era ancora lo skeleton mobile pre-redesign)
- `src/lib/maintenance-status.ts` — aggiunti `resolveObligationType`, `resolveFrequencyMonths` (stesso pattern item→template di `resolveCompletionMode`, già duplicato inline in 4+ punti del codebase) e `resolveLiveStatus` (stato temporale live scaduta/in_corso/in_attesa, stessa logica già duplicata in `admin/manutenzioni/page.tsx:254`); usati solo nella nuova pagina, non retrofittati altrove
- `src/components/ui/Badge.tsx` — `PILL_BASE` esportato (serviva alla pill "Attivo"/"In attesa" della tabella unità)
- `src/components/ui/Table.tsx` — `scope="col"` aggiunto a `TableHead` (fix P1 dall'audit, componente condiviso: sistema Residenze + le due nuove tabelle in un colpo solo)

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_shell_login_residenze_07_09_18_25.md` — stato di partenza sessione
- `src/app/(dashboard)/admin/residences/page.tsx`, `ResidencesTable.tsx` — pattern H1 serif + tabella cliccabile già stabilito nella sessione precedente, riusato identico
- `src/app/(dashboard)/admin/administrators/page.tsx`, `[id]/page.tsx` — convenzioni di container di pagine sorelle (ancora legacy, non hanno offerto un pattern di testata desktop da riusare)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx`, `ManutenzioniClient.tsx` — verificato che filtrano `activation_status !== 'archiviata'` invece di `=== 'inclusa'` (divergente dall'invariante auditata nel Blocco 0); non toccato, segnalato solo
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx`, `UnitsManager.tsx` — pattern esistente di calcolo membri attivi per unità, riusato per `UnitsSummaryTable`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — unico posto con la stessa logica di stato live (`isOverdueLive`/`isInCorso`) già duplicata inline, motivo dell'estrazione di `resolveLiveStatus`
- `src/types/database.ts`, `supabase/migrations/011_catalogo_v2_columns.sql` — conferma che `obligation_type`/`frequency_months` sull'item sono nullable e ereditano dal template (stesso pattern di `completion_mode`)
- `src/app/globals.css` — token v2 (`--color-*`) per verificare l'assenza di un reset globale su `:focus` prima di segnalare il finding sui focus ring

## Decisioni chiave
- **Zona attenzione ridotta al solo gap di configurazione**: le due card rosse "Amministratore in ritardo"/"Residente in ritardo" sono state rimosse dalla zona attenzione. Quel numero (scadute) ora vive nella stat card dedicata e ogni riga è consultabile nella tabella piano manutenzioni sottostante — coerente con lo spec che vincolava le tile ambra della zona attenzione ai soli gap senza elemento dedicato.
- **Card "In regola" filler rimossa**: mostrata prima quando zero scadute; coerente con "La Regola del Silenzio" del design system (nessun colore/stato finché non c'è qualcosa da comunicare).
- **`ResidencePhotoUpload` possiede anche l'identità testuale (nome/indirizzo)**: non un componente separato — thumbnail e H1 devono restare nella stessa riga visiva e nello stesso `<form>`; splittarli avrebbe richiesto sincronizzare due componenti per un solo layout.
- **`AdminModal` esplicitamente fuori scope**: la migrazione a token v2 delle due righe d'ingresso di `AdminBlock` è stata fatta, il modale interno (~250 righe, tutto hex legacy) no — è una superficie a sé, segnalata nell'audit invece che assorbita silenziosamente.
- **Solo il fix P1 applicato in questo commit**: gli altri 6 finding dell'audit (P2/P3) restano in backlog per l'`/impeccable harden` post-demo — decisione esplicita di Filippo, non insabbiata.
- **Piano manutenzioni: tutti gli stati salvo completata**: filtro SQL `.neq('status','completata')` + filtro client `isCountable` (helper auditato) — non un `.eq('activation_status','inclusa')` ridondante che avrebbe potuto divergere dalla fonte di verità.

## Stato attuale
### Funziona
- `tsc --noEmit` verde sul commit finale
- `/impeccable audit` — scanner deterministico pulito (0 finding) su tutti gli 8 file; punteggio manuale 15/20
- Fix P1 (`scope="col"`) applicato e verificato

### Non funziona / da verificare
- **La pagina non è mai stata vista a schermo** — stesso limite ambientale delle ultime tre sessioni (nessun tool di automazione browser, Puppeteer non installato). Verifica visiva manuale in `npm run dev` è il prossimo passo prioritario.
- Backlog P2/P3 dall'audit, esplicitamente non affrontato in questo commit (dettaglio sotto in "Prossimi passi").

## Prossimi passi
1. **Verifica visiva manuale** di `/admin/residences/[id]` in `npm run dev` — in particolare: testata con foto reale (Residenza Cavaccio ha già una foto caricata?), allineamento thumbnail 96×72 + H1 sulla stessa riga su viewport stretti, resa della griglia stat card a 2 colonne sotto `md:`.
2. `/impeccable harden` post-demo — backlog accumulato in questa sessione, da bundlare con quello già aperto nell'handoff precedente:
   - `AdminModal` (`AdminBlock.tsx`, righe ~42-292) ancora su hex legacy, non su token v2
   - Focus ring non brandizzato su due elementi nuovi/toccati: thumbnail foto (`ResidencePhotoUpload.tsx`) e riga "dettaglio" admin (`AdminBlock.tsx`) — funzionano da tastiera (outline browser di default) ma non usano il ring di sistema `ring-3 brand-dark/20`
   - Contrasto `text-neutral-500` su bianco al limite AA (~4.735:1) — ora usato anche nei due empty-state e nella label delle stat card, oltre ai punti già noti (placeholder `Input`, cella "Non assegnato" di Residenze)
   - `transition-all` sulla tile ambra zona attenzione (`page.tsx:192`) — andrebbe scoped a `transition-[filter]`
   - Nessun `<h2>` per le sezioni "Numeri chiave", "Amministratore", "Gestione" (solo "Unità" e "Piano manutenzioni" ce l'hanno) — da bilanciare senza reintrodurre l'eyebrow ritirato
3. Valutare se estrarre `resolveObligationType`/`resolveFrequencyMonths` anche negli altri 4+ punti del codebase che ricalcolano lo stesso pattern inline (`(app)/page.tsx`, `ManutenzioniClient.tsx`, `fornitori/actions.ts`) — non fatto in questa sessione per contenimento di scope, ma l'helper condiviso ora esiste.
4. Continuare la migrazione delle schermate `(dashboard)` rimanenti al design system v2 (`administrators`, `manutenzioni`, sotto-pagine di `residences/[id]`), stesso metodo delle ultime quattro sessioni.

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
- Il pattern N+1 sulle query per residenza (già segnalato nell'handoff precedente) resta invariato in questa sessione — le query di `page.tsx` sono state estese in loco, non moltiplicate, ma il problema architetturale di fondo (query per-residenza invece che batch) non è stato affrontato qui. Stesso punto di decisione già aperto: quando diventa prioritario oltre la scala demo?
- `resolveObligationType`/`resolveFrequencyMonths` sono stati introdotti ma usati solo nella pagina nuova. Vale la pena un task dedicato di retrofit sui 4+ punti duplicati esistenti, o si lascia che la migrazione avvenga schermata per schermata mano a mano che vengono toccate?
- Le "porte" Unità/Manutenzioni ora convivono con le tabelle riepilogo inline sulla stessa pagina — è il layout finale voluto, o in una sessione futura le tabelle inline potrebbero assorbire completamente la navigazione verso le sotto-pagine (es. azioni di gestione spostate in modali invece che pagine separate)?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Quando lo stesso valore va risolto item→template con fallback (`item.campo ?? item.maintenance_templates?.campo ?? null`), scrivere un helper condiviso in `src/lib/maintenance-status.ts` anche se il pattern è già duplicato inline altrove — non serve retrofittare gli usi esistenti nello stesso commit, ma il nuovo codice deve passare dall'helper. Emerso da `resolveObligationType`/`resolveFrequencyMonths`/`resolveLiveStatus`, estratti in questa sessione dopo aver trovato lo stesso calcolo duplicato inline in 4+ punti (`(app)/page.tsx`, `ManutenzioniClient.tsx`, `fornitori/actions.ts`, `admin/manutenzioni/page.tsx`).

- **Sezione "Regole di codice ricorrenti"**: Un componente client che possiede uno stato di upload/form (es. `ResidencePhotoUpload`) può legittimamente renderizzare anche contenuto statico correlato (es. nome/indirizzo residenza) quando i due sono la stessa riga visiva e separarli richiederebbe sincronizzare due componenti per un solo layout — questa è un'eccezione dichiarata alla regola generale di separazione, non un pattern da applicare di default. Va giustificata esplicitamente nel commento del file quando usata (fatto in `ResidencePhotoUpload.tsx`).

- **Sezione "Metodo di lavoro"**: Quando un `/impeccable audit` produce più finding di severità diversa, è legittimo fissare in seduta stante solo il P1 e lasciare P2/P3 in backlog esplicito per un giro `/impeccable harden` dedicato, purché la decisione sia dichiarata da Filippo e il backlog sia elencato per nome nel messaggio di commit — non un'assorbimento silenzioso di scope creep, ma nemmeno un blocco totale sul commit in attesa che tutti i finding siano risolti.

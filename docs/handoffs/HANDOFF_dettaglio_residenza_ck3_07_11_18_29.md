# Handoff — Dettaglio residenza CK3 (quick-nav, stat card, piano ridotto) · 11/07/2026 18:29

## Sommario
CK3: la pagina dettaglio residenza (`(dashboard)/admin/residences/[id]/page.tsx`) nascondeva la navigazione principale (5 card) e le stat card sotto un piano manutenzioni inline che con 15 unità genera centinaia di righe. Diagnosi FASE 0 read-only ha mappato struttura, componenti e query prima di ogni modifica. Sei commit sequenziali, ciascuno con build verde, diff mostrato e audit `/impeccable` a chiusura: quick-nav spostata in alto, stat card diventate link, piano inline ridotto a un riepilogo ritardi + prossime scadenze, skeleton riallineato, e un bug sistemico di spacing (`pb-safe` che azzera il padding-bottom) corretto in modo scoped. Audit finale: **19/20**.

## Lavoro completato
- [x] FASE 0: mappata la pagina (8 sezioni, ordine, componenti, query) prima di ogni modifica; individuata discrepanza tra richiesta e stato reale (non esisteva già una "zona attenzione ritardi" nel dettaglio, solo nella pagina Manutenzioni dedicata)
- [x] Commit A (`4f27220`): quick-nav (5 card) spostata subito sotto la testata, rimossa dal fondo pagina
- [x] Polish P1 (`bb5f6a6`): fix contrasto sotto-testo tile ambra (3.2:1 → 5.6:1), `<nav aria-label="Sezioni residenza">`, focus ring di sistema su quick-nav/tile ambra/back-link — audit 16/20 → 17/20
- [x] Commit B (`c4b6244`): le 4 stat card diventano link (Unità → `/units`, Voci attive → `/manutenzioni`, Scadute → `/manutenzioni?filtro=scaduta`, Completamenti → `/fascicolo`) con hover e focus ring di sistema fin dalla nascita
- [x] Commit C (`01b3ca0`): piano manutenzioni inline ridotto a riepilogo ritardi (max 5, ordinati per ritardo), conteggio riusato da `overdueLive` già calcolato (nessuna seconda chiamata), bottone "Vedi tutte le manutenzioni"; eliminato `MaintenancePlanTable.tsx` — audit 18/20
- [x] Commit D (`ded3043`): skeleton (`loading.tsx`) riallineato al nuovo layout (quick-nav in alto, riepilogo compatto al posto della seconda tabella)
- [x] Commit E (`8f84158`): scoperto e corretto (scoped a questa pagina) un bug sistemico — `.pb-safe` in `globals.css` è unlayered e sovrascrive sempre il `padding-bottom` di `py-*`/`pb-*` sullo stesso elemento, azzerandolo su desktop. Sostituito `py-8 pb-safe` con `pt-8 pb-12` su pagina e skeleton — audit 19/20
- [x] Commit F (`f25b48d`): aggiunta sezione "Prossime scadenze" (max 5, solo mode residente/amministratore, mai promemoria, nessun doppione col blocco ritardi, nessuna nuova query/conteggio) sotto il blocco ritardi; estratto componente condiviso `PlanSummaryRow` per non duplicare il markup tra le due liste — audit 19/20

## File toccati
### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — riordino sezioni, stat card cliccabili, piano→riepilogo, fix padding, sezione prossime scadenze, componente `PlanSummaryRow`
- `src/app/(dashboard)/admin/residences/[id]/loading.tsx` — skeleton riallineato (quick-nav in alto, riepilogo compatto, padding coerente con la pagina reale)

### Eliminati
- `src/app/(dashboard)/admin/residences/[id]/MaintenancePlanTable.tsx` — sostituito dal riepilogo inline in `page.tsx`, unico importatore era questa pagina

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — pattern "zona attenzione" e stato vuoto "Tutto in regola"/"Nessun intervento in ritardo" riusato come riferimento per il riepilogo
- `src/lib/maintenance-status.ts` — helper condivisi `overdueLive`, `isCountable`, `resolveCompletionMode`, `formatRelativeDue` (fonte di verità per stato live, riusati senza ricalcolo)
- `src/lib/formatUnitLabel.ts`, `src/lib/pluralize.ts` — helper condivisi riusati nel riepilogo
- `src/app/(app)/page.tsx` — uso esistente di `formatRelativeDue` come riferimento di formato per "Prossime scadenze"
- `src/app/globals.css` — trovata la causa del bug di spacing (`.pb-safe` dichiarato fuori da `@layer`, quindi unlayered e sempre vincente sulla cascata rispetto alle utility Tailwind)

## Decisioni chiave
- **`.pb-safe` è un bug sistemico, non solo un valore mancante su questa pagina**: essendo dichiarato senza `@layer` in `globals.css:61-64`, per spec CSS Cascade Layers vince sempre su qualunque `py-*`/`pb-*` di Tailwind (che vive in `@layer utilities`), indipendentemente dall'ordine delle classi. Su desktop `env(safe-area-inset-bottom, 0px)` vale 0 → il padding-bottom dichiarato viene azzerato. Tocca 14 file totali (incluse `residences/page.tsx` e `attivita/page.tsx`, che condividono lo stesso pattern rotto ma non se ne accorgono perché il loro contenuto è già lungo). Scelta: fix **scoped solo a questa pagina** (`pt-8 pb-12` al posto di `py-8 pb-safe`), senza toccare `globals.css` — alternativa scartata: "copiare la convenzione delle pagine sorelle", che avrebbe riprodotto lo stesso bug silenzioso.
- **"Prossime scadenze" nessuna nuova query**: filtrata dalla stessa `planItems` già passata per `isCountable`, esclusione doppioni via `Set` degli id già in `overdueItems`, ordine ascendente ereditato dalla query (nessun sort aggiunto) — rispetta la bug class "un solo conteggio, mai ricalcolato".
- **`PlanSummaryRow` estratto invece di duplicare il markup**: stesso identico layout riga per blocco ritardi e blocco prossime scadenze, differiscono solo per colore/testo della data — un solo posto da mantenere.
- **Bottone "Vedi tutte le manutenzioni" con href condizionale**: punta a `?filtro=scaduta` solo se `overdueCount > 0`, altrimenti a `/manutenzioni` senza filtro (evitare di far atterrare su una vista filtrata vuota). Segnalato a Filippo come deviazione dichiarata, non ancora ridiscussa esplicitamente.

## Stato attuale
### Funziona
- Pagina dettaglio residenza: quick-nav visibile subito sotto la testata, 4 stat card cliccabili, piano ridotto a riepilogo ritardi (max 5) + prossime scadenze (max 5, mai promemoria), bottone verso la pagina Manutenzioni dedicata
- Skeleton (`loading.tsx`) coerente col layout reale, stesso padding
- Audit `/impeccable` finale: **19/20** (Excellent), nessun finding aperto su questi file
- Tutti i sei commit con `tsc --noEmit` verde

### Non funziano / da verificare
- **Bug sistemico `.pb-safe`** (vedi Decisioni chiave) resta **non corretto** su 13 file rimanenti (`residences/page.tsx`, `attivita/page.tsx`, tutta la superficie `(app)` PWA, `BottomSheet.tsx`) — per esplicita scelta di Filippo di tenerlo scoped in questa sessione
- Non testato in browser reale (nessuna sessione `npm run dev` + screenshot in questa conversazione) — solo `tsc --noEmit` e ispezione statica del diff
- `CLAUDE.md` (modificato) e `docs/spec.md` (cancellato) risultano ancora non commitati nel working tree, non toccati in nessuna sessione registrata finora — stesso stato segnalato nell'handoff precedente, ancora irrisolto

## Prossimi passi
1. Verificare in browser (`npm run dev`) il rendering reale della pagina con la Residenza Cavaccio (15 unità) prima di considerare CK3 chiuso end-to-end
2. Decidere se e quando promuovere il fix `.pb-safe` da scoped a sistemico (richiede toccare `globals.css` + verificare visivamente tutte le 13 pagine rimanenti — è un lavoro a parte, non un micro-fix)
3. Chiarire lo stato di `CLAUDE.md`/`docs/spec.md` non commitati prima che si accumuli altro lavoro sopra
4. Confermare o correggere l'href condizionale del bottone "Vedi tutte le manutenzioni" quando `overdueCount === 0`

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Il fix scoped di `.pb-safe` va bene così o Filippo vuole già pianificare la sistemazione sistemica (probabilmente un commit dedicato "fix pb-safe cascade layer" con audit visivo su tutte le pagine PWA e dashboard che lo usano)?
- Le modifiche non commitate a `CLAUDE.md`/`docs/spec.md` sono lavoro in corso di un'altra sessione o vanno scartate?

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** — aggiungere una riga sul principio "verificare la convenzione prima di copiarla":

  > Quando si applica una convenzione già presente in altre superfici ("fai come le altre pagine"), verificare che quella convenzione produca davvero l'effetto atteso prima di copiarla — non dare per assodato che il pattern esistente sia corretto solo perché è diffuso. In questa sessione `.pb-safe` (dichiarato fuori da `@layer` in `globals.css`, quindi sempre vincente in cascata su `py-*`/`pb-*`) era copiato identico su 3 pagine dashboard e azzerava il padding-bottom su tutte e 3, invisibile alle prime due solo perché il loro contenuto era già lungo abbastanza da mascherarlo.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** — aggiungere l'estrazione di riga condivisa come esempio della regola esistente sull'helper condiviso:

  > Quando due blocchi della stessa vista renderizzano righe identiche a parte un valore (es. colore/testo di una data), estrarre un componente locale condiviso (es. `PlanSummaryRow`) invece di duplicare il JSX — stesso principio dell'helper condiviso già in vigore per i calcoli, esteso al markup.

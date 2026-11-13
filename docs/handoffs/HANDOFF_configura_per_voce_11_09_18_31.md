# Handoff — Configura per voce (3a) · 09/11/2026 18:31

## Sommario
Chiuso il blocco 3a del piano `docs/handoffs/manutenzioni-ui-piano.md`: il costruttore (super_admin) configura una voce di manutenzione su tutte le unità con un solo Salva, da una nuova tab Configura. Sono stati scritti gli helper puri con il loro verify, la RPC atomica 054 con l'action `configureVoce`, il guscio `SidePanel`, la UI e la rimozione del codice morto. Tutto è su `main` (HEAD `cb987c3`), CI verde. La UI non è stata vista a schermo.

## Lavoro completato
- [x] 3a-1 `5cf612d` — `src/lib/completion-mode.ts`, `src/lib/maintenance-config.ts`, `verify:maintconfig` (130 casi, 24 mutazioni a mano, ripristino identico)
- [x] 3a-2 `203ca1b` — estrazione di `SidePanel` dal pannello di dettaglio (solo refactor)
- [x] 3a-3 `1466efc` — migrazione 054 `czero_configure_voce` (applicata sul DB, riga in `docs/migrations.log`) e action `configureVoce`
- [x] 3a-4a `7823e5b` — rimossa la vista per_unita, la UI del sollecito, `?filtro=`, `?modalita=`, query `unit_members`
- [x] 3a-5 `4c7ddd8` — riscritto come rimozione: `ItemConfigForm.tsx` e `updateMaintenanceItemConfig` cancellati (B53 chiuso per rimozione)
- [x] 3a-4b `cb987c3` — tab Piano / Configura / Escluse, tabella e pannello Configura, footer fisso in `SidePanel`
- [x] Gate di push: `npm run verify` exit 0, 36/36 `verify:*`, build ok, push, CI `verify` success su `cb987c3`
- [ ] Prova a schermo con scrittura vera (non fatta, chrome-devtools spento)

## File toccati
### Creati
- `src/lib/completion-mode.ts` — `COMPLETION_MODES`, `isCompletionMode`, `modeToPriority`, `priorityToMode` (dual-write della colonna legacy `priority`)
- `src/lib/maintenance-config.ts` — `uniformValue`, `buildConfigRows`, `buildConfigChanges`, `validateConfigChanges` (whitelist a mano), `planConfigWrite` (regole di data/status), `MIXED_VALUE`
- `scripts/verify-maintenance-config.mjs` — `npm run verify:maintconfig`
- `supabase/migrations/054_czero_configure_voce.sql` — RPC atomica
- `src/components/ui/SidePanel.tsx` — guscio del pannello laterale (h-dvh, colonna flex, prop `footer` con safe-area)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ConfigureTable.tsx`, `ConfigurePanel.tsx`

### Modificati
- `.../manutenzioni/actions.ts` — aggiunta `configureVoce`
- `.../manutenzioni/ManutenzioniClient.tsx` — da 1039 a ~330 righe: solo lista, Configura, Escluse, dettaglio, modale Includi/Escludi
- `.../manutenzioni/page.tsx` — tolti parametri URL e query `unit_members`; select con `due_basis_override` e `completions(count)`
- `.../manutenzioni/MaintenanceList.tsx` — export di `Cell`, `Dash`, `Mixed`, `ObligationCell`
- `.../manutenzioni/MaintenanceDetailPanel.tsx` — ora usa `SidePanel`
- `.../fornitori/actions.ts` — tolte `updateMaintenanceItemConfig` e le due funzioni priority spostate
- `docs/migrations.log` — riga 054

### Cancellati
- `.../manutenzioni/ItemConfigForm.tsx`

### Letti
- `supabase/migrations/035_accensione_voci_condizionate.sql`, `021`/`042` (guard trigger), `002_rls.sql` (helper `czero_*`), `docs/handoffs/manutenzioni-ui-piano.md` (sezione 3a, D1-D5)

## Decisioni chiave
- **RPC SECURITY INVOKER**: RLS e trigger di guardia restano la barriera; la funzione ripete i controlli (ruolo super_admin, builder, whitelist, status solo `in_attesa`, modalità e priority coerenti, id della voce, fornitori del builder, conteggio righe). Scartato DEFINER perché allargherebbe l'accesso.
- **Piano di scrittura nel TS, scrittura nella RPC**: il TS calcola per riga date e status, la RPC applica in una transazione. Scartata la sequenza di UPDATE con rollback manuale.
- **Sollecito**: UI cancellata (irraggiungibile dal commit 0424861), action `sollecitaItem` tenuta. Va ripensato in lista dopo la demo, con dominio Resend vero.
- **B53 chiuso per rimozione**: l'action con `{ ...data }` non aveva più chiamanti. Il 3b scriverà la sua action per la frequenza.
- **Obbligo sola lettura (D1), residente rifiutato su parti comuni (D5), archiviate con soli campi di configurazione (D4)**, date verso/da promemoria con anteprima (D3).

## Stato attuale
### Funziona
- `tsc`, lint, `npm run verify`, tutti i `verify:*`, build e CI (solo tsc+lint) verdi.
- Simulazione RLS della 054 (blocco `DO` annullato): super_admin del builder ok; super_admin di altro builder, admin, residente e senza sessione rifiutati `42501`; fornitore altro builder `42501`; campi fuori whitelist `22023`; riga di altra voce `P0002`; atomicità provata; `completions` 23 prima e 23 dopo; 0 righe di prova modificate dopo il rollback.

### Non funziona / da verificare
- Mai vista a schermo: tab Configura, pannello, anteprima di conferma, footer fisso a 1440 e 390 px. Manca una scrittura vera su "TEST draft wizard" con ripristino dei valori.
- `configureVoce` (action TS) non è mai stata chiamata: la simulazione ha provato la funzione SQL.
- `env(safe-area-inset-bottom)` vale 0 senza `viewport-fit=cover`: meta viewport non controllato.
- L'anteprima conta anche le righe archiviate ("su N unità" può essere più alto delle unità attive).
- Su voce con garanzia mista, scrivere e poi cancellare tutto azzera la garanzia su tutte le unità.
- Il sollecito non ha più UI.
- La CI esegue solo tsc e lint; `verify:*` e build girano solo in locale.

## Prossimi passi
1. Prova a schermo su "TEST draft wizard" (builder "TEST prova Nicola", account `casazero.prova@gmail.com`): aprire Configura, cambiare modalità/fornitore/garanzia, SELECT prima e dopo, ripristino identico. Mai su teolo, Santa Giustina, Portello, Bassanello.
2. Controllare a 1440 e 390 px footer, Tab, Escape e il pannello di dettaglio (modificato da `SidePanel`).
3. 3b: action per la frequenza per voce e rimozione definitiva di ogni residuo per unità.
4. Dopo la demo del 10/11: ripensare il sollecito in lista.
5. Addendum al backlog: bug class `{ data }` senza `error` in `manutenzioni/page.tsx` (residences, maintenance_items, completions, fornitori) — non toccato.

## Comandi da rilanciare
```bash
npm run verify
npm run verify:maintconfig
npm run dev
npm run build
```

## Domande aperte
- Il drift noto: le RPC di creazione unità (044) lasciano `completion_mode` NULL, quindi un'unità aggiunta dopo una configurazione per voce comparirà "Valori diversi". Da gestire o accettare?
- Orfani possibili: `AwaitingDeliveryLine` senza usi fuori da `components/`; `priorityToMode` senza chiamanti (coperta dal verify). Tenere o togliere?
- Il runner `ubuntu-latest` migra a Ubuntu 26 dal 19/10/2026 (annotazione CI): controllare.

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: Una funzione RPC che scrive su tabelle con RLS è `SECURITY INVOKER`, controlla dentro di sé ruolo e builder del chiamante con errore esplicito (`42501`), accetta solo chiavi in whitelist e confronta le righe toccate con quelle previste (la RLS filtra in silenzio: 0 righe = errore e rollback). Mai `SECURITY DEFINER` senza conferma di Filippo.
- **Metodo di lavoro**: Le simulazioni RLS si fanno con un blocco `DO` (`SET LOCAL ROLE authenticated`, claims per caso, eccezione finale col report) che annulla tutto; dopo si verifica con una SELECT che le righe di prova non siano modificate.
- **Regole di codice**: Un componente guscio per pannelli (`SidePanel`) usa `h-dvh` e colonna flex con corpo scrollabile e footer fisso; mai `100vh` né `inset-y-0` con scroll sull'intero pannello (su mobile il fondo finisce fuori schermo).
- **Metodo di lavoro**: Gli script che riscrivono codice vanno riletti sul diff: un backslash perso in una regex (`/\d+/` → `/d+/`) passa `tsc` e lint.

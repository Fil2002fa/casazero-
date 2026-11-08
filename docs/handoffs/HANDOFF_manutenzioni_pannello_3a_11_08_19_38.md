# Handoff — Manutenzioni: pannello 2a chiuso, piano 3a approvato · 08/11/2026 19:38

## Sommario
Implementato e committato il commit 2a (pannello di dettaglio della voce nella lista costruttore delle manutenzioni). Poi FASE 0 del 3a (Configura per voce): diagnosi read-only, piano scritto in `docs/handoffs/manutenzioni-ui-piano.md` sezione "3a" e decisioni D1-D5 confermate da Filippo. Nessuna riga di codice del 3a è stata scritta; nessuna migrazione applicata. Nulla è pushato (si pusha dopo il 3a, con gate completo).

## Lavoro completato
- [x] 2a: pannello di dettaglio (Stato, Unità, Chi chiamare, Storico, "Configura per unità"), commit `2a086db`
- [x] `verify:maintdetail` a 68 casi, 9 mutazioni a mano rilevate, ripristino identico (sha256 `09929ac1…`)
- [x] Prove DevTools su TEST wizard A, teolo, Santa Giustina (sola lettura) a 1440 e 390 px, con Tab, Escape, Invio; console pulita, nessuna richiesta di rete all'apertura
- [x] FASE 0 del 3a e piano committato, `3590581` (include `docs/handoffs/manutenzioni-ui-fase0.md`)
- [x] Decisioni D1-D5 registrate nel piano
- [ ] 3a-1 … 3a-5: da implementare (vedi Prossimi passi)

## File toccati
### Creati
- `src/lib/maintenance-detail.ts` — helper puro `buildVoceDetail` (riga della lista, regola, chi la chiude, garanzia, fornitori, griglia unità, storico con tetto 20)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/MaintenanceDetailPanel.tsx` — pannello in portal con `useDialogFocus`
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/StateBadge.tsx` — badge di stato condiviso da lista e pannello
- `scripts/verify-maintenance-detail.mjs` — verify del dettaglio (`npm run verify:maintdetail`)
- `docs/handoffs/HANDOFF_manutenzioni_pannello_3a_11_08_19_38.md` — questo file

### Modificati
- `src/lib/maintenance-list.ts` — esportati `compareLabels`, `itemState`, nuovi `lastCompletionByItem` e `rowScopeLabel`
- `src/lib/maintenance-labels.ts` — `MODE_ACTOR_PHRASES`, `DUE_RULE_LABELS`
- `.../manutenzioni/MaintenanceList.tsx` — la riga focalizza il suo bottone prima di aprire; usa `StateBadge` e `rowScopeLabel`
- `.../manutenzioni/ManutenzioniClient.tsx` — stato del pannello, `closeDetail` stabile, `configureFromDetail` (scorre alla voce), `templateKey`, tipo `suppliers` con telefono ed email
- `.../manutenzioni/page.tsx` — embed `suppliers(id, name, phone, email)`
- `package.json` — script `verify:maintdetail`
- `docs/handoffs/manutenzioni-ui-piano.md` — stato dei commit, sezione "3a", decisioni D1-D5

### Letti (rilevanti)
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — `updateMaintenanceItemConfig` (`:126-213`), ramo promemoria, `setTemplateActivationForResidence`
- `src/lib/document-access.ts` (`authorizeResidenceActor`), `src/lib/admin-scope.ts`, `src/lib/activity-log.ts`
- `src/app/api/cron/daily/route.ts` — trattamento dei promemoria
- `src/lib/maintenance-due.ts`, `src/lib/delivery-recalc.ts` — cancello di consegna
- DB (solo SELECT): policy, trigger e funzioni di `maintenance_items`, CHECK di `activity_events`

## Decisioni chiave
- **Obbligo in sola lettura (D1)**: nessun codice scrive `obligation_type`, decisione del 31/10; scartato B/C modificabili per voce.
- **RPC atomica (D2)**: `czero_configure_voce`, migrazione 054, `SECURITY INVOKER`, controllo interno super_admin; scartata la sequenza di statement (un fallimento a metà non è riparabile).
- **Date da e verso Promemoria (D3)**: verso Promemoria `status = in_attesa`, data tenuta se futura o odierna, altrimenti oggi + frequenza; da Promemoria data tenuta, tranne unità non consegnate senza override (torna nulla); anteprima prima di salvare. Scartato il comportamento attuale (oggi + frequenza su tutte).
- **Archiviate (D4)**: ricevono solo i campi di configurazione, non le regole di data.
- **Parti comuni (D5)**: modalità Residente rifiutata lato server e nascosta in UI.
- **Gate**: `authorizeResidenceActor` con solo `super_admin`; `checkAdminInScope` non è il pattern giusto (riguarda i profili admin).
- **Pannello 2a**: mostra sempre la voce intera; il filtro-unità evidenzia solo la riga.

## Stato attuale
### Funziona
- Pannello 2a verificato (gate `npm run verify`, `verify:maintlist` 89/89, `verify:maintdetail` 68/68).

### Non funziona / da verificare
- Vista admin del pannello non provata dal vivo (nessun login admin usato).
- Telefono, email e allegati verificati solo dal verify (nessun dato reale li ha).
- Nulla pushato.
- Rischi noti: la RLS lascia all'admin scrivere via PostgREST colonne di configurazione; `updateMaintenanceItemConfig` ha ancora il mass-assignment B53 fino al 3a-5; `performed_by_name` di alcuni completamenti contiene il ruolo ("Filippo Loro super_admin").

## Prossimi passi
1. 3a-1: `src/lib/completion-mode.ts` (`modeToPriority`/`priorityToMode`), `src/lib/maintenance-config.ts` (`uniformValue`, `buildConfigRows`, `buildConfigChanges`, `validateConfigChanges`, `planConfigWrite`), `scripts/verify-maintenance-config.mjs` + `verify:maintconfig`, mutazioni a mano.
2. 3a-2: estrarre `SidePanel` dal pannello 2a, solo refactor.
3. 3a-3: mostrare a Filippo il SQL della migrazione 054, applicarla, riga in `docs/migrations.log`, action `configureVoce` con gate; prove con `BEGIN; …; ROLLBACK`.
4. 3a-4: tab Piano | Configura | Escluse, tabella e pannello Configura.
5. 3a-5: restringere la vecchia action a `frequency_months` (super_admin con scope), `ItemConfigForm` a sola frequenza, bottone "Frequenza per unità".
6. Dopo il 3a: gate completo, poi push. Mai scrivere su teolo, Santa Giustina, Portello, Bassanello.

## Comandi da rilanciare
```bash
git log --oneline -10 && git status --short
npm run verify
npm run verify:maintlist
npm run verify:maintdetail
npm run dev   # finestra PowerShell separata
```

## Domande aperte
- Estendere il guard `czero_maintenance_items_role_column_guard` alle colonne di configurazione per l'admin (migrazione a parte, da decidere).
- Registrare la configurazione in `activity_events` (serve nuovo event_type con migrazione): fuori dal 3a, da decidere.
- Differenza 35 voci nel DB contro 19 del catalogo v2 (aperta dal piano).
- Unità aggiunte dopo una configurazione per voce nascono con i valori del template ("Valori diversi"): non gestito.
- `docs/handoffs/residenza-da-documento-piano.md` è non tracciato e fuori da questo lavoro.

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: Una server action che scrive su una tabella non deve mai fare lo spread di un payload del client (`{ ...data }`): whitelist esplicita dei campi, validati, con le righe da toccare lette dal server per `residence_id` + id di voce, mai una lista di id dal client.
- **Regole di codice**: Le scritture multi-riga con valori diversi per riga (date, status) passano da una RPC transazionale; mai N statement REST in sequenza, perché un fallimento a metà non è riparabile da un secondo salvataggio.
- **Regole di codice**: Un test di verify non importa dal modulo sotto prova la costante che deve verificare (es. un tetto): va scritta in chiaro nel verify, altrimenti la mutazione di quella costante non viene rilevata.
- **Metodo di lavoro**: Gli helper puri hanno un verify provato rotto a mano con ripristino identico verificato con hash prima della consegna.

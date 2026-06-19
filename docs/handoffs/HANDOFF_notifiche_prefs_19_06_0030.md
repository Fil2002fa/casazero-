# Handoff — Preferenze notifiche + bug fix M5 · 19/06/2026 00:30

## Sommario
Questa sessione ha completato tre bug fix su lavori M5 precedenti (completeN2 con frequenza errata, conformità Fascicolo non allineata al PDF, e verifica cross-residenza condominium items) e ha iniziato l'implementazione delle preferenze di notifica nel Profilo. La feature delle preferenze è **a metà**: migrazione DB e tipi TypeScript sono pronti, ma la server action, la page e il componente client non sono ancora stati scritti.

## Lavoro completato
- [x] Bug fix `completeN2`: ora usa `maintenance_items.frequency_months` come override rispetto a `maintenance_templates.frequency_months` (default 12 mesi se entrambi null)
- [x] Bug fix Fascicolo completions: query migrata da `supabase` (RLS, nessun filtro esplicito) a `adminClient` con filtri `residence_id` + `unit_id` espliciti — i contatori "Totali" e "Anno" ora matchano il PDF
- [x] Verifica bug 3 (condominium items cross-residenza): il codice è già corretto — `residence_id` è applicato prima del `.or()` in tutti e tre i punti (Fascicolo, PDF unit, PDF residence)
- [x] Migrazione DB `007_notification_prefs.sql`: aggiunge colonna `notification_prefs JSONB` su `profiles` con default tutto attivo
- [x] Tipi TypeScript: aggiunta `NotificationPrefs`, `DEFAULT_NOTIFICATION_PREFS` in `src/types/database.ts`
- [ ] Server action `updateNotificationPrefs` — NON SCRITTA
- [ ] `page.tsx` profilo: caricare `notification_prefs` e passarla a ProfiloClient — NON FATTO
- [ ] `ProfiloClient.tsx`: sostituire placeholder "Preferenze notifiche in arrivo con M5" con UI reale — NON FATTO

## File toccati
### Creati
- `supabase/migrations/007_notification_prefs.sql` — `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{...}'`
- `docs/handoffs/HANDOFF_m5_rifinitura_18_06_1440.md` — handoff sessione precedente

### Modificati
- `src/app/(app)/manutenzioni/actions.ts` — `completeN2`: select ora include `frequency_months` dall'item stesso; usa `row?.frequency_months ?? template_freq ?? 12`
- `src/app/(app)/fascicolo/page.tsx` — query completions: rimosso `supabase` (client RLS), sostituito con `adminClient`; aggiunto filtro `residence_id`; tab "Tutti" per client aggiunge `.or('unit_id.eq.U,unit_id.is.null')`; rimosso import `createClient`
- `src/types/database.ts` — aggiunta interface `NotificationPrefs` e costante `DEFAULT_NOTIFICATION_PREFS`

### Letti (rilevanti per il contesto)
- `src/app/(app)/profilo/ProfiloClient.tsx` — capire struttura esistente e placeholder da sostituire
- `src/app/(app)/profilo/page.tsx` — capire cosa viene caricato e passato al client
- `src/app/api/report/route.ts` — usato come riferimento per la logica conformità (era la "fonte di verità")
- `supabase/migrations/001_schema.sql` — verificare struttura `profiles` prima di aggiungere colonna
- `src/types/database.ts` — capire tipi esistenti

## Decisioni chiave
- **JSONB su `profiles` vs. tabella separata**: scelto JSONB su `profiles` per semplicità — 7 chiavi booleane non giustificano una tabella separata; se le preferenze crescono in futuro si può sempre migrare
- **`email_maintenance_due` non memorizzata**: l'email per N2/N3 scadute è un invariante di business ("sempre attiva"), non viene salvata nel JSONB — il motore push/email la leggerà come hardcoded `true`
- **Toggle ottimistico (pianificato)**: il design prevede che il toggle cambi subito in UI e la server action salvi in background; se l'action fallisce si fa revert dello stato locale
- **Canali email solo per eventi rilevanti**: push per tutti e 5 gli eventi; email solo per `maintenance_due` (bloccata), `reminders` e `n3_status` — documenti e commenti non hanno canale email (evitare inbox noise)
- **Bug 3 confermato non-bug**: la divergenza tra conformità unità e conformità residenza è attesa (denominatori diversi); il codice filtra correttamente per `residence_id` prima del `.or()`

## Stato attuale
### Funziona
- `completeN2`: inserisce completion, carica attachment, aggiorna `status = 'in_attesa'` e `next_due_date` con frequenza corretta (override item rispettato)
- Fascicolo: contatori "Totali", "Anno", "Scadute" e conformità % ora usano tutti `adminClient` con scope esplicito → allineati al PDF
- TypeScript check pulito (`npx tsc --noEmit` senza errori)
- Dev server attivo su `http://localhost:3000`

### Non funziona / da verificare
- **Feature notifiche INCOMPLETA**: mancano server action, aggiornamento page.tsx e ProfiloClient.tsx — il Profilo mostra ancora il placeholder "Preferenze notifiche in arrivo con M5"
- **Migrazione 007 non applicata al DB**: il file SQL esiste ma non è stato eseguito nel SQL Editor Supabase
- Tutto il working tree (16 file modificati + 5 nuovi) non è ancora committato

## Prossimi passi
1. **Completare la feature notifiche** — scrivere i tre pezzi mancanti:
   - `src/app/(app)/profilo/actions.ts`: aggiungere `updateNotificationPrefs(prefs: NotificationPrefs)` che fa `supabase.from('profiles').update({ notification_prefs: prefs })` con auth check
   - `src/app/(app)/profilo/page.tsx`: aggiungere `notification_prefs` alla select del profilo, passare `notifPrefs={profile?.notification_prefs ?? DEFAULT_NOTIFICATION_PREFS}` a ProfiloClient
   - `src/app/(app)/profilo/ProfiloClient.tsx`: sostituire il placeholder con UI a toggle, aggiungere `notifPrefs` alle props e stato locale, importare `updateNotificationPrefs`
2. **Applicare migrazione 007** nel SQL Editor Supabase (incolla `supabase/migrations/007_notification_prefs.sql` e Run)
3. **Testare** il flusso: aprire Profilo → cambiare toggle → ricaricare → verificare che i valori persistano
4. **Commit** di tutto il working tree M5

## Comandi da rilanciare
```bash
# Dev server (già attivo, ma per rilanciare)
npm run dev

# Type check
npx tsc --noEmit
```

## Schema preferenze (da implementare)
```typescript
// Chiavi da gestire in UI (tutte in NotificationPrefs da database.ts):
// push_maintenance_due  — push scadenza/scaduta (email: LOCKED sempre attiva)
// push_reminders        — push promemoria periodici
// email_reminders       — email promemoria periodici
// push_n3_status        — push cambio stato N3
// email_n3_status       — email cambio stato N3
// push_new_document     — push nuovo documento (no email)
// push_new_comment      — push nuovo commento (no email)
```

## Domande aperte
- La migrazione 007 deve essere applicata prima di poter testare — chi lo fa e quando?
- Serve un debounce sui toggle delle notifiche (per evitare troppe chiamate se l'utente toggling veloce)? Per ora il design prevede no-debounce con un'action per ogni toggle
- Dopo il deploy su Vercel, il `notification_prefs` JSONB sarà già valorizzato con il default per gli utenti esistenti? Sì, perché il `DEFAULT` nella migrazione si applica alle righe esistenti con `ALTER TABLE ... ADD COLUMN ... DEFAULT`? No — `ADD COLUMN ... DEFAULT` imposta il default solo per le nuove righe in PostgreSQL 11+. Per Postgres 12+ e per Supabase (che usa Postgres 14+) il DEFAULT viene applicato anche alle righe esistenti. Da verificare.

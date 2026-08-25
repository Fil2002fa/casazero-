# Handoff — Security hardening RLS (profiles/invites/completions/maintenance_items) · 13/07/2026 20:12

## Sommario
Sessione di audit di sicurezza partita da una domanda semplice ("perché il login non chiede mai la password?") che ha portato a un censimento completo delle policy RLS INSERT/UPDATE del progetto. Sono emersi 4 finding di privilege-escalation/data-integrity, tutti confermati con prove sul DB vivo e poi corretti con fix mirati (GRANT per colonna, WITH CHECK più stretti, trigger BEFORE UPDATE), ciascuno preceduto da una mini-FASE 0 sui flussi applicativi legittimi per garantire zero regressioni. Chiusa con due fix minori di coerenza (tab password nascosto, bug callback auth) e versionamento di tutte le migration applicate a mano.

## Lavoro completato
- [x] Diagnosi flusso di login: solo `signInWithOtp` (magic link) + Google OAuth, nessuna password mai richiesta in nessun percorso (`grep signInWithPassword` → 0 risultati)
- [x] Censimento completo `pg_policies` (INSERT/UPDATE/ALL) su tutte le 15 tabelle di `public`, incrociato con `information_schema.column_privileges` e `role_table_grants`
- [x] F1 — `profiles`: individuato self-escalation `role`/`builder_id` via UPDATE senza `WITH CHECK` sulle colonne; verificati i soli 3 flussi client legittimi; fix applicato e verificato
- [x] F2 — `invites`: individuato che un admin di residenza poteva emettere un invito `role='super_admin'` (builder-wide, non solo sulla propria residenza); verificato che tutti i 4 call site applicativi usano service role; fix applicato e verificato
- [x] F3 — `completions`: individuato che `performed_by_profile_id` e `residence_id` non erano validati nell'INSERT; verificato `completeN2`/`completeN3` e il caso condominiale (`unit_id IS NULL`); fix applicato e verificato
- [x] F4 — `maintenance_items`: individuato che la policy UPDATE per `admin` non limitava le colonne nonostante il nome "aggiorna stato"; censite tutte le scritture reali (incluso `updateMaintenanceItemConfig`, più ampio del previsto); trigger applicato e verificato
- [x] Versionate le 4 migration (018, 019, 020, 021) con footer di verifica post-apply, un commit per coppia di finding
- [x] Nascosto il tab "Cambio password" in Impostazioni → Sicurezza (nessun flusso di login usa mai una password)
- [x] Fix bug minore nel callback auth: errore di `.single()` su `profiles` non più scartato silenziosamente
- [x] Generato questo handoff

## File toccati
### Creati
- `supabase/migrations/018_profiles_column_grants.sql` — REVOKE UPDATE ampio su `profiles` + GRANT solo su `full_name, notification_prefs, updated_at`
- `supabase/migrations/019_invites_admin_role_check.sql` — WITH CHECK su `invites: admin can insert for assigned` vincolato a `role = 'client'`
- `supabase/migrations/020_completions_insert_hardening.sql` — WITH CHECK su `completions: inserimento autorizzato`: `performed_by_profile_id = auth.uid()` + coerenza `residence_id`↔`unit_id`
- `supabase/migrations/021_maintenance_items_role_column_guard.sql` — trigger `BEFORE UPDATE` che, per `role='admin'`, blocca le colonne di identità e `activation_status`

### Modificati
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — rimosso il tab "Sicurezza" (import `SecurityTab`, entry in `TABS`, branch di rendering); il componente `SecurityTab.tsx` resta nel repo, solo non più raggiungibile
- `src/app/auth/callback/route.ts` — la query `profiles.select(...).single()` ora cattura `error`; se presente, `signOut()` + redirect a `/auth/login?error=no_access` invece di proseguire con `profile` implicitamente `null`

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/auth/login/LoginForm.tsx` — conferma flusso `signInWithOtp`/`signInWithOAuth`, nessuna opzione `shouldCreateUser: false`
- `src/app/welcome/[token]/accept/page.tsx` — conferma che `invite.role` viene applicato as-is a `profiles.role` via service role, punto che rende F2 sfruttabile end-to-end
- `src/app/(app)/profilo/actions.ts`, `src/app/(dashboard)/admin/settings/actions.ts` — censimento scritture legittime su `profiles` (F1)
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts`, `.../units/actions.ts`, `src/app/(app)/profilo/actions.ts` — censimento dei 4 call site di `invites.insert` (F2), tutti via service role
- `src/app/(app)/manutenzioni/actions.ts`, `src/app/(dashboard)/admin/manutenzioni/actions.ts` — confronto `completeN2` vs `completeN3` su `performed_by_profile_id`/`residence_id` (F3)
- `src/app/(app)/manutenzioni/page.tsx`, `ManutenzioniList.tsx` — verifica che la PWA residente non completi mai item a scope condominio (gate UI + gate server su `unitId` obbligatorio)
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts`, `src/app/api/cron/daily/route.ts` — censimento di tutte le scritture reali su `maintenance_items` (F4), inclusa `updateMaintenanceItemConfig`
- `supabase/migrations/002_rls.sql`, `008_rls_completions_hardening.sql`, `013_add_unit_atomic.sql` — policy preesistenti e convenzione del footer di verifica post-apply

## Decisioni chiave
- **GRANT per colonna invece di trigger su `profiles` (F1)**: scelto REVOKE/GRANT a livello di colonna perché più semplice e a prova di futuri bug applicativi (blocca a livello di privilegio Postgres, non di logica); il trigger è stato riservato a F4 dove serviva una logica condizionale per ruolo (admin sì, super_admin/service_role no) che un GRANT statico non può esprimere, perché admin e super_admin condividono lo stesso ruolo Postgres `authenticated`.
- **`invites` WITH CHECK ristretto a `role='client'` per l'admin, non un REVOKE totale**: scartata l'ipotesi di negare del tutto l'INSERT via client autenticato, perché tutti i flussi applicativi passano comunque da service role — il REVOKE totale (più difesa in profondità) resta in backlog invece di essere applicato subito, per non introdurre un secondo meccanismo di enforcement senza necessità immediata.
- **`(unit_id IS NULL OR residence_id = vera residenza di unit_id)` invece di richiedere sempre coerenza (F3)**: la forma naïve avrebbe bloccato i completamenti amministratore su item a scope condominio (`unit_id` è sempre `NULL` in quel caso) — confermato che nessun item con `unit_id NULL` ha oggi `completion_mode` effettivo `residente`, quindi il ramo client (`unit_id IS NOT NULL`) resta corretto così com'è.
- **Allowlist ampia per il trigger F4, non ristretta a `status`**: la policy si chiamava "admin aggiorna stato" ma il codice reale (`updateMaintenanceItemConfig`) fa scrivere all'admin anche `completion_mode`/`obligation_type`/`priority`/`frequency_months`/`warranty_info`/`supplier_id`. Restringere il trigger al solo `status` avrebbe rotto quel flusso: si è scelto di rispecchiare il comportamento reale del codice, rimandando a backlog la domanda di prodotto se sia quello desiderato.
- **Trigger passa-through quando `czero_user_role()` è `NULL`**: necessario perché `completeN2` (ricalcolo scadenza) e il cron giornaliero scrivono `maintenance_items` via service role, dove `auth.uid()` non esiste — la stessa funzione SECURITY DEFINER già usata da tutte le RLS del progetto rende questo comportamento coerente col resto del sistema.
- **Tab "Cambio password" nascosto, non eliminato**: `SecurityTab.tsx` resta nel repo per un eventuale futuro flusso password; si è rimossa solo la sua raggiungibilità dalla UI, in linea con l'istruzione esplicita di Filippo ("nascondi", non "elimina").

## Stato attuale
### Funziona
- Login: solo magic link (`signInWithOtp`) + Google OAuth, verificato nel codice — nessuna password mai richiesta
- F1: verificato sul DB — un utente autenticato non può più scrivere `role`/`builder_id` sul proprio profilo (`ERROR: permission denied for column role`); i 3 flussi legittimi (`full_name`, `notification_prefs`, `updated_at`) continuano a funzionare
- F2: verificato sul DB — un admin non può più creare un invito `role='super_admin'` sulla propria residenza; può ancora creare inviti `role='client'`
- F3: verificato sul DB — un client non può più spoofare `performed_by_profile_id` né forzare un `residence_id` incoerente con la propria unità; i completamenti client (unit-scope) e admin (condominio, `unit_id NULL`) passano entrambi
- F4: verificato sul DB — un admin non può più riassegnare un item a un'altra residenza (anche se propria) né toccare `activation_status`; `takeChargeN3`, `updateMaintenanceItemConfig` e le scritture service role (cron, `completeN2`) continuano a funzionare
- Build: `npx tsc --noEmit` verde dopo entrambi i commit applicativi (tab nascosto, fix callback)
- Tutte e 4 le migration sono versionate con footer di verifica post-apply (query di verifica + test negativo + test positivo), stessa convenzione della 013

### Non funziona / da verificare
- Bug non ancora diagnosticato nel bottone di completamento della `CompletionSheet` PWA residente — menzionato da Filippo in chiusura sessione ma non ancora investigato in questa sessione
- Working tree ha modifiche preesistenti non legate a questa sessione (`CLAUDE.md` modificato, `docs/spec.md` eliminato, più alcuni file non tracciati: `.claude/skills/`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`, `docs/Nuovo File PY.py`) — presenti già all'inizio della sessione, non toccate, da chiarire con Filippo se vanno committate o erano lavoro in corso di un'altra sessione

## Prossimi passi
1. Investigare il bug del bottone di completamento nella `CompletionSheet` PWA residente (dettagli da raccogliere da Filippo — non ancora descritto in questa sessione)
2. Decidere se promuovere `shouldCreateUser: false` su `signInWithOtp` — richiede design perché impatta il flusso di invito residenti (oggi un'email mai vista genera comunque un `auth.users` + profilo `client` via trigger, bloccato solo a posteriori dal callback)
3. Valutare REVOKE totale INSERT su `invites` per il ruolo `authenticated` (difesa in profondità: oggi la RLS resta l'unico argine perché tutti i flussi applicativi passano da service role)
4. Ripulire le due policy duplicate su `invites` ("super_admin gestisce" / "super_admin full", da `002_rls.sql`/`003_m2.sql` circa) — igiene DB, mai toccate in questa sessione
5. Decisione di prodotto: l'admin di residenza deve poter riclassificare i due assi (`completion_mode`/`obligation_type`) via `updateMaintenanceItemConfig`, o va ristretto a super_admin? Da questa decisione dipende se il trigger F4 va poi ristretto
6. Se la risposta al punto 5 è "solo super_admin", allineare `CLAUDE.md` (che oggi implica che solo il form super_admin scriva i due assi) al comportamento realmente implementato, o viceversa correggere il codice
7. Chiarire lo stato dei file non tracciati/modificati nel working tree (`CLAUDE.md`, `docs/spec.md`, `.claude/skills/`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`) prima della prossima sessione

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Build di verifica
npx tsc --noEmit
npm run build
```

## Domande aperte
- L'admin di residenza deve poter modificare Modalità/Tipo (`completion_mode`/`obligation_type`) di un item, o è un privilegio da riservare al super_admin? (vedi punto 5 sopra)
- Vale la pena un REVOKE totale su `invites` lato client autenticato, dato che oggi nessun flusso applicativo lo attraversa comunque?
- Il bug della `CompletionSheet` PWA residente: sintomi, riproducibilità, e se è correlato o meno agli item a scope condominio appena investigati per F3

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Invarianti" — Grant di colonna come difesa primaria su `profiles`**: "`profiles.role` e `profiles.builder_id` sono scrivibili SOLO da service role (mai dal client authenticated): il GRANT UPDATE su `profiles` per `authenticated` è ristretto per colonna (`full_name, notification_prefs, updated_at`, migration 018). Qualunque nuovo campo che il client deve poter scrivere va aggiunto esplicitamente al GRANT — non deve mai includere `role`/`builder_id`."

- **Sezione "Invarianti" — WITH CHECK obbligatorio quando RLS delega a una colonna sensibile**: "Ogni policy RLS INSERT/UPDATE che coinvolge una colonna che determina privilegi o attribuzione legale (`role`, `builder_id`, `performed_by_profile_id`) deve avere un `WITH CHECK` esplicito su quella colonna, non solo sulle colonne di scope (`residence_id`/`unit_id`). Se `WITH CHECK` è omesso, Postgres riusa `USING` — che tipicamente vincola solo l'appartenenza della riga, non i valori scritti."

- **Sezione "Metodo di lavoro" — Mini-FASE 0 sui flussi legittimi prima di ogni fix RLS/permessi**: "Prima di restringere una policy RLS, un GRANT o aggiungere un trigger di guardia, censire con grep+path+riga TUTTI i punti dell'app che scrivono su quella tabella/colonna (sia client autenticato sia service role), per garantire che il fix non rompa un flusso reale. Il service role bypassa sempre RLS/GRANT per colonna: un fix di sicurezza lato client non richiede quasi mai di toccare i flussi service-role, ma va verificato esplicitamente che restino non filtrati (es. via `czero_user_role() IS NULL` nei trigger)."

- **Sezione "Regole di codice ricorrenti" — Nome di una policy/funzione non è garanzia del suo comportamento**: "Una policy chiamata 'admin aggiorna stato' o una funzione con un commento che descrive un'intenzione ristretta può in realtà permettere molto di più (vedi F4: `maintenance_items` UPDATE per admin). Prima di assumere lo scope di una policy/trigger dal nome o dal commento, verificare con query dirette (`pg_policies`, grep sulle chiamate `.update`/`.insert` reali) cosa fa davvero."

---

Ci sono 4 leggi candidate per CLAUDE.md — vuoi promuoverle?

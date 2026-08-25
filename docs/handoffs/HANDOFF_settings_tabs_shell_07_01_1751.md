# Handoff — Shell a 4 tab per Impostazioni super_admin · 01/07/2026 17:51

## Sommario
La pagina `/admin/settings` era un form piatto (solo "Identità costruttore"). È stata
trasformata in una shell a 4 tab (Identità costruttore, Notifiche ricevute, Profilo account,
Sicurezza) mantenendo intatta la logica del form esistente e riadattando i pattern del
profilo residente. Tutto committato su build verde (commit `7d4a61d`).

## Lavoro completato
- [x] Tab shell client (`SettingsShell.tsx`) con stato tab attivo, tab bar underline, nessuna libreria esterna
- [x] Tab 1 "Identità costruttore": form esistente **riposizionato** (non riscritto) in `IdentityTab.tsx`
- [x] Tab 2 "Notifiche ricevute": 4 eventi super_admin con toggle push/email, salvataggio ottimistico
- [x] Tab 3 "Profilo account": nome editabile + email in sola lettura
- [x] Tab 4 "Sicurezza": cambio password ex novo lato client con conferma e validazione min. 8 caratteri
- [x] Server actions `updateAccountProfile` e `updateAdminNotificationPrefs` con guard `role === 'super_admin'`
- [x] Tipi `AdminNotificationPrefs` + `DEFAULT_ADMIN_NOTIFICATION_PREFS` in `database.ts`
- [x] `npm run build` verde
- [x] Commit `7d4a61d` (solo i file della feature, esclusi handoff/scripts/migrazioni preesistenti non tracciati)

## File toccati
### Creati
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — contenitore client con stato tab attivo, header e tab bar; monta il tab selezionato
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — Tab 1; è l'ex `SettingsForm.tsx` senza il wrapper `min-h-screen`/header (ora forniti dalla shell); logica e `updateBuilderSettings` invariati
- `src/app/(dashboard)/admin/settings/NotificationsTab.tsx` — Tab 2; PREF_ROWS con i 4 eventi super_admin, componente Toggle interno, chiamata a `updateAdminNotificationPrefs`
- `src/app/(dashboard)/admin/settings/AccountTab.tsx` — Tab 3; nome editabile via `updateAccountProfile`, email display-only
- `src/app/(dashboard)/admin/settings/SecurityTab.tsx` — Tab 4; `supabase.auth.updateUser({ password })` lato client, due campi + validazione

### Modificati
- `src/app/(dashboard)/admin/settings/page.tsx` — ora fetcha anche `profiles` (full_name, notification_prefs) e `user.email`; passa tutto a `SettingsShell` con merge dei default `DEFAULT_ADMIN_NOTIFICATION_PREFS`
- `src/app/(dashboard)/admin/settings/actions.ts` — aggiunte `updateAccountProfile` (aggiorna `profiles.full_name`) e `updateAdminNotificationPrefs` (aggiorna `profiles.notification_prefs`), entrambe con guard super_admin
- `src/types/database.ts` — aggiunti `AdminNotificationPrefs` (interface) e `DEFAULT_ADMIN_NOTIFICATION_PREFS` (report_generated push/email off di default)

### Eliminati
- `src/app/(dashboard)/admin/settings/SettingsForm.tsx` — sostituito da `IdentityTab.tsx` + `SettingsShell.tsx`

### Letti (rilevanti per il contesto)
- `src/app/(app)/profilo/actions.ts` — pattern `updateProfile` e `updateNotificationPrefs` da riadattare
- `src/app/(app)/profilo/ProfiloClient.tsx` — pattern UI toggle notifiche (PREF_ROWS, componente Toggle)
- `src/app/(app)/profilo/page.tsx` — pattern merge default notifiche lato server
- `src/lib/supabase/client.ts` — browser client per il cambio password lato client
- `src/app/auth/login/LoginForm.tsx` — riferimento uso `supabase.auth.*` lato client

## Decisioni chiave
- **Nessuna migrazione DB**: `profiles.notification_prefs` (JSONB) esiste già ed è usata dal residente; il super_admin ha un profilo separato, quindi chiavi distinte (`AdminNotificationPrefs`) coesistono senza conflitto. Alternativa scartata: namespace/colonna separata (non necessaria).
- **Tab 3 email in sola lettura**: il pattern `updateProfile` tocca solo `profiles`; l'email vive in `auth.users` e cambiarla richiede flusso di conferma auth-level. Scelta coerente col profilo residente. Da valutare se serve email editabile.
- **Eventi notifiche super_admin distinti dal residente**: N3 completata da amministratore, nuovo residente via QR, N2 scaduta >30gg (solo email), report annuale generato (off di default). Non riusati gli eventi residente (N2/N3 scadute, documenti, commenti).
- **Toggle duplicato**: il componente Toggle è stato re-implementato in `NotificationsTab.tsx` invece di estrarre un componente condiviso, per non toccare `ProfiloClient.tsx`. Possibile refactor futuro in componente UI condiviso.

## Stato attuale
### Funziona
- `npm run build` verde (route `/admin/settings` 5.04 kB)
- Le 4 tab si montano/smontano correttamente via stato client
- Tab 1 identità: logica invariata rispetto a prima
- Commit `7d4a61d` pulito con solo i file della feature

### Non funziona / da verificare
- **Non testato runtime nel browser**: toggle notifiche (salvataggio ottimistico + rollback su errore), salvataggio nome account, cambio password end-to-end
- Le notifiche super_admin sono solo **preferenze salvate**: nessun job/cron le legge ancora per inviare effettivamente le notifiche (fuori scope di questo commit)

## Prossimi passi
1. Verifica runtime: aprire `/admin/settings` come super_admin (Furlan), controllare le 4 tab, testare toggle notifiche, salvataggio nome, cambio password
2. Commit 5 (NON iniziato in questa sessione, esplicitamente rimandato): pagina Attività per super_admin
3. Eventuale: collegare gli eventi notifiche super_admin al job giornaliero (`src/app/api/cron/daily`) per l'invio effettivo
4. Eventuale refactor: estrarre il componente `Toggle` condiviso tra `ProfiloClient.tsx` e `NotificationsTab.tsx`

## Comandi da rilanciare
```bash
# Dev server (in finestra PowerShell separata e persistente)
npm run dev

# Build di verifica
npm run build
```

## Domande aperte
- L'email dell'account super_admin (Tab 3) deve essere **modificabile** (con email di conferma via `supabase.auth.updateUser({ email })`) o basta la sola lettura attuale?
- Gli eventi notifiche super_admin vanno effettivamente inviati (cron/Resend) in M5, o per la demo Furlan bastano le preferenze salvate?
- Il file `supabase/migrations/010_builders_contact.sql` risulta non tracciato: confermare che sia già stato applicato nel SQL Editor di Supabase (i campi `contact_email`/`contact_phone` sono già usati dal Tab 1).

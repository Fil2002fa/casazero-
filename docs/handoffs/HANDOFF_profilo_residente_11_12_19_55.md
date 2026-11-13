# Handoff — Profilo residente (Task 6) · 12/11/2026 19:55

## Sommario
Task 6 del ciclo UX/UI residente: il Profilo ora ha una sotto-pagina dedicata "Dati personali" (modifica del solo nome), preferenze email reali collegate al motore di invio e gestione degli errori Supabase. Il lavoro è stato implementato da Codex nel worktree `casazero-codex`, rivisto in sola lettura da Claude Code, committato (`8017858`) e portato in `main` via cherry-pick (`cd55dfb`), con push su `origin/main`.

## Lavoro completato
- [x] Preflight read-only del Profilo (file, dati disponibili, invarianti)
- [x] Analisi infrastruttura notifiche e fattibilità modifica dati personali
- [x] Review finale del diff di Codex (tsc + eslint puliti, GRANT verificato live)
- [x] Sotto-pagina `/profilo/dati-personali`: vista in sola lettura, "Modifica dati personali", Salva/Annulla, solo nome modificabile
- [x] Toggle email reali per `email_reminders` ed `email_n3_status`; rimossi push e "Nuovi documenti"
- [x] Cron e `notifyResidents` rispettano le preferenze (solo invii opzionali)
- [x] Commit `8017858` su `codex/profilo-residente`, cherry-pick `cd55dfb` su `main`, `tsc` + `npm run verify` puliti, push eseguito
- [ ] Migrazione `057_profiles_phone_grant.sql` NON applicata (attende conferma di Filippo)
- [ ] Prove manuali a 375 px e prova cron con preferenza disattivata non eseguite

## File toccati
### Creati
- `src/app/(app)/profilo/dati-personali/page.tsx` — server component: auth, lettura `full_name, phone`, header con freccia indietro a `/profilo`
- `src/app/(app)/profilo/dati-personali/DatiPersonaliClient.tsx` — vista/modifica del nome, telefono ed email in sola lettura
- `src/app/(app)/profilo/dati-personali/loading.tsx` — scheletro
- `src/lib/resident-email-preferences.ts` — `allowsResidentEmail(client, profileId, category)`; chiave mancante = consentito; errore di lettura o profilo mancante = destinatario escluso
- `src/lib/resident-email-preferences.test.mjs` — test node (non incluso in `npm run verify`)
- `supabase/migrations/057_profiles_phone_grant.sql` — `GRANT UPDATE (phone) ON public.profiles TO authenticated`. **Solo nel worktree `casazero-codex`, untracked, non applicata, non committata.**

### Modificati
- `src/app/(app)/profilo/ProfiloClient.tsx` — riga-link a Dati personali, sezione notifiche email con toggle reali, riga bloccata per gli avvisi obbligatori
- `src/app/(app)/profilo/actions.ts` — `updateResidentProfile({fullName})` (validazione 2–100 caratteri, solo `full_name`); `updateNotificationPrefs` valida e fonde le chiavi, errori non più esposti grezzi
- `src/app/(app)/profilo/page.tsx` — destrutturazione di `error` sulle query, `maybeSingle()` sulla membership, props dati personali rimosse
- `src/app/(app)/profilo/loading.tsx` — scheletro con `role="status"`
- `src/app/api/cron/daily/route.ts` — in `notifyUnitMembers` salta il destinatario solo per tipo `n1_due` se `email_reminders` è `false`
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — `notifyResidents` salta chi ha `email_n3_status` a `false`; ora deduplica i membri con un `Set` (cambio non richiesto, benigno)

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/notifications.ts` — `sendEmail` simula l'invio senza `RESEND_API_KEY`; mittente sandbox senza `RESEND_FROM`
- `supabase/migrations/018_profiles_column_grants.sql` — GRANT UPDATE per colonna su `profiles`
- `public/sw.js` — service worker solo cache offline, nessun handler push
- `src/components/BottomNav.tsx`, `src/app/(app)/manutenzioni/[id]/page.tsx` — pattern di navigazione e header con freccia indietro

## Decisioni chiave
- **Telefono in sola lettura**: il GRANT live su `profiles` copre solo `full_name`, `notification_prefs`, `updated_at` (verificato via SELECT il 12/11). Un UPDATE che includeva `phone` falliva (42501) e annullava anche il nome. Scartata la scrittura via service role. Il campo si abilita solo dopo la 057.
- **Sotto-pagina invece di card collassabile**: Profilo compatto a 375 px; il pattern con freccia `ChevronLeft` esiste già in `manutenzioni/[id]`. Scartato `router.back()` a favore di un `Link` esplicito.
- **Niente push**: il service worker non ha handler e non esistono VAPID/sottoscrizioni; rimossi i toggle push invece di mostrarli falsi.
- **Preferenze solo sugli invii opzionali**: avvisi di scadenza e solleciti restano obbligatori e invariati.
- **Fail-closed nell'helper**: se la lettura delle preferenze fallisce il destinatario non riceve l'email opzionale. Ho suggerito la scelta opposta in review; è difendibile ma va confermata.
- **Email non modificabile**: richiederebbe `auth.updateUser`, config "Secure email change" e SMTP, con rischio di perdere l'accesso (login solo OTP). Decisione separata.

## Stato attuale
### Funziona
- `npx tsc --noEmit` exit 0 e `npm run verify` (tsc + lint + git status) puliti su `main` dopo il cherry-pick
- Modifica del solo nome (non richiede la 057); GRANT live confermato senza `phone`
- Nessun telefono persistito nel DB (verificato su 5 profili `client`)

### Non funziona / da verificare
- Modifica del telefono: impossibile finché la 057 non è applicata
- Il test `.mjs` non è stato eseguito da me
- Prova browser a 375 px (form, toggle, inviti/QR, account senza abitazione) non eseguita
- Cron con `email_reminders` disattivato e `notifyResidents` con `email_n3_status` disattivato non provati dal vivo
- `src/app/(app)/` non ha `error.tsx`: i `throw new Error` introdotti in `profilo/page.tsx` non hanno una schermata d'errore dedicata
- Il segnalato "numero che scompare" non è stato riprodotto in browser; il DB non ha scritto alcun telefono

## Prossimi passi
1. Filippo decide sulla 057: se approvata, applicarla via MCP, eseguire la SELECT di verifica su `information_schema.column_privileges` e aggiungere la riga a `docs/migrations.log`; solo dopo abilitare il telefono (action separata + form)
2. Provare in browser a 375 px `/profilo` e `/profilo/dati-personali` con `lorofilippo2002` e con un residente senza abitazione
3. Verificare il cron: disattivare `email_reminders`, lanciare `/api/cron/daily` con `CRON_SECRET` e controllare che l'email `n1_due` non parta; ripetere per `email_n3_status` completando una voce condominiale
4. Decidere se aggiungere `src/app/(app)/error.tsx` (o gestire l'errore in pagina)
5. Decidere fail-open/fail-closed in `allowsResidentEmail` e registrarlo
6. Confermare che `RESEND_API_KEY` e `RESEND_FROM` (dominio verificato) siano impostate su Vercel

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify

# Verifica GRANT su profiles (SELECT)
# SELECT column_name FROM information_schema.column_privileges WHERE grantee='authenticated' AND table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE';
```

## Domande aperte
- Applicare la 057 (allarga un privilegio: serve conferma esplicita)?
- Cambio email residente: serve davvero? Richiede verifica SMTP/config Auth
- Push PWA: progetto a sé (VAPID, tabella sottoscrizioni con RLS, handler nel service worker)
- Fail-open o fail-closed per l'helper delle preferenze?
- La label obbligatoria "Avvisi di scadenza" usa linguaggio di scadenza: va bene per voci Residente/Amministratore, mai su voci Promemoria (qui è una riga generica)

## Stato Git
- `main` = `origin/main` = `cd55dfb` (cherry-pick di `8017858`)
- Modifiche locali preesistenti in `main`, NON toccate: `src/app/(app)/manutenzioni/[id]/page.tsx` (M) e 7 file untracked in `docs/handoffs/`
- Worktree `casazero-codex` (`codex/profilo-residente`): solo `057` untracked
- Branch esistenti: `backup-codex-profilo-residente`, `fix/sicurezza-accesso`

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: "Il motore di invio (cron, azioni admin) deve leggere `profiles.notification_prefs` tramite l'helper condiviso `allowsResidentEmail` prima di ogni email OPZIONALE. Avvisi di scadenza e solleciti sono obbligatori e non consultano le preferenze. Mai esporre nella UI un toggle di notifica il cui canale o evento non è implementato nel motore."
- **Migrazioni e database**: "Prima di esporre in UI un campo modificabile su `profiles`, verificare con SELECT su `information_schema.column_privileges` che il GRANT di colonna per `authenticated` esista. Un UPDATE che include una colonna senza privilegio fallisce per intero (42501): non salvare mai insieme campi con privilegi diversi."
- **Metodo di lavoro**: "Le migrazioni preparate da Codex nel worktree (es. `057`) restano fuori dai commit funzionali finché Filippo non conferma l'applicazione."

# Handoff — Invito residente: PWA installabile e affidabilità · 14/09/2026 14:12

## Sommario
Sessione su due filoni sullo stesso punto di ingresso, `/welcome/[token]`: installazione della PWA residente senza store (icone fisiche + prompt a tre rami) e una serie di bug reali scoperti e corretti sul flusso invito e sulla pagina "Unità e inviti" della dashboard. Ogni fix è nato da una FASE 0 read-only con subagent dedicato, poi verificato riga per riga da me prima di scrivere codice, e ogni commit è passato da `npm run verify` con diff isolato prima di essere creato. Resta aperto un filone di sicurezza del flusso invito (diagnosticato ma non ancora corretto) e il commit 3 dell'onboarding PWA (pianificato, non ancora scritto).

## Lavoro completato
- [x] `9d3a358` — icone fisiche PWA: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` generate con `sharp` dal path della foglia di `BrandMark.tsx`; `icon.svg` riscritto dalla vecchia "C" tipografica alla stessa foglia; tag `apple-touch-icon` esplicito in `src/app/layout.tsx`.
- [x] `d390b2e` — `InstallPrompt.tsx` con tre rami (iOS Safari, Android Chrome, in-app browser WhatsApp/Instagram/Facebook/Messenger/webview generica), montato nella pagina di invito residente. Rilevazione piattaforma in `src/lib/pwa.ts`, testata contro 11 user agent reali.
- [x] `81a25f8` — `welcome/[token]/page.tsx`: la select su `invites` non scartava più `error`; un fallimento tecnico della query ora produce un messaggio distinto ("Errore temporaneo") invece di collassare nel generico "non valido".
- [x] `19e6619` — stesso file: ramo esplicito per `used_at` (era selezionato ma mai confrontato), separato dal caso "non trovato".
- [x] `4515dcb` — stesso file: `.eq('token', token.trim())`. Causa reale, confermata da Filippo, del falso "invito non valido" di oggi: whitespace invisibile in coda al link incollato da WhatsApp/email.
- [x] `3bbf8bf` — `UnitsManager.tsx`: toast di successo su "Genera invito" singolo, prima muto (solo la lista cambiava).
- [x] `887ac1f` — stesso file: try/catch nelle 5 transizioni (`handleAddUnit`, `handleGenerateInvite`, `handleSaveLabel`, `handleRevokeInvite`, `handleBulkInvite`), per chiudere la classe "la server action lancia e l'utente non vede nulla".
- [ ] Onboarding primo avvio (commit 3 del filone PWA) — FASE 0 fatta, piano approvato, codice non scritto: sessione interrotta dal bug del banner "Permessi insufficienti" scoperto nel frattempo.
- [ ] Piano di sicurezza del flusso invito (5 commit diagnosticati, vedi sotto) — non ancora implementato.
- [ ] Test reale di Filippo su iPhone/Android per i commit PWA (`9d3a358`, `d390b2e`) — non eseguito in questa sessione.

## File toccati
### Creati
- `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — foglia su `#04342C`, full-bleed (maskable).
- `src/lib/pwa.ts` — `isStandalone()` e `detectInstallPlatform(ua, nav)`, funzioni pure; riusate anche dal futuro onboarding.
- `src/components/InstallPrompt.tsx` — tre rami di UI installazione, `null` se già standalone/desktop.
- `docs/handoffs/HANDOFF_invito_pwa_fix_09_14_14_12.md` — questo documento.

### Modificati
- `public/icons/icon.svg` — da "C" tipografica a foglia (coerenza col resto del set).
- `src/app/layout.tsx` — aggiunto `icons: { apple: '/icons/apple-touch-icon.png' }`.
- `src/app/welcome/[token]/page.tsx` — montato `<InstallPrompt />` nel ramo residente; select `invites` ora distingue errore tecnico / non trovato / già usato / scaduto; token trimmato prima del confronto.
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — toast di successo su invito singolo; try/catch su tutte le transizioni.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/welcome/[token]/accept/page.tsx` — collega profilo/unità dopo il login, sovrascrive `role`/`builder_id` senza controllare il ruolo corrente (vedi rischio 1 sotto).
- `src/app/auth/callback/route.ts`, `src/app/auth/login/LoginForm.tsx` — flusso login/OTP/Google, come il redirect `next=/welcome/...` bypassa il gate `no_access`.
- `supabase/migrations/001_schema.sql`, `002_rls.sql`, `006_m4.sql`, `009_rls_profiles_super_admin.sql`, `018_profiles_column_grants.sql`, `031_grants_hardening.sql` — DDL di `invites`, `unit_members`, `profiles`; policy RLS su `invites`/`units`/`profiles`; funzioni `czero_user_role()`, `czero_user_builder_id()`, `czero_can_access_residence/unit`.
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts`, `page.tsx` — i 4 gate di ruolo inline che scartavano `error` (bug class del banner "Permessi insufficienti"); query degli inviti con client RLS vs insert con service role.
- `src/components/BrandMark.tsx` — path SVG della foglia, riusato per le icone PWA.
- `src/app/(app)/page.tsx`, `src/app/(app)/layout.tsx`, `src/lib/auth.ts` — verifica che residenza/unità sono già disponibili server-side nella home senza query aggiuntive (per il futuro onboarding).

## Decisioni chiave
- **Icone PWA full-bleed, non arrotondate**: il manifest le dichiara `purpose: "any maskable"`; angoli trasparenti verrebbero riempiti dal colore di sistema dell'OS che applica la propria maschera. Solo `icon.svg` (`purpose: any`) mantiene `rx=112`.
- **`icon.svg` riscritto da "C" a foglia**: era l'unica icona a non corrispondere al marchio reale (`BrandMark.tsx`); scelta non esplicitamente richiesta, segnalata e confermata da Filippo prima del commit.
- **Rilevazione piattaforma via user agent, non `matchMedia`/feature detection**: serve distinguere WhatsApp/Instagram/Facebook/webview generica da Safari/Chrome reali, cosa che le media query non permettono. Testata contro 11 UA reali prima del commit, non solo contro i tre casi principali.
- **`used_at` intercettato prima di `WelcomeResidente`/`WelcomeAdmin`**: la pagina ora ritorna `InviteError` appena trova `invite.used_at`, invece di lasciare passare l'esecuzione fino al banner `InviteUsedBanner` con la CTA ancora attiva sotto. Effetto collaterale non risolto in questo commit: `inviteUsed`/`InviteUsedBanner` più sotto nello stesso file sono ora irraggiungibili (dead code, segnalato ma non rimosso — fuori scope del fix puntuale richiesto).
- **`handleRevokeInvite` ha ricevuto il catch ma non il controllo di `res.error`**: la action `revokeInvite` torna `{error?: string}` ma l'handler lo ignorava già prima di questa sessione. Bug distinto, annotato nel messaggio di commit, non corretto per restare dentro lo scope "un concern per commit".

## Stato attuale
### Funziona
- `npm run verify` verde (tsc + lint, unica warning pre-esistente `src/app/api/reconcile-documents/route.ts:12`) su tutti e 7 i commit di questa sessione, ciascuno con diff isolato mostrato prima del commit.
- Rilevazione piattaforma (`detectInstallPlatform`) verificata via script contro 11 user agent reali (iOS Safari/Chrome/WKWebView/Instagram, iPadOS, Android Chrome/WhatsApp/webview/Facebook, desktop Mac/Win) — output atteso in tutti i casi.
- Diagnosi read-only completa e verificata a mano (righe reali, non solo report del subagent) per: flusso invito, stato PWA pre-esistente, modello di sicurezza dell'invito, banner "Permessi insufficienti", "Genera invito" muto, assenza di logout in dashboard, falso "invito non valido".

### Non funziona / da verificare
- **Non testato su dispositivo reale**: i commit `9d3a358` e `d390b2e` vanno provati sul deploy Vercel (non in dev: `PwaInit.tsx` disinstalla il SW in dev). Punti critici: icona corretta su Home, prompt corretto nei tre rami, comportamento dopo installazione (sessione persa o mantenuta su iOS standalone — rischio noto, non verificato).
- **Sicurezza del flusso invito — 5 rischi diagnosticati, nessuno corretto**:
  1. `accept/page.tsx:35-38` sovrascrive `role`/`builder_id` di chiunque apra un invito, senza controllare il ruolo corrente — un super_admin che apre un invito residente viene degradato a `client`.
  2. Il link è l'unica credenziale: `invites.email` esiste nel DDL ma non è mai scritta né confrontata.
  3. `unit_members.ended_at` non viene mai scritto da nessun codice: membri attivi illimitati per unità, mai chiusi.
  4. (Risolto parzialmente da `19e6619`: la landing non mostra più la CTA su invito già usato.)
  5. Sessione già aperta ignorata: `/welcome/[token]/accept` collega l'account correntemente loggato senza chiedere conferma.
- **Bug units/dashboard non ancora corretti**:
  - Nessun logout nella dashboard (`AdminSidebar.tsx`, `(dashboard)/layout.tsx`) — solo il residente ha `signOut` in `(app)/profilo/actions.ts:109-113`.
  - `handleRevokeInvite` ignora `res.error` anche dopo `887ac1f` (vedi Decisioni chiave).
  - Nessuna guardia su `residences.builder_id === profile.builder_id` in `createInvite`/`createBulkInvites`: un super_admin potrebbe generare inviti su residenze di un builder diverso dal proprio.
  - Causa esatta del banner "Permessi insufficienti" originale (query `profiles` fallita silenziosamente) non confermata a runtime: il fix del punto 1 del piano sicurezza (destrutturare `error`) la renderebbe visibile al prossimo verificarsi, ma non è stato ancora scritto.

## Prossimi passi
1. Filippo testa su iPhone e Android reale i commit `9d3a358`+`d390b2e` (installazione, icona, sessione post-installazione su iOS).
2. Decidere se procedere con l'onboarding primo avvio (commit 3 PWA, piano già pronto: `src/components/Onboarding.tsx`, trigger `isStandalone()` + `localStorage['casazero_onboarding_v1']`, personalizzato con `residenceName`/`unitLabel` già disponibili in `(app)/page.tsx` senza query aggiuntive) o dare priorità al filone sicurezza.
3. Se sicurezza: cominciare dal rischio 1 (`accept: mai degradare` un ruolo esistente) — il più grave, il più isolato.
4. Logout dashboard: server action condivisa (spostare `signOut` da `(app)/profilo/actions.ts` in un modulo comune) + voce in `AdminSidebar.tsx`.
5. Chiudere `handleRevokeInvite`: leggere `res.error` e passarlo a `setLocalError`, come le altre 4 transizioni.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Onboarding vs sicurezza: quale filone ha priorità nella prossima sessione?
- Rischio 3 (membri attivi illimitati): quando un secondo account si collega alla stessa unità, il vecchio membro va chiuso automaticamente (`ended_at`) o serve un passaggio di conferma esplicito? Cambia il modello di passaggio di proprietà, decisione di Filippo.
- Rischio 2 (email vincolata): la si rende obbligatoria in fase di creazione invito, o resta opzionale con confronto solo se presente?
- `InviteUsedBanner`/`inviteUsed` ora irraggiungibili in `welcome/[token]/page.tsx`: rimuovere in un commit di pulizia a parte, o lasciare come margine per un futuro cambio del punto in cui si intercetta `used_at`?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"** — testo proposto da aggiungere in coda alla sezione:

  ```
  - **Mai scartare `error` da una destrutturazione Supabase, mai collassare un
    fallimento tecnico in un messaggio di dominio.** `const { data } = await
    supabase...` senza `error` trasforma qualunque causa (permessi, rete, query
    malformata, credenziali d'ambiente) nello stesso esito UI generico — chi
    guarda lo schermo non può distinguere "non hai i permessi" da "il server ha
    un problema". Trovata tre volte nella stessa sessione: banner "Permessi
    insufficienti" su query `profiles` in `units/actions.ts`, e due varianti su
    `welcome/[token]/page.tsx` (select `invites`). Destrutturare sempre `error`,
    loggarlo lato server, e distinguere nel messaggio utente l'esito di dominio
    (vero "non trovato"/"non autorizzato") dal fallimento tecnico ("riprova").
  ```

Ci sono **1 legge candidata** per CLAUDE.md — vuoi promuoverla?

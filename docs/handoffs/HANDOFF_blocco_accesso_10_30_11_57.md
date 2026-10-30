# Handoff — Blocco accesso · 30/10/2026 11:57

## Sommario
Sessione dedicata a tre cose. Ho chiuso la migrazione 047 e il perimetro delle action su Unità, e quei commit sono già in produzione. Ho risolto il blocco accesso, nato da un incidente in produzione: login fallito con `?error=...&error_code=flow_state_already_used` ignorato, sessione precedente mantenuta senza avviso, nessun logout nella dashboard. Infine ho fatto due ritocchi di interfaccia: la riga "Invita tutte" nella pagina Unità e la rimozione delle sigle abolite dai testi visibili. Dopo il push è emerso un secondo bug di login, codice consegnato sulla root da un URL di deploy, e la difesa nel middleware è committata ma non ancora pushata.

## Lavoro completato
Già su `origin/main` prima di questa sessione di accesso (fino a `f07d14f`):
- [x] `1ac9373` migrazione 047: "Aggiungi" rispetta le dotazioni della residenza (filtro `condition_key` su `residence_features`). Applicata e verificata da Filippo; risultati nel footer del file.
- [x] `1548568` createUnit: perimetro con `requireResidenceAccess`, errore registrato lato server, P0002/42501 mappati su messaggi di dominio.
- [x] `f07d14f` updateUnitLabel: perimetro con `requireUnitsInResidence` e UPDATE filtrato anche per `residence_id`.

Blocco accesso e ritocchi, pushati in questa sessione (`f07d14f..c628500`):
- [x] `5934710` accesso 1: `roleLabel` (super_admin "Costruttore", admin "Amministratore", client "Residente"), componente `AccountIdentity`, `signOut(returnTo)` condiviso in `src/app/auth/actions.ts` e riusato da `/profilo`.
- [x] `2e5f2af` accesso 2: errore di login mai silenzioso.
  - Il middleware intercetta `error_code` (oppure `error` + `error_description`) su qualunque percorso e porta a `/auth/error?reason=<codice>`.
  - Anche la callback, quando lo scambio fallisce, porta lì.
  - La pagina d'errore traduce i motivi noti da una lista ammessa e, se c'è ancora una sessione, mostra `ActiveSessionPanel`.
- [x] `86266c2` login Google con `queryParams: { prompt: 'select_account' }`: dopo il logout Google chiede sempre quale account usare.
- [x] `245e259` accesso 3: `/auth/login` con sessione già attiva mostra "Sei ancora connesso come…", con "Continua come <nome>" ed "Esci e accedi con un altro account". Il link d'invito e il deep link restano conservati.
- [x] `be7a813` accesso 4: identità e "Esci dall'account" in fondo alla navigazione della dashboard, nella sidebar e nel drawer mobile. Il cerchietto con le iniziali nella barra mobile è stato rimosso su richiesta.
- [x] `7d2cf25` accesso 5: in `/profilo` il ruolo passa da `roleLabel`.
- [x] `986c330` pagina Unità: tolto il bottone "Invita le unità consegnate (N)" dalla testata. Al suo posto, solo se N > 0, compare la riga "N unità consegnate da invitare · Invita tutte". Azione e riepilogo sono gli stessi di prima (`createBulkInvites` e `bulkInviteMessage`).
- [x] `c628500` testi visibili senza sigle abolite:
  - le notifiche in `/profilo` diventano "Avanzamento lavori dell'amministratore";
  - nella pagina d'invito dell'admin: "Il ciclo dei lavori: presa in carico → in corso → completata, con allegati.";
  - nel report PDF: "X manutenzioni in regola su N (promemoria escluse)".
  - Le chiavi `push_n3_status` ed `email_n3_status` sono invariate, perché sono dati in `profiles.notification_prefs`.

Committato ma **non pushato**:
- [x] `199fe41` middleware: se arriva `?code=` su un percorso diverso da `/auth/callback` e non c'è una sessione, porta a `/auth/callback` con `code` e `next`. La regola sta prima di quella "pagina protetta → login".

Configurazione Supabase (fatta da Filippo):
- [x] Redirect URLs: `https://casazero.vercel.app/**`, `http://localhost:3000/**`, `https://casazero.vercel.app/auth/callback**` e `http://localhost:3000/auth/callback**`. Secondo Filippo c'è anche il wildcard per gli URL di deploy Vercel, ma il valore esatto non è stato riportato in sessione.
- [x] Template Magic Link: è il modello standard di Supabase, senza SMTP personalizzato, e il link è corretto.

## File toccati
### Creati
- `supabase/migrations/047_add_unit_filtro_dotazioni.sql` — `CREATE OR REPLACE` di `czero_add_unit_with_items` con il filtro `condition_key`. In testata è documentato il limite su `p_features='{}'`; nel footer ci sono gli esiti della verifica.
- `src/lib/roleLabel.ts` — unica fonte del nome visibile del ruolo, con "Ruolo non riconosciuto" come fallback.
- `src/components/AccountIdentity.tsx` — "chi sono" presentazionale: nome (in mancanza email, poi "Account senza nome") e `ruolo · email`.
- `src/components/ActiveSessionPanel.tsx` — pannello "Sei ancora connesso come", con Continua ed Esci; usato da `/auth/login` e `/auth/error`.
- `src/app/auth/actions.ts` — `signOut(returnTo)`: logout e redirect a `/auth/login` (o al `returnTo` di login, validato con `safeNextPath`).
- `src/app/auth/error/page.tsx` — pagina "Accesso non riuscito, riprova" con i motivi in lista ammessa (`flow_state_already_used`, `otp_expired`, `flow_state_expired`, `bad_code_verifier`, `flow_state_not_found`, `access_denied`).

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — perimetro su `createUnit` e `updateUnitLabel`, più `createUnitErrorMessage`.
- `src/middleware.ts` — errori Supabase portati su `/auth/error` (`2e5f2af`); `?code=` fuori dalla callback portato alla callback (`199fe41`).
- `src/app/auth/callback/route.ts` — errore dello scambio registrato e mostrato tramite `authErrorRedirect`.
- `src/app/auth/login/LoginForm.tsx` — `prompt: 'select_account'` per Google; prop opzionale `activeSession` che sostituisce la card.
- `src/app/auth/login/page.tsx` — legge utente e profilo e, se c'è una sessione, passa `ActiveSessionPanel` con `returnTo` e `continueHref`.
- `src/app/(dashboard)/layout.tsx` — costruisce `DashboardAccount` (nome da `profiles`, email dall'utente di sessione) e lo passa alla navigazione.
- `src/components/AdminSidebar.tsx` — identità e logout in fondo a `NavContent`, quindi in sidebar e drawer.
- `src/app/(app)/profilo/actions.ts` — rimosso il vecchio `signOut`.
- `src/app/(app)/profilo/ProfiloClient.tsx` — usa il `signOut` condiviso, `roleLabel` e la nuova etichetta delle notifiche.
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — riga "Invita tutte" al posto del bottone in testata.
- `src/app/(dashboard)/admin/residences/[id]/units/RegistraConsegnaMultiplaModal.tsx:305` — il testo d'errore rimanda a «Invita tutte».
- `src/lib/bulkInviteMessage.ts` — commento allineato.
- `src/app/welcome/[token]/page.tsx:242` — testo della pagina d'invito admin.
- `src/lib/pdf/ReportDocument.tsx:463-465` — frase della conformità.

### Letti (solo quelli rilevanti per capire il contesto)
- `supabase/migrations/034_*.sql:194-203` — forma di riferimento del filtro `condition_key` usato alla creazione della residenza.
- `src/lib/auth.ts:23-28` — `getProfile` scarta `error` (in coda).
- `src/app/welcome/[token]/accept/page.tsx:22-23` — un invito non valido porta a `/` senza messaggio (in coda).
- `src/components/PriorityBadge.tsx:12-51` — mostra solo etichette italiane, nessuna sigla visibile.

## Decisioni chiave
- **047, limite accettato**: con `p_features='{}'` la funzione diverge dalla creazione della residenza. La residenza senza dotazioni dichiarate (`NOT EXISTS` su `residence_features`) riceve tutte le voci, come prima. Il limite è documentato in testata; il riallineamento non serve (Q1/Q2: 0 righe).
- **Errore di login su qualunque percorso**: la regola sta nel middleware e non solo nella callback, perché Supabase può consegnare l'errore sulla Site URL (`/`). Scartata l'alternativa di leggere l'errore solo in `/auth/callback`.
- **Sessione già attiva al login**: si mostra chi è connesso e si offrono Continua ed Esci. Scartati il logout automatico (perderebbe la sessione per un clic sbagliato) e l'ignorare la situazione (era il bug).
- **Mobile senza cerchietto con le iniziali**: l'identità sta solo nel drawer. Filippo ha scartato il cerchietto dopo averlo visto.
- **Chiavi notifiche invariate**: `push_n3_status` ed `email_n3_status` sono dati salvati; rinominarle vorrebbe dire migrare. È cambiato solo il testo visibile.
- **Codice fuori dalla callback, solo senza sessione**: con una sessione aperta `/?code=...` apre la home dell'account corrente e il codice viene ignorato. Confermato da Filippo: resta così.

## Stato attuale
### Funziona
- Verificati da Filippo in locale: accesso 1–5, scelta dell'account Google dopo il logout, login con sessione attiva (senza la prova con l'invito: un token fittizio ricade nel difetto in coda), identità e logout su desktop e drawer mobile, "Residente" in `/profilo`.
- Verificati da Filippo:
  - pagina Unità: teolo senza la riga, "TEST wizard b" con "4 unità consegnate da invitare · Invita tutte"; toast, poi la riga sparisce;
  - middleware: `localhost:3000/?code=prova` in incognito porta a `/auth/error?reason=pkce_code_verifier_not_found` con "Accesso non riuscito, riprova", non al login.
- `npm run verify` è passato prima di ogni commit (unico warning, preesistente: `src/app/api/reconcile-documents/route.ts:12` `req` inutilizzato).

### Non funziona / da verificare
- **`199fe41` non è pushato** (`main` avanti di 1 su `origin/main`).
- I testi di `c628500` non sono stati visti a schermo: `/profilo` → Notifiche, pagina d'invito admin, PDF del report.
- **Login partendo da un URL di deploy**: col wildcard dei deploy nelle Redirect URLs dovrebbe funzionare, perché il ritorno avviene sullo stesso dominio dove c'è il cookie del codice di verifica PKCE. Va provato in produzione. Se Supabase ripiega ancora sulla Site URL, `199fe41` porta il codice alla callback, ma lo scambio fallisce per l'assenza del cookie (`pkce_code_verifier_not_found`, visto in locale). L'errore è visibile, ma l'accesso non riesce.
- Prova d'accesso fuori perimetro su `createUnit` e `updateUnitLabel` non eseguita.
- Controlli di produzione dopo il deploy di `f07d14f..c628500` non ancora riportati da Filippo:
  - login con magic link e con Google (scelta dell'account);
  - link già usato che porta a `/auth/error`;
  - `/auth/login` con sessione aperta;
  - identità e logout nella dashboard;
  - riga "Invita tutte";
  - testi.

## Prossimi passi
1. **Push di `199fe41`** e prova in produzione, con login partendo sia da `casazero.vercel.app` sia da un URL di deploy.
2. **FASE 0 sulle etichette della PWA residente**: "Pulizia filtri climatizzatore" appare come "Obbligo di legge" in `/manutenzioni` e nella home, ma il catalogo (`docs/catalogo-manutenzioni-v2.md`) la dà come Modalità Promemoria / Tipo Consiglio. Va capito quale campo leggono le viste residente (probabilmente la colonna legacy `priority` o `obligation_type` dell'item) e confrontato coi dati della residenza. Read-only con STOP.
3. **Messaggi grezzi in `units/actions.ts`**: `createInvite`, `createBulkInvites`, `updateUnitLabel`, `revokeInvite`, `registerDelivery` (`delError.message`). Errore registrato lato server e messaggio di dominio, come per `createUnitErrorMessage`.
4. **`getProfile` che scarta `error`** (`src/lib/auth.ts:23-28`) e **invito non valido che porta a `/` senza messaggio** (`src/app/welcome/[token]/accept/page.tsx:22-23`).
5. **Motivo `pkce_code_verifier_not_found`**: non è nella lista ammessa di `src/app/auth/error/page.tsx`, quindi mostra solo il titolo generico. Valutare un messaggio dedicato, per esempio "Apri il link nello stesso browser da cui hai chiesto l'accesso", da usare anche per `bad_code_verifier`.
6. **Dominio vero**: quando ci sarà, va aggiunto alla Site URL e alle Redirect URLs di Supabase (`https://<dominio>/**` e `https://<dominio>/auth/callback**`). Insieme arriva l'SMTP personalizzato con Resend per la mail di accesso in italiano, che richiede il dominio verificato.
7. **`signOutForInvite`** sostituibile con `signOut(returnTo)`: un solo logout.
8. Ancora aperti dall'handoff `HANDOFF_chiusura_riallineamento_10_30_09_21.md`:
   - `new/actions.ts:14` (`profiles` senza `error`) e `:89` (messaggio grezzo della RPC);
   - inviti dopo il wizard con unità già consegnate (automatici o alla riga «Invita tutte»?);
   - archiviare "TEST wizard A/B";
   - `docs/scenari-date-consegna.md:377`;
   - promemoria `scaduta` da prima della 044;
   - indice unico sugli inviti attivi;
   - `units/page.tsx:37` e `(app)/page.tsx:56` senza `error`;
   - frase del registro per `data_consegna_modificata`;
   - `profiles(full_name)` inutile in `[id]/page.tsx`.
9. **Settimana 2**: più utenti per lo stesso costruttore (titolare, ufficio tecnico, segreteria), visibili e gestibili da Impostazioni.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# pubblicare 199fe41 (quando Filippo decide)
git push origin main

# prova della regola sul codice fuori callback (incognito, senza sessione)
# http://localhost:3000/?code=prova  ->  /auth/error con messaggio
```

## Domande aperte
- **Dove si usa l'app.** L'app si usa da `casazero.vercel.app`. Gli URL di deploy (`casazero-<hash>-filippos-projects.vercel.app`) sono protetti da Vercel, quindi lì gli errori CORS sul manifest sono attesi. In sessione Filippo ha detto prima che quegli URL non sono nelle Redirect URLs, poi che c'è il wildcard dei deploy: va scritto qui il valore esatto presente nel pannello.
- **Mail di accesso in inglese** ("Your sign-in link"). Per tradurla serve un SMTP personalizzato con Resend, che richiede il dominio verificato: arriva insieme al dominio vero (passo 6). Quando?
- **Perché `flow_state_already_used` è arrivato su `/`** con le Redirect URLs già corrette? L'ipotesi "URL non autorizzata, fallback alla Site URL" vale per i deploy, non per il dominio principale. Non è provato se Supabase mandi gli errori di verifica alla Site URL. L'app ora lo gestisce comunque.
- Inviti dopo il wizard con "Unità già consegnate": automatici o lasciati a «Invita tutte»?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: "**Parametri di Supabase Auth su qualunque percorso.** Supabase consegna `code`, `error` ed `error_code` sulla Site URL (`/`) quando l'URL di ritorno non è tra le Redirect URLs. Il middleware li intercetta su ogni percorso, prima della regola "pagina protetta → login": un errore va su `/auth/error`, un codice va su `/auth/callback`. Mai lasciarli cadere in un redirect al login, che li perde senza avviso."
- **Regole di codice ricorrenti**: "**Ruolo e identità visibili solo via helper.** Il nome del ruolo mostrato all'utente passa sempre da `roleLabel` (`src/lib/roleLabel.ts`), mai dal valore grezzo di `profiles.role`. Il "chi sono" passa da `AccountIdentity`, con l'email dall'utente di sessione e non da `profiles`."
- **Metodo di lavoro**: "**Richieste incollate già eseguite.** Se un messaggio chiede un commit o un'azione già fatti (testo incollato da un turno precedente), si controlla `git log` e si riporta l'hash esistente: mai ricommittare né rifare."
- **Nomenclatura ufficiale**: "Le chiavi dati che contengono la sigla abolita (`push_n3_status`, `email_n3_status` in `profiles.notification_prefs`) restano invariate finché non c'è una migrazione dati dedicata. La sigla sparisce solo dal testo visibile."

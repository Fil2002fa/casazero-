# Handoff — Sicurezza flusso invito residente · 14/09/2026 15:16

## Sommario
Sessione dedicata al blocco sicurezza del flusso invito residente: FASE 0 read-only su quattro problemi (vincolo email, bulk "Permessi insufficienti", cross-tenant, residuo dati di filippoloro02), pulizia dati eseguita a mano da Filippo, poi sette commit sequenziali ognuno con `npm run verify` verde e diff mostrato. La causa comune scoperta è `accept/page.tsx`, che cambiava il ruolo di chiunque accettasse un invito; il "Permessi insufficienti" del bulk resta invece aperto, ora con logging che ne mostrerà la causa reale.

## Lavoro completato
- [x] FASE 0 con prove riga per riga (subagent Explore + verifica diretta) su tutti e quattro i punti, più tre richieste aggiuntive di Filippo sul cambio di privilegi.
- [x] Pulizia DB del residuo (eseguita da Filippo nel SQL Editor): filippoloro02 tornato `role='admin'`, `builder_id` NULL, zero membership residue; le `admin_assignments` erano intatte.
- [x] `47054e6` — accept: un invito non cambia mai il ruolo di un account di gestione.
- [x] `3e28e05` — units: il gate di ruolo non scarta più gli errori (helper `requireCaller`).
- [x] `36eb7c3` — units: `handleRevokeInvite` legge `res.error`.
- [x] `5b26e00` — units: `revokeInvite` richiede super_admin e perimetro residenza (helper `requireResidenceAccess`).
- [x] `a9cce3e` — units: `createInvite`/`createBulkInvites` solo super_admin e solo unità della residenza (helper `requireUnitsInResidence`).
- [x] `31d551b` — accept: ogni lettura e scrittura legge il proprio errore, stop prima di `used_at`.
- [x] `a073af4` — accept: conferma esplicita dell'account, nessuna scrittura dalla GET.
- [ ] Commit 8 (vincolo `invites.email`) — **escluso per decisione**, rimandato al pilota reale.
- [ ] Causa reale del "Permessi insufficienti" nel bulk — non ancora identificata (vedi Stato attuale).
- [ ] Test manuale nel browser dei commit di questa sessione — non eseguito.

## File toccati
### Creati
- `src/app/welcome/[token]/InviteError.tsx` — pagina di errore invito condivisa tra landing e accept; prop opzionale `loginHref` per conservare il token nel link al login.
- `src/app/welcome/[token]/accept/accept-invite.ts` — unica fonte di verità del flusso accept: `checkInviteForUser` (validazione invito + guardia ruolo, sola lettura) e `activateInvite` (scritture su profiles, unit_members, admin_assignments, invites.used_at, ognuna con `error` letto); costanti dei messaggi.
- `src/app/welcome/[token]/accept/actions.ts` — server action `confirmInvite(token)` (ripete la validazione, poi scrive) e `signOutForInvite(token)` (logout che rimanda a `/auth/login?invite=<token>`).
- `src/app/welcome/[token]/accept/AcceptConfirm.tsx` — UI client di conferma: email dell'account in uso, residenza · unità, pulsante Conferma, form separato "Non sei tu? Esci".

### Modificati
- `src/app/welcome/[token]/accept/page.tsx` — da GET che scriveva durante il render a pagina di sola lettura: valida con `checkInviteForUser` e mostra `AcceptConfirm`, `InviteError` o redirect a `/` per token invalido.
- `src/app/welcome/[token]/page.tsx` — rimossa la copia locale di `InviteError`, ora importata.
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — tre helper locali (`requireCaller`, `requireResidenceAccess`, `requireUnitsInResidence`); `createInvite`/`createBulkInvites`/`revokeInvite` ristretti a super_admin con controllo di perimetro; `createUnit`/`updateUnitLabel` passano dallo stesso gate.
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — `handleRevokeInvite` azzera e imposta `localError` da `res.error`.
- `CLAUDE.md` — **modificato ma non da questa sessione** (+10 righe già presenti a inizio sessione, legge "Mai scartare error" promossa dal handoff precedente): non committato, non toccato.

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_invito_pwa_fix_09_14_14_12.md` — handoff precedente con i 5 rischi del flusso invito diagnosticati ma non corretti.
- `docs/handoffs/HANDOFF_bulk_invite_admin_fix_27_06_1530.md` — origine di `createBulkInvites`.
- `supabase/migrations/001_schema.sql` — DDL di `invites` (:247-259, colonna `email` mai usata), `profiles` (:58-67), `unit_members` (:74-82), `admin_assignments` (:90-96), `completions` (:158-162, nessuna FK verso unit_members/invites), trigger `handle_new_user` (:267-291, non imposta `role` né `builder_id`), `profiles_updated_at` (:304-306).
- `supabase/migrations/002_rls.sql` — `czero_can_access_residence` (:29-54), policy su residences/units/profiles.
- `supabase/migrations/018_profiles_column_grants.sql`, `031_grants_hardening.sql` — `authenticated` non può aggiornare `profiles.role`.
- `src/app/auth/callback/route.ts` (:37-39 redirect immediato per `/welcome/`), `src/app/auth/login/LoginForm.tsx` (:24), `src/app/auth/login/page.tsx`, `src/middleware.ts` (:40-43 `/welcome` pubblico) — percorso sessione esistente → accept.
- `src/lib/auth.ts` — `requireRole` gira solo al render della pagina.
- `src/app/(dashboard)/layout.tsx` — nessuna guardia di ruolo (:13 default `'admin'`).
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — guardia di pagina super_admin + select RLS sulla residenza.
- `src/app/(app)/profilo/actions.ts` — `createFamilyInvite` (:8-53, qualsiasi residente membro può creare inviti client) e `signOut` (:109-113).
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — invito admin (:65).
- `src/app/api/fascicolo-pdf/route.ts` (:47-61) — controllo perimetro duplicato a mano, esempio del pattern da non ricopiare.
- `src/lib/formatUnitLabel.ts` — helper etichetta unità, usato in `AcceptConfirm`.

## Decisioni chiave
- **Il cambio ruolo in accept è un cambio di privilegi, non un collegamento**: `profiles.role` ha un solo punto di scrittura applicativo (ora `accept-invite.ts`), alimentato da quattro sorgenti di inviti, tra cui `createFamilyInvite` usabile da qualunque residente. Regola: si scrive solo se il profilo è `client` o se il ruolo coincide già con quello dell'invito; client→admin via invito admin resta ammesso. Alternativa scartata: bloccare solo admin/super_admin su inviti `client` (lasciava super_admin→admin).
- **Ruolo ristretto a super_admin nelle action di units** (`createInvite`, `createBulkInvites`, `revokeInvite`), allineato alla pagina che è già solo super_admin. Alternativa scartata: ammettere admin con controllo `admin_assignments` — nessuna UI admin usa queste action.
- **Perimetro delegato alla RLS**: `requireResidenceAccess` fa una select con il client utente su `residences`, quindi la fonte di verità resta `czero_can_access_residence`. Alternativa scartata: confronto `builder_id` ricopiato in TypeScript come in `api/fascicolo-pdf` e `api/report`.
- **Helper di perimetro nato nel commit 4, non nel 3**: l'ordine di esecuzione deciso da Filippo (1, 2, 5, 4, 3, 7, 6) ha anticipato `revokeInvite`; il commit 3 riusa l'helper.
- **Vincolo email (commit 8) escluso**: obbligatorio è incompatibile col bulk (15 link senza email), opzionale non protegge. La protezione è commit 1 + commit 6. Rimandato al pilota reale con Furlan.
- **Pulizia con DELETE e non `ended_at`**: la membership di filippoloro02 era un artefatto di test, `ended_at` avrebbe lasciato nello storico dell'unità una proprietà mai esistita. Invito consumato non riaperto (link girato nei test).
- **Logout con token come action locale** (`signOutForInvite`): `signOut` di `(app)/profilo/actions.ts` rimanda a `/auth/login` perdendo il token; lo spostamento in modulo condiviso resta nel filone "logout dashboard".
- **`next build` non eseguito**: scrive `.next` e romperebbe il dev server eventualmente attivo; gate usato solo `npm run verify`.

## Stato attuale
### Funziona
- `npm run verify` verde (tsc + lint, unica warning pre-esistente `src/app/api/reconcile-documents/route.ts:12`) su tutti e 7 i commit, ognuno con diff isolato mostrato prima del commit.
- Dati: filippoloro02 `role='admin'`, `builder_id` NULL, zero `unit_members` (conferma di Filippo dopo le query A1 e pulizia B).
- Verificato con query A1 (Filippo): pippoloro02 è ancora `super_admin` con `builder_id` valorizzato; adminB/adminC `admin` con `builder_id` NULL.

### Non funziona / da verificare
- **Nessun test nel browser** per i commit di questa sessione. Critico il commit 6 (`a073af4`): il select di `checkInviteForUser` usa due embed verso `residences` (via `units` e direttamente via `invites.residence_id`) che tsc non può validare; va visto funzionare a runtime.
- **"Permessi insufficienti" nel bulk: causa ignota.** Il codice delle due action era identico fino all'insert; l'ipotesi "account degradato" è **caduta** (il bulk è stato lanciato da pippoloro02, ancora super_admin). Dopo `3e28e05` il log del server distingue `errore lettura sessione`, `errore lettura profilo`, `profilo non leggibile`, `ruolo non ammesso` (con `userId` e `role`). Da `a9cce3e` può comparire anche `residenza fuori perimetro` o `unità fuori residenza`.
- **Token non trimmato nel percorso accept**: `welcome/[token]/page.tsx:19` trimma solo per la propria query, ma il CTA (`:174`) passa `token` originale; `accept-invite.ts` confronta senza trim. Con whitespace in coda al link, la conferma finisce nel redirect muto a `/`. Il fix `4515dcb` è incompleto. Non corretto (scope creep segnalato).
- **Errori ancora scartati nel bulk**: in `createBulkInvites` le select di idempotenza su `invites` e `unit_members` scartano `error`; un fallimento fa saltare il filtro e può generare inviti doppi. Non corretto.
- **Rischi del flusso invito ancora aperti** dall'handoff precedente: `unit_members.ended_at` mai scritto (membri attivi illimitati per unità, `is_primary: true` sempre); `used_at` non atomico (due conferme concorrenti possono passare entrambe).
- **Invariati dal handoff precedente**: nessun logout in dashboard; onboarding primo avvio PWA non scritto; test PWA su dispositivo reale non eseguito.

## Prossimi passi
1. Filippo testa `a073af4` in dev: aprire `/welcome/<token>` di un invito residente nuovo con sessione già aperta → deve apparire la conferma con l'email corretta e residenza · unità; nessuna riga in `unit_members` finché non si preme Conferma; "Esci" deve portare a `/auth/login?invite=<token>`.
2. Filippo testa `47054e6`: stesso invito aperto con filippoloro02 → pagina "Questo account ha già un ruolo di gestione"; poi A1 deve mostrare `role='admin'` invariato.
3. Rilanciare "Genera inviti per tutte le unità" da pippoloro02 su Residenza Cavaccio con `npm run dev` in primo piano e leggere la riga di log `createBulkInvites: ...`: è l'unico modo per chiudere il punto 2.
4. Commit dedicato al trim del token: `token.trim()` una volta sola in `welcome/[token]/page.tsx` passato al CTA, e in `accept/page.tsx`/`actions.ts` prima di `checkInviteForUser`.
5. Commit dedicato: destrutturare `error` sulle due select di idempotenza di `createBulkInvites` (`units/actions.ts`, blocchi `existing` e `memberRows`), fermando il bulk con errore tecnico invece di proseguire senza filtro.
6. Poi i filoni in sospeso dall'handoff precedente: logout dashboard (spostare `signOut` in modulo condiviso), onboarding PWA, test PWA su dispositivo.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify
```

## Domande aperte
- Punto 2: quale riga di log compare al prossimo bulk fallito? Se è `ruolo non ammesso` con `role='super_admin'` il problema è altrove (sessione/cookie diversi tra le due chiamate); se è `errore lettura profilo` serve il codice PostgREST.
- `unit_members.ended_at` mai scritto: al collegamento di un nuovo proprietario, il membro precedente va chiuso automaticamente o serve un passaggio esplicito? (aperta dal handoff precedente, cambia il modello di passaggio di proprietà)
- `used_at` non atomico: rendere l'UPDATE condizionato (`is('used_at', null)` + controllo righe aggiornate) e spostarlo prima delle altre scritture, o accettare il rischio finché i link sono controllati?
- `InviteUsedBanner`/`inviteUsed` in `welcome/[token]/page.tsx` restano irraggiungibili (dead code segnalato nel handoff precedente): rimuovere in commit di pulizia?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: "Metodo di lavoro (non negoziabile)", in coda al punto 8**:

  ```
     Nel SQL Editor di Supabase un blocco BEGIN/COMMIT multi-statement NON
     garantisce una transazione unica tra esecuzioni successive (14/09: il
     DELETE è passato, l'UPDATE si è perso con la transazione chiusa
     dall'editor). Le anteprime SQL si scrivono come statement singoli
     idempotenti, ognuno seguito dalla sua query di verifica; le guardie
     ("STOP se esistono completions") come SELECT da eseguire prima, non come
     DO/RAISE dentro una transazione.
  ```

- **Sezione CLAUDE.md di destinazione: "Invarianti (mai violare)"**:

  ```
  - **Un invito non abbassa né sposta mai i privilegi di un account.**
    `profiles.role` ha un solo punto di scrittura applicativo
    (`welcome/[token]/accept/accept-invite.ts`): scrive solo se il profilo è
    `client` o ha già il ruolo dell'invito. Nessun altro codice scrive `role`;
    `authenticated` non ha UPDATE sulla colonna (018). Un secondo punto di
    scrittura del ruolo va trattato come modifica di sicurezza, non come feature.
  ```

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"**:

  ```
  - **La guardia di pagina non protegge le server action.** Una action è un
    endpoint POST richiamabile con argomenti arbitrari: `requireRole` nella
    page.tsx e la select RLS che dà 404 non valgono per lei. Ogni action che
    scrive con service role verifica da sé ruolo E perimetro (residenza del
    builder del chiamante, unità dentro quella residenza) prima di scrivere.
    Il perimetro si verifica con una select del client utente, così decide la
    RLS (`czero_can_access_residence`), mai con un confronto `builder_id`
    ricopiato in TypeScript. Trovata il 14/09 su `createInvite`,
    `createBulkInvites` e `revokeInvite` (quest'ultima senza alcun gate).
  ```

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"**:

  ```
  - **Mai scritture durante il render di una GET.** Un link aperto (anche con
    una sessione di un altro account, anche da un prefetch) non deve cambiare
    stato: la GET valida e mostra una conferma con l'identità in uso, le
    scritture partono solo da una server action che ripete la validazione.
    Trovata il 14/09 su `/welcome/[token]/accept`, che collegava in silenzio
    l'account loggato all'unità.
  ```

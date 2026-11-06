# Handoff — Account di Nicola, audit B23 e isolamento tra builder · 05/11/2026 15:17

Milestone attiva: M5. Branch `main`, allineato a `origin/main` (HEAD `6415ed0`), working tree pulito, CI verde sull'ultimo push (run `42041236573`, `verify`, 1m9s). Una migrazione applicata in questa sessione: `050_invites_rls_scoped.sql` (riga in `docs/migrations.log`). Piano di lavoro di questa sessione: `docs/handoffs/n1-account-nicola-piano.md` ("N1" è l'ID del task Nicola nel backlog di pianificazione, non la sigla abolita dei livelli di manutenzione).

## Sommario
La sessione è partita dalla FASE 0 sull'accesso di Nicola (Furlan Costruzioni) e ha scoperto che un super_admin può, con un id forgiato o digitato nell'URL, leggere o scrivere dati di un altro costruttore (B23). Audit completo in sola lettura di tutti gli usi del service client, poi quattro fix e una migrazione RLS, tutti provati con simulazioni RLS (`BEGIN; SET LOCAL ROLE authenticated; claims; ...; ROLLBACK`) e in produzione. È stato creato anche il builder di prova "TEST prova Nicola" con l'utente `casazero.prova@gmail.com` come super_admin. Il builder vero "Furlan Costruzioni" NON è ancora creato: aspetta l'email di Nicola.

## Lavoro completato
- [x] FASE 0 su N1 con 6 domande (creazione admin costruttore, più admin per builder, builder separato vs Furlan srl con conteggi, email al residente, posizione, registrazione autonoma). Decisione di Filippo: builder separato, nome "Furlan Costruzioni", nessun secondo account admin per ora.
- [x] Piano committato: `468aebc` (piano N1), `189d437` (aggiornamento con audit B23 e scritture sul DB).
- [x] Audit B23 completo (22 file con service client, lista completa, nessun altro usa la service key).
- [x] **A3** `3b7ae33` — `administrators/[id]/page.tsx`: perimetro con RLS di sessione prima del service client, `notFound()` fuori perimetro, `throw` su errore tecnico. Riprodotto in produzione prima del fix (email e 3 residenze di `filippoloro02` visibili da "TEST prova Nicola"), 404 dopo.
- [x] **A1** `00f7cca` — `getAdminEmail` verifica il perimetro. Nuovo helper `src/lib/admin-scope.ts` (`checkAdminInScope`), condiviso con la pagina di A3.
- [x] **A2** `58295c0` — `assignAdmin` valida `profileId` con lo stesso helper prima di qualsiasi scrittura o lettura del nome.
- [x] **A5 lato codice** `a161d4a` — `checkInviteForUser` rifiuta inviti `super_admin` e inviti con `unit_id` e `residence_id` incoerenti.
- [x] **A5 lato DB** `6415ed0` — migrazione 050.
- [x] Push unico `b95a7fb..6415ed0`, CI verde, prove di Filippo in produzione: 404 da `casazero.prova`, scheda visibile da `pippoloro02`.
- [ ] Builder "Furlan Costruzioni" e account di Nicola: SQL pronto nel piano, NON eseguito.
- [ ] Piano Step 4 incompleto: dopo il login di `casazero.prova` (V5 passata, `/admin` vuoto) non è stata provata la creazione di una residenza col wizard né le impostazioni (logo e colore).

## File toccati
### Creati
- `src/lib/admin-scope.ts` — `checkAdminInScope(supabase, profileId)`: lettura di `profiles` col client di sessione, ritorna `in_scope` / `out_of_scope` / `error`. Fonte unica del perimetro admin per il super_admin.
- `supabase/migrations/050_invites_rls_scoped.sql` — due policy nuove su `invites`, tre vecchie tolte.
- `docs/handoffs/n1-account-nicola-piano.md` — piano con step numerati, SQL, audit, scritture eseguite.
- `docs/handoffs/HANDOFF_b23_isolamento_builder_11_05_15_17.md` — questo file.

### Modificati
- `src/app/(dashboard)/admin/administrators/[id]/page.tsx` — A3, poi rifattorizzato sull'helper (commit A1).
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — A1 (`getAdminEmail`) e A2 (`assignAdmin`).
- `src/app/welcome/[token]/accept/accept-invite.ts` — A5 lato codice, +16 righe in `checkInviteForUser`.
- `docs/migrations.log` — riga della 050 (PASS).

### Letti (rilevanti per il contesto)
- `docs/handoffs/HANDOFF_blocco_fix_cron_11_05_12_05.md` — stato di partenza (B37, B39, B40).
- `src/app/(dashboard)/admin/administrators/page.tsx` — la lista è corretta (`loadAdmins(builderId)`, `:41-44,132`).
- `src/lib/document-access.ts:134-188` — `authorizeResidenceActor`, fail-closed.
- Policy RLS di `profiles`, `residences`, `admin_assignments`, `invites`, `completions`, `activity_events`, `builders` e `storage.objects` lette da `pg_policies`.

## Decisioni chiave
- **Builder separato per Nicola**, nome definitivo "Furlan Costruzioni"; "Furlan srl" resta la sandbox di Filippo. Scartato: dentro Furlan srl (Nicola avrebbe visto 8 residenze, 385 voci di manutenzione e 63 eventi di test e gli account di prova).
- **Nicola = `super_admin`**, nessun secondo account `admin`: un super_admin non può scrivere in `completions` (migrazione 020), quindi non completa manutenzioni. Per ora va bene.
- **Prima prova su un builder di prova** ("TEST prova Nicola", `c71e9e4e-b90e-479b-85d7-cb352b798b5e`), con l'utente `casazero.prova@gmail.com` (`3b68770c-6341-4543-99fc-42f6a4fc0939`) creato in anticipo da Filippo con Add user e Auto Confirm: il login Google si collega allo stesso utente (provato: V5 dà 1 utente con identità `{email,google}`). Scartato: `filippogiochi2002`, che era un residente con 4 `unit_members`.
- **Perimetro con la RLS di sessione, non con controlli ricopiati**: il service client si usa solo dopo una lettura di sessione che prova l'appartenenza (pattern già in `createAdminInvite`). Scartato: confronto manuale di `builder_id` nel codice.
- **Helper condiviso `checkAdminInScope`** invece di tre blocchi inline. Il refactor della pagina di A3 è entrato nel commit A1 (dichiarato come scope creep voluto).
- **Migrazione 050: prima si creano le policy nuove, poi si tolgono le vecchie**, per non avere finestre senza accesso. Approvata da Filippo (DROP di policy).
- **Fuori dal blocco, in backlog P1:** A6 (completions) con B17, storage `builder-logos` e `residence-photos`, A4, B1-B3, B5, B6.
- **Simulazione RLS ammessa da Filippo** per le prove (transazione con `SET LOCAL ROLE`, rollback nella stessa chiamata e SELECT che mostra che nulla è cambiato), in deroga a "solo SELECT" e a "niente transazioni".

## Stato attuale
### Funziona
- Produzione al commit `6415ed0` (CI verde); `casazero.prova` riceve 404 sull'URL di `filippoloro02`, `pippoloro02` vede la scheda (prove di Filippo).
- Simulazioni RLS (rollback, DB invariato dopo ciascuna: 97 inviti, 0 `super_admin`, 3 builder, 10 profili, 24 residenze, 3 assegnazioni, 70 eventi):
  - come `casazero.prova`: Portello, residenze, `filippoloro02` come admin, assegnazioni e registro = 0;
  - come `pippoloro02`: `filippoloro02` in perimetro (1), admin dell'Archivio 0;
  - dopo la 050: INSERT forgiato `super_admin` con unità di un altro builder respinto (42501), prima accettato; INSERT `client` incoerente respinto; `super_admin` su sola residenza respinto; `client` con unità propria e `admin` con sola residenza accettati; `pippoloro02` vede ancora 34 inviti (27 attivi); policy su `invites` da 5 a 4.
- Inviti esistenti non toccati dal nuovo controllo: su 97, 0 con ruolo `super_admin`, 0 incoerenti, 0 attivi che verrebbero rifiutati.

### Non funziona / da verificare
- **Le server action A1 e A2 e la route di accettazione non sono state chiamate end-to-end**: provata la query dell'helper con le RLS reali, non le action. A5 lato codice è verificato solo con `tsc`, lint e i dati reali.
- **`accept-invite.ts:125`**: `upsert(..., { onConflict: 'profile_id,residence_id' })`, ma sul DB `admin_assignments` ha solo `UNIQUE(residence_id)` e nessun indice su `(profile_id, residence_id)`: probabile errore 42P10, con profilo già promosso ad admin (scrittura parziale). L'unico invito admin accettato è del 27/06, prima della riscrittura di settembre. Non provato dal vivo. Backlog P1.
- Un admin nato da invito ha `builder_id` NULL (`accept-invite.ts:70`) ed è invisibile al selettore del super_admin e al tema del costruttore. Backlog P1.
- **Aperti dall'audit (backlog P1):** A6 (`completions` senza controllo su `item_id` e `czero_recalc_due` SECURITY DEFINER; da fare con B17 in una FASE 0 a sé, perché tocca la policy INSERT del fascicolo); A4 `updateResidencePhoto` e policy storage `builder-logos` / `residence-photos` (upload e UPDATE a qualunque super_admin); B1 `storage_path` fidato dalla riga `documents` in `classify-document` e `extract-document`; B2 mass-assignment in `updateMaintenanceItemConfig` (`fornitori/actions.ts:155`); B3 `documents.unit_id` non validato; B5 filename non sanificato (`fascicolo-pdf/route.ts:91`); B6 segreto del cron confrontato con `!==` (`cron/daily/route.ts:50`).
- **Resend:** Filippo controlla se le email del 5/11 a `lorofilippo2002` sono state consegnate o rifiutate (403) e il valore di `RESEND_FROM` su Vercel. Con mittente sandbox i residenti veri non ricevono email del cron o N3 e il cron le conta come inviate; tutte le notifiche del cron sono `pending`.
- **B15** (fallback `localhost:3000` in 7 occorrenze) e `NEXT_PUBLIC_APP_URL` su Vercel non verificabili da qui.
- Disallineamento repo/DB: `UNIQUE(residence_id)` su `admin_assignments` esiste solo sul DB, non nelle migrazioni; il commento in `notification-recipients.ts:127-130` dice il contrario.
- Ereditati dall'handoff precedente: B40 (esecuzione doppia del cron, causa confermata: Filippo ha premuto Run due volte, ma manca ancora l'idempotenza), B41, B42, B46, B44, B5, R10d.

## Scritture eseguite sul DB (05/11, registro per questo handoff; dati, non in `docs/migrations.log` salvo la 050)
1. V0 su `casazero.prova@gmail.com`: confermata, `client`, `builder_id` NULL, 0 unità/assegnazioni/inviti/completamenti/eventi/notifiche; builder "TEST prova Nicola" inesistente.
2. `INSERT INTO builders (name, contact_email)` → `c71e9e4e-b90e-479b-85d7-cb352b798b5e`, "TEST prova Nicola", `casazero.prova@gmail.com`, `primary_color` `#04342C` (default).
3. `UPDATE profiles SET role='super_admin', builder_id='c71e9e4e-…'` su `3b68770c-…` (1 riga).
4. V1-V4: 1 builder; `casazero.prova` super_admin di "TEST prova Nicola"; 0 residenze e 1 profilo; conteggi per builder e ruolo invariati per gli altri (Archivio pre-demo admin 2; Furlan srl admin 1, client 5, super_admin 1; TEST prova Nicola super_admin 1).
5. V5 dopo il login Google: 1 utente, identità `{email,google}`.
6. Migrazione 050 (3 DROP e 2 CREATE di policy su `invites`), verifiche PASS, riga in `docs/migrations.log`.
7. Prove di RLS con transazioni rollback: nessuna riga residua.

## Prossimi passi
1. **Domani 6/11 dopo le 07:00 UTC, B39v:** nell'email del cron a `filippoloro02`, passa il mouse su "Vai alle manutenzioni" senza cliccare; atteso `.../admin/manutenzioni/<id>`. Controllare che la run di Vercel sia unica e che `notifications` non abbia duplicati. Il nuovo builder "TEST prova Nicola" non ha residenze, quindi il cron non lo tocca.
2. **Resend (Filippo):** controllo delle email del 5/11 e di `RESEND_FROM`; poi decidere se Nicola può invitare residenti veri. Se la sandbox resta: la guida di N3 deve dirgli di non invitare residenti veri. Se il dominio viene verificato: B40 e B46 diventano obbligatori prima dell'invito.
3. **Chiudere Step 4 del piano** con `casazero.prova` in incognito: creare una residenza di prova col wizard (deve nascere con `builder_id` = `c71e9e4e-…`, verificabile con una SELECT) e impostare nome, logo e colore in `/admin/settings`.
4. **Consegna a Nicola entro sabato 8/11:** quando arriva la sua email, Filippo crea l'utente con Add user + Auto Confirm, poi si lanciano V0, l'INSERT di "Furlan Costruzioni" e l'UPDATE del profilo (SQL nel piano, Step 5), poi V1-V4 e V5 al primo login Google. Sono scritture sul DB: mostrare l'SQL e aspettare l'ok. Poi i task Nicola N2 (prova completa con S1-S3 e sollecito manuale di B39), N3 (guida) e N4 (messaggio).
5. **Decidere cosa fare del builder di prova** "TEST prova Nicola" e dell'utente `casazero.prova` dopo la consegna (tenerli per le prove o toglierli).
6. **FASE 0 su A6 + B17** (policy INSERT di `completions` e trigger `czero_recalc_due`): richiede una decisione sull'invariante "il fascicolo è off-limits per migrazioni", se un cambio che *restringe* l'accesso è consentito.
7. **Backlog P1 in ordine di rischio:** fix di `accept-invite.ts:125` e `builder_id` dell'invito admin; policy storage `builder-logos`/`residence-photos` con A4; B1-B3, B5, B6; blocco "cron robusto" (B40, B41, B42, B46, B44, B5, B15).
8. Le 3 conferme su E1: Filippo ha confermato i 4 fogli; le altre due le chiude in pianificazione. T11 e la riduzione delle leggi candidate, quando c'è spazio.

## Comandi da rilanciare
```bash
# Gate pre-commit
npm run verify

# Server di sviluppo (il cron NON gira in locale)
npm run dev

# CI dell'ultimo push
gh run list --limit 3

# Controllo del cron in produzione: atteso 401
curl -i https://casazero.vercel.app/api/cron/daily
```
Verifica del perimetro da SQL: usare la simulazione RLS in una sola chiamata, con UUID letterali (le sottoquery sono filtrate dalla RLS e tornano NULL), e una SELECT dopo il rollback che mostra che nulla è cambiato. Id utili: `pippoloro02` `99b90ec5-6a80-4ec3-8884-377163c5510b`, `filippoloro02` `7a210c85-7816-4d5f-b802-176505947469`, `casazero.prova` `3b68770c-6341-4543-99fc-42f6a4fc0939`, Furlan srl `9923adbe-cfb4-47d3-b939-747bb30bcfe2`, Archivio pre-demo `34915db6-6881-4a41-91f5-3a0e148f19cb`.

## Domande aperte
- Le email del 5/11 a `lorofilippo2002` sono state consegnate o rifiutate? Valore di `RESEND_FROM` su Vercel?
- La chiusura di A6 può cambiare la policy INSERT di `completions` (restringendo l'accesso) senza violare l'invariante del fascicolo, o va fatta a livello di applicazione/trigger?
- Il builder di prova e l'account `casazero.prova` restano dopo la consegna?
- Il disallineamento repo/DB su `UNIQUE(residence_id)` va registrato come migrazione "no-op" nel repo (con `IF NOT EXISTS`)?

## Leggi emerse (candidate per CLAUDE.md)

- **Regole di codice**: "**Service client dopo il perimetro di sessione.** `requireRole` e `assertSuperAdmin` controllano solo il RUOLO, mai il builder. Ogni pagina o server action che riceve un id dal client (URL, form, argomento) e poi legge o scrive con il service client deve prima provare l'appartenenza con una lettura del client di SESSIONE (la RLS decide il perimetro), come `checkAdminInScope` in `src/lib/admin-scope.ts` o `requireResidenceAccess` in `units/actions.ts`. Il service client ignora le policy: senza quella lettura qualunque super_admin di un builder legge o scrive dati di un altro conoscendo un UUID. La lettura distingue 'fuori perimetro' (notFound o 'non trovato') da guasto tecnico ('riprova')."
- **Regole di codice**: "**Policy RLS con più colonne di appartenenza.** Una policy che lega una riga a un builder tramite più colonne alternative (es. `residence_id` OR `unit_id`) deve vincolare anche la coerenza fra le colonne (l'unità sta nella residenza indicata) e, in WITH CHECK, i valori ammessi del ruolo. Con un OR basta che una colonna sia del proprio builder perché l'altra possa puntare a un altro builder. Classe di bug trovata su `invites`: un super_admin poteva forgiare un invito `super_admin` con un'unità di un altro builder e diventarne staff accettandolo."
- **Invarianti**: "**Un super_admin nasce solo a mano (SQL), mai da un invito.** Nessuna UI crea inviti `super_admin` e `checkInviteForUser` li rifiuta sempre. Il ruolo `admin` è l'amministratore di condominio, legato alle residenze da `admin_assignments`, non staff del costruttore. Lo staff del costruttore è `super_admin` con `profiles.builder_id`."
- **Metodo di lavoro**: "**Prove di RLS con simulazione e UUID letterali.** La prova di una policy si fa in una sola chiamata: `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"<uuid>\",\"role\":\"authenticated\"}', true); <prova>; ROLLBACK;`, seguita subito da una SELECT che mostra che nulla è cambiato. Per un tentativo di attacco usare UUID letterali: una sottoquery per ricavare l'id di una riga di un altro builder viene filtrata dalla RLS e restituisce NULL, quindi la prova sembra passare senza provare niente."
- **Metodo di lavoro**: "**Un audit di sicurezza classifica ogni punto in 'visibile dalla UI' o 'solo con richiesta forgiata' e verifica sul DB live le conclusioni sulle RLS.** Le migrazioni nel repo possono non coincidere col DB: i vincoli di unicità esistono solo dove sono stati creati a mano (es. `UNIQUE(residence_id)` su `admin_assignments`). Un `upsert` con `onConflict` deve corrispondere a un indice unico che esiste davvero sul DB live, da verificare con `pg_indexes`."

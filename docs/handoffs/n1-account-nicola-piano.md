# Piano N1 — Accesso di Nicola (Furlan Costruzioni) in produzione · 05/11/2026

Stato: piano di lavoro dopo la FASE 0 di N1 e la verifica B23. Scadenza di consegna a Nicola: sabato 8/11.
Scritture eseguite sul DB finora: **zero** (solo SELECT). Le scritture future vanno nell'handoff di fine giornata (SQL e risultati), non in `docs/migrations.log`, perché sono dati e non schema.

Legenda: **[APPROVATO]** deciso da Filippo · **[DA DECIDERE]** serve la sua risposta · **[CONSEGNA]** pronto ma non da eseguire ora.

## Decisioni già prese

- Builder separato dal builder di test "Furlan srl". Nome definitivo: "Furlan Costruzioni". [APPROVATO]
- Nicola come `super_admin` del builder nuovo. Nessun secondo account `admin` per ora. [APPROVATO]
- La prova si fa prima su un builder di PROVA, "TEST prova Nicola", con un account di Filippo. L'email vera di Nicola arriva alla consegna. [APPROVATO]
- Fix dell'upsert di `accept-invite.ts:125`, `builder_id` dell'invito admin e docs collegati: backlog P1, non in questa sessione. [APPROVATO]
- Resend (dominio verificato, `RESEND_FROM`, consegna a `lorofilippo2002`): lo controlla Filippo e riferisce. [APPROVATO]

## Riscontri della FASE 0 su cui poggia il piano

- Il "admin costruttore" è un `super_admin` con `profiles.builder_id`; il ruolo `admin` è l'amministratore di condominio, legato alle residenze da `admin_assignments`. Nessuna UI crea un builder o un super_admin (solo SQL).
- Solo il ruolo `admin` può inserire in `completions` (migrazione 020): un super_admin non completa manutenzioni.
- Sul DB `admin_assignments` ha solo `UNIQUE(residence_id)`, senza `UNIQUE(profile_id, residence_id)`, quindi l'upsert di `accept-invite.ts:125` probabilmente fallisce. L'unico invito admin accettato è del 27/06, prima della riscrittura di settembre.
- Un utente nuovo crea comunque `auth.users` e un profilo `client` senza builder; l'accesso è negato dal callback. Il linking Google per email verificata è attivo (3 utenti del progetto hanno identità email e Google sullo stesso utente).
- Email: con mittente sandbox le email del cron e N3 a indirizzi diversi da quello dell'account Resend falliscono in silenzio. Tutte le notifiche del cron e N3 sono `pending`.
- `filippogiochi2002@gmail.com` NON è libero: client di Furlan srl, 4 `unit_members` (1 attivo), 1 evento, 3 notifiche. Nessun account esistente ha `builder_id` NULL (9 utenti, 9 profili).

## Step

### Step 1 — Decidere B23 [DA DECIDERE]
Problema: `src/app/(dashboard)/admin/administrators/[id]/page.tsx` verifica solo il ruolo (`:39`) e legge con service role profilo (`:45-50`), email (`:55`), assegnazioni (`:59-62`), residenze (`:81-84`), voci in ritardo (`:93-100`). Un super_admin di un builder con l'UUID di un admin di un altro builder vede nome, email, telefono, residenze e titoli delle voci in ritardo. La lista `/admin/administrators` è corretta (`loadAdmins(builderId)`, `:41-44,132`).
Opzioni: (a) fix piccolo in un commit a sé (controllo che le residenze assegnate siano del builder del chiamante, altrimenti `notFound()`); (b) backlog P1.
File coinvolti se (a): `src/app/(dashboard)/admin/administrators/[id]/page.tsx`.
Verifiche: `npm run verify` con output completo; prova con un super_admin di un builder e l'UUID di un admin di un altro builder, atteso 404; prova con un admin del proprio builder, atteso invariato.
Collegati, non in questo step: `assignAdmin` non valida `profileId` (`admin-actions.ts:57`); policy storage `builder-logos` e `residence-photos` senza scoping di builder in upload e UPDATE; da verificare `authorizeResidenceActor` usata da `fascicolo-pdf` e `documenti-xlsx`, e le route `report`, `classify-document`, `extract-document`, `reconcile-documents`.

### Step 2 — Account di prova [DA DECIDERE, serve l'email]
Filippo crea in Supabase → Authentication → Add user un utente nuovo con una email che controlla. Password casuale (il codice non ha login con password), casella **Auto Confirm User** spuntata. Per il login con Google serve un account Google reale (un alias `+` di Gmail funziona solo col magic link).
Verifica V0 (SELECT): l'utente esiste, `email_confirmed_at` valorizzato, profilo `client`, `builder_id` NULL, nessuna unità, invito, assegnazione, completamento, evento, notifica.

### Step 3 — Builder di prova "TEST prova Nicola" [DA ESEGUIRE SOLO DOPO OK ESPLICITO]
Scritture, istruzioni singole e idempotenti (niente `BEGIN`/`COMMIT`), da mostrare per intero a Filippo prima di eseguirle. Sostituire `<EMAIL_PROVA>`.

```sql
insert into public.builders (name, contact_email)
select 'TEST prova Nicola', '<EMAIL_PROVA>'
where not exists (select 1 from public.builders where name = 'TEST prova Nicola');

update public.profiles
set role = 'super_admin',
    builder_id = (select id from public.builders where name = 'TEST prova Nicola')
where id = (select id from auth.users where lower(email) = lower('<EMAIL_PROVA>'))
  and role = 'client'
  and builder_id is null;
```

Verifiche (SELECT):
- V1: `select id, name, contact_email from public.builders where name = 'TEST prova Nicola'` → 1 riga.
- V2: profilo con `role = super_admin` e builder "TEST prova Nicola".
- V3: residenze del builder = 0, profili del builder = 1.
- V4: conteggi per builder e ruolo invariati per gli altri (prima: Furlan srl 1 super_admin + 1 admin + 5 client; Archivio pre-demo 2 admin).
File coinvolti: nessuno (solo DB). Registrare SQL e risultati nell'handoff.

### Step 4 — Prova di accesso e isolamento
Con l'account di prova: primo accesso con Google, poi V5 (un solo utente con identità `{email,google}`). Entrare in `/admin`: elenco residenze vuoto, registro vuoto, nessun dato di Furlan srl né dell'Archivio. Creare una residenza di prova con il wizard (`new/actions.ts`) e verificare che nasca con il `builder_id` del builder di prova. Impostare nome, logo e colore in `/admin/settings`.
Verifica: nessuna riga di altri builder nelle pagine; la residenza creata è visibile solo al builder di prova (SELECT sul `builder_id`).

### Step 5 — Consegna a Nicola, entro sabato 8/11 [CONSEGNA, non eseguire ora]
Stessa procedura sul builder definitivo con l'email vera di Nicola, `<EMAIL_NICOLA>`:

```sql
insert into public.builders (name, contact_email)
select 'Furlan Costruzioni', '<EMAIL_NICOLA>'
where not exists (select 1 from public.builders where name = 'Furlan Costruzioni');

update public.profiles
set role = 'super_admin',
    builder_id = (select id from public.builders where name = 'Furlan Costruzioni')
where id = (select id from auth.users where lower(email) = lower('<EMAIL_NICOLA>'))
  and role = 'client'
  and builder_id is null;
```

Prima: utente creato con Add user e Auto Confirm, V0. Dopo: V1–V4 e V5 al primo login. Se Nicola usa un account Google con un'altra email nasce un secondo utente: V5 lo rileva (due righe).
Collegati: N2 (prova completa con S1–S3 e sollecito manuale di B39), N3 (guida), N4 (messaggio).

### Step 6 — Email e residenti veri [DA DECIDERE dopo il controllo di Resend]
Filippo controlla nella dashboard Resend se le email del 5/11 a `lorofilippo2002` sono state consegnate o rifiutate con 403, e quale è il valore di `RESEND_FROM` su Vercel.
- Se resta la sandbox: i residenti veri non ricevono email del cron o di N3 (silenzio); la guida N3 deve dire a Nicola di non invitare residenti veri, e il magic link Supabase (SMTP di default, in inglese) ha limiti non verificati.
- Se il dominio è verificato: B40 (esecuzione doppia) e B46 (preferenze di notifica ignorate) diventano obbligatori prima dell'invito di residenti veri.

### Step 7 — Handoff di fine giornata
Includere: scritture eseguite (SQL e risultati, non in `docs/migrations.log`), esito di Step 1–6, decisioni prese, backlog P1 qui sotto. Generato con `/handoff`. Non modificare CLAUDE.md: le leggi nuove vanno nella sezione "Leggi emerse".

## Aggiornamento 05/11 — audit B23 completo e decisioni

Audit in sola lettura di tutti gli usi del service client (22 file, lista completa). Verificati direttamente da Claude sul codice o sul DB live: A1, A3, A5, A6. Il resto è dal report del subagent (codice e migrazioni 001-049 nel repo, non il DB live).

| # | Dove | Filtra builder | Gravità | Raggiungibile da |
|---|---|---|---|---|
| A3 | `administrators/[id]/page.tsx:39-106` | NO | alta | URL con l'UUID di un admin |
| A1 | `admin-actions.ts:221-231` `getAdminEmail` | NO | alta | richiesta forgiata |
| A2 | `admin-actions.ts:32-95` `assignAdmin` (`profileId` non validato) | PARZIALE | media | richiesta forgiata |
| A5 | RLS `invites` (`super_admin full` e `gestisce`) + `accept-invite.ts:55,70-71,82-85` | NO | alta | richiesta forgiata (un super_admin può diventare super_admin di un altro builder) |
| A6 | `completions` INSERT senza controllo su `item_id` + `czero_recalc_due` | NO | media | richiesta forgiata |
| A4 | `updateResidencePhoto` (`residences/[id]/actions.ts:36-41`) e storage `residence-photos` | NO | media | richiesta forgiata |

Corretti (con la riga che lo prova): `authorizeResidenceActor` (`document-access.ts:170`), `fascicolo-pdf`, `documenti-xlsx`, `report`, `classify-document`, `extract-document`, `reconcile-documents`, `sollecitaItem` (`:110`), azioni di `units`, `createResidence`, `createAdminInvite`, `removeAdminAssignment`, `(app)/fascicolo`, `(app)/profilo`, lista `/admin/administrators`.

### Blocco fix B23 (un commit per problema, stop prima di ogni commit per l'ok di Filippo, `npm run verify` e diff prima di ognuno)

Pattern comune: il perimetro lo decide la RLS con una lettura di sessione (`createClient()`) PRIMA del service client, come in `createAdminInvite` (`admin-actions.ts:171-184`). Un super_admin vede un admin solo se ha il suo `builder_id` o è assegnato a una sua residenza.

| Commit | Problema | File | Prova |
|---|---|---|---|
| docs | questo aggiornamento | `docs/handoffs/n1-account-nicola-piano.md` | `npm run verify` |
| 1 | A3 | `administrators/[id]/page.tsx`: lettura profilo con sessione, senza riga `notFound()` | con `casazero.prova` (super_admin del builder di prova) aprire `/admin/administrators/7a210c85-7816-4d5f-b802-176505947469` prima e dopo il fix; poi un admin del proprio builder deve aprirsi ancora |
| 2 | A1 | `admin-actions.ts` `getAdminEmail` | simulazione RLS (sotto) e `npm run verify` |
| 3 | A2 | `admin-actions.ts` `assignAdmin`: `profileId` deve essere `role='admin'` visibile via RLS | simulazione RLS e `npm run verify` |
| 4 | A5 lato codice | `accept-invite.ts` `checkInviteForUser`: invito `super_admin` mai accettabile; se `unit_id` e `residence_id` sono entrambi presenti devono coincidere | `npm run verify` |
| migrazione 050 | A5 lato DB | policy `invites`: vincolo su `role` (solo `client` e `admin`) e coerenza unità/residenza nel proprio builder | SQL intero mostrato a Filippo PRIMA di applicarla (DROP e CREATE di policy: conferma esplicita); poi probe con simulazione RLS e riga in `docs/migrations.log` |

Simulazione RLS (approvata da Filippo): `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', ...); SELECT ...; ROLLBACK;` tutto nella stessa chiamata, e subito dopo una SELECT che mostra che nulla è cambiato.

Commit 4 e migrazione 050: entrambi PRIMA della consegna a Nicola.

### Scritture eseguite sul DB (05/11, per l'handoff di fine giornata, non in `docs/migrations.log`)

1. V0 su `casazero.prova@gmail.com` (id `3b68770c-6341-4543-99fc-42f6a4fc0939`): confermata, `client`, `builder_id` NULL, 0 unità, 0 assegnazioni, 0 inviti, 0 completamenti, 0 eventi, 0 notifiche; nessun builder "TEST prova Nicola" esistente.
2. `INSERT INTO builders` → `c71e9e4e-b90e-479b-85d7-cb352b798b5e`, "TEST prova Nicola", contact_email `casazero.prova@gmail.com`, `primary_color` default `#04342C`.
3. `UPDATE profiles SET role='super_admin', builder_id=<c71e9e4e...>` su `3b68770c...` (1 riga).
4. V1: 1 builder. V2: `casazero.prova@gmail.com` super_admin di "TEST prova Nicola". V3: 0 residenze, 1 profilo. V4: Archivio pre-demo admin 2; Furlan srl admin 1, client 5, super_admin 1; TEST prova Nicola super_admin 1.
5. V5 (identità Google collegata) e prova di A3 prima del fix: da fare.

### Nuovi in backlog P1 (fuori da questo blocco)

- A6, insieme a B17 (WITH CHECK su `completions`): FASE 0 a sé, perché tocca la policy INSERT del fascicolo.
- Storage `builder-logos` e `residence-photos`, A4 (`updateResidencePhoto`).
- B1 `storage_path` fidato dalla riga `documents` e scaricato col service client in `classify-document` e `extract-document`; B2 mass-assignment in `updateMaintenanceItemConfig` (`fornitori/actions.ts:155`); B3 `documents.unit_id` non validato; B5 filename non sanificato in `fascicolo-pdf/route.ts:91`; B6 confronto del segreto del cron non a tempo costante (`cron/daily/route.ts:50`).

## Backlog P1 (non in questa sessione)

- `accept-invite.ts:125`: `onConflict` non corrisponde a nessun indice unico sul DB (probabile errore 42P10, con profilo già promosso).
- Invito admin: scrivere `builder_id` dalla residenza (`accept-invite.ts:32,70`); oggi l'admin nato da invito ha `builder_id` NULL ed è invisibile al selettore del super_admin.
- Docs: commento errato in `notification-recipients.ts:127-130` sull'unicità; registrare nel repo l'`UNIQUE(residence_id)` che esiste solo sul DB.
- B23 se rimandato, più `assignAdmin` (`profileId` non validato) e policy storage `builder-logos` e `residence-photos`.
- Blocco "cron robusto": B40, B41, B42, B46, B44; B5 (esclusione dell'Archivio dal cron); B15 (fallback `localhost:3000` in 7 occorrenze).
- Vincolo `invites.email`: rimandato fino al pilota reale (vedi memoria di progetto).
- Registrazione autonoma e invito `super_admin` da UI: non per sabato (stima FASE 0: 1 migrazione e 5–8 file, con controlli anti-abuso).

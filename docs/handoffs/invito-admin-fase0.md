# FASE 0 — accettazione invito admin fallisce (6/11) — sola lettura

Nessuna modifica a codice, DB o RLS. Query solo SELECT; i log sono quelli di
Postgres letti via MCP (`query_logs`). Il blocco "Log del dev server" della richiesta
era rimasto col segnaposto `[INCOLLA QUI LE RIGHE DI POWERSHELL]`: non l'ho avuto.
La causa sotto non dipende da quel log, perché la stessa riga d'errore è nei log di
Postgres (punto 1).

## Causa in una riga

L'accettazione fa `upsert(..., { onConflict: 'profile_id,residence_id' })` su
`admin_assignments`, ma sul DB esiste solo `UNIQUE(residence_id)`. Postgres rifiuta
l'istruzione (42P10) prima di scrivere, per qualunque account e qualunque invito
admin. Non è un problema di RLS, di token o dei due account.

## 1. Quale action, quale scrittura

- "Conferma" → `confirmInvite` (`src/app/welcome/[token]/accept/actions.ts:13`) →
  `checkInviteForUser` (`accept-invite.ts:27`, passa) → `activateInvite`
  (`accept-invite.ts:95`).
- Il messaggio "Errore temporaneo durante l'attivazione…" è `ACTIVATION_ERROR`
  (`accept-invite.ts:6`), restituito da cinque punti diversi (righe 105, 119, 132,
  145, 156). Quello che scatta è la riga **145**, scrittura dell'assegnazione:

  ```
  accept-invite.ts:138  await admin.from('admin_assignments').upsert({
  accept-invite.ts:141  }, { onConflict: 'profile_id,residence_id', ignoreDuplicates: true })
  ```

- Errore Postgres, dai log del progetto (`postgres_logs`, filtro `ON CONFLICT`):
  `there is no unique or exclusion constraint matching the ON CONFLICT specification`
  a **09:55:21, 09:55:37 e 09:57:09 UTC** del 6/11. Il 09:57 coincide con l'ultimo
  accesso di `pippoloro02+admin` (09:57:06). Le altre due righe sono i tentativi con
  `filippoloro02` (ultimo accesso 09:54:45) e un secondo tentativo. Il 42P10 è un
  errore di pianificazione: Postgres lo emette senza eseguire la scrittura.
- Perché il DB non ha il vincolo: `pg_constraint` e `pg_indexes` su
  `admin_assignments` mostrano solo `admin_assignments_pkey (id)` e
  `admin_assignments_residence_id_key UNIQUE (residence_id)`, più due indici non unici.
  `001_schema.sql:95` prevede `UNIQUE (profile_id, residence_id)`, ma sul DB live non
  c'è: lo `UNIQUE(residence_id)` è stato creato a mano e nessuna migrazione del repo
  lo registra (`grep` su `supabase/`: nessun riscontro). `assignAdmin`
  (`admin-actions.ts:65`) usa infatti `onConflict: 'residence_id'` ed è corretto.
- Il problema era già noto: `docs/handoffs/HANDOFF_b23_isolamento_builder_11_05_15_17.md:61`
  lo descrive come "probabile 42P10, non provato dal vivo, backlog P1". Ora è provato.

## 2. Stato del DB (SELECT)

Invito (`invites.id = 347d5e21-583d-4683-b491-70aaf4633e2e`):
`role = admin`, `unit_id` null, `residence_id` = Residenza Prova
(`cb14e7c1-bf83-45af-bed2-89f117c16e41`, builder di prova), creato 09:54:00,
scade 06/12, **`used_at` null, non scaduto**. Ogni scrittura fallita si ferma prima
di `used_at` (`accept-invite.ts:94`), quindi **si può riprovare con lo stesso link**
dopo il fix.

| Account | Stato dopo i tentativi |
|---|---|
| `pippoloro02+admin` (`adca9258-e162-4e74-b462-ab9e804a90e3`) | **A metà.** `role = admin` e `builder_id = null`; nessuna riga in `admin_assignments`; nessun `unit_members`. Il profilo è stato promosso (`accept-invite.ts:98`) prima dell'assegnazione che è fallita. |
| `filippoloro02` (`7a210c85-…`) | **Intatto.** Era già admin del builder Furlan (`9923adbe-…`); l'update di profilo non ha cambiato nulla, le sue 3 assegnazioni (Portello, Santa Giustina, Bassanello) sono invariate, nessuna riga su Residenza Prova. |

- `admin_assignments` per Residenza Prova: **0 righe**.
- Registro della residenza: l'ultimo evento è `invito_inviato` delle 09:54:00. Nessun
  `invito_accettato`, coerente con `activateInvite` che li scrive solo a fine percorso
  (`accept-invite.ts:179`).
- Storico degli `invito_accettato` su tutto il DB: 3, tutti `client` con unità
  (19/09, 01/11, 01/11). Inviti admin: 10 creati, **1 usato, il 27/06**, prima della
  riscrittura di settembre che ha introdotto questo `onConflict`.
- Profili `admin` con `builder_id` null: **1** (`pippoloro02+admin`, quello a metà).

## 3. È recente? Anche in produzione?

- **Non è causato da 050/B23 né da E1a.**
  - La migrazione 050 tocca solo le policy di `invites` (`050_invites_rls_scoped.sql`);
    `activateInvite` scrive con il service client, che la RLS non vede.
  - Il commit `a161d4a` (5/11) ha solo aggiunto due controlli in lettura
    (`checkInviteForUser`); l'`upsert` è invariato.
  - I commit E1a toccano i documenti e l'Excel, non `src/app/welcome`.
- Il `onConflict: 'profile_id,residence_id'` è in `accept-invite.ts` dal commit
  `a073af4` (14/09). Da allora nessun invito admin è stato accettato, per questo non
  si era visto.
- **Produzione: sì, il bug c'è.** Stesso progetto Supabase (`kuvekkseclhhcamojysj`) e
  stesso codice: i commit non ancora pubblicati (`git log origin/main..HEAD` = 20)
  non toccano `src/app/welcome` (solo 050 e 051 toccano `supabase/migrations`).
  Quindi **nessun admin può accettare un invito, oggi, neanche in produzione.**

## 4. Perché dice "temporaneo"

- `ACTIVATION_ERROR` è un'unica stringa con "riprova tra poco" applicata a cinque
  scritture diverse e non guarda `error.code`. Qui l'errore è **deterministico**
  (configurazione dello schema): ritentare non lo risolverà mai, ma il messaggio dice
  il contrario.
- Contro la regola di CLAUDE.md ("mai collassare un fallimento tecnico in un
  messaggio di dominio" e, simmetricamente, distinguere i due esiti): qui un guasto
  di schema e un vero guasto transitorio di rete producono lo stesso testo, e un
  conflitto di dominio (la residenza ha già un altro admin) sarebbe oggi invisibile.
- Il log lato server c'è (`console.error`, righe 104/118/131/144/155), ma la
  stringa che arriva a chi guarda lo schermo non permette di capire quale scrittura
  è fallita.

## 5. Fix minimo proposto (un solo concern: la scrittura dell'assegnazione)

File: `src/app/welcome/[token]/accept/accept-invite.ts:137-147`. Nessuna migrazione.

1. Sostituire l'`upsert` con la forma che il DB supporta davvero. Con
   `UNIQUE(residence_id)` il confronto giusto è la residenza, come in `assignAdmin`.
   Due varianti:
   - **A (consigliata):** `insert({ profile_id, residence_id })`; se `error.code ===
     '23505'`, rileggere la riga della residenza: se `profile_id` è lo stesso
     dell'accettante → successo (idempotente, ripetibile); se è un altro → errore di
     **dominio** con testo proprio ("Questa residenza ha già un amministratore
     assegnato: …"), **senza** sostituirlo e senza chiudere l'invito.
   - **B:** `upsert(..., { onConflict: 'residence_id', ignoreDuplicates: true })`.
     Più corto, ma se la residenza ha già un altro admin diventa un **no-op
     silenzioso**: il profilo è promosso, l'invito è chiuso, nessuna assegnazione e
     l'utente vede un successo. Sconsigliata.
   Una riga di sostituzione (`onConflict: 'residence_id'` senza `ignoreDuplicates`)
   scavalcherebbe l'admin esistente: non è un atto che un invito deve poter fare.
2. Nello stesso punto, distinguere nel messaggio il conflitto di dominio dal guasto
   tecnico (`error.code` e rilettura). `ACTIVATION_ERROR` resta per i guasti veri.
3. Prova: un `scripts/verify-*.mjs` sul solo ramo di decisione
   (nessun errore / 23505 stesso profilo / 23505 altro profilo / altro errore),
   come gli altri `verify:*`; poi riprova dal vivo con il link `347d5e21…` e con
   `filippoloro02`.

### Cose da decidere, fuori dal fix

- **`pippoloro02+admin` resta con `builder_id = null`.** `activateInvite` imposta il
  builder solo se l'invito ha un'unità (`accept-invite.ts:86,100`); gli inviti admin
  hanno solo la residenza, quindi un admin nuovo non riceve mai il builder. Non so
  se questo basti o no al suo accesso (l'accesso dell'admin passa dall'assegnazione,
  non dal builder), e non l'ho verificato: il passo 15 della prova dal vivo lo dirà.
  Se serve, è un **secondo commit** (risolvere il builder dalla residenza
  dell'invito), con un'eventuale correzione a mano del profilo esistente: da
  decidere con te, non da assorbire nel fix.
- **Ordine delle scritture:** il profilo viene promosso (riga 98) prima
  dell'assegnazione (riga 138), quindi un fallimento lascia un account a metà, come
  successo qui. Riordinare o rendere atomico è un concern separato.
- **Migrazione per allineare il repo al DB** (registrare `UNIQUE(residence_id)` e
  chiarire `UNIQUE(profile_id, residence_id)`): additiva, ma serve un tuo ok perché
  tocca un vincolo su una tabella con dati. Non necessaria per il fix.
- Il `notification-recipients.ts:127-130` ha un commento sul vincolo che il B23 dice
  essere sbagliato: da sistemare insieme alla migrazione, non prima.

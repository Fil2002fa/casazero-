# Handoff — E1a prova dal vivo, fix invito admin e push · 06/11/2026 11:10

## Sommario
Sessione di chiusura di E1a: preparata la lista delle prove dal vivo (con controlli di codice e DB senza browser), eseguita da Filippo sulla "Residenza Prova" del builder "TEST prova Nicola". La prova ha fatto emergere un bug P0, l'accettazione di un invito admin falliva sempre (42P10 su `admin_assignments`): diagnosi in FASE 0, fix in un commit, verificato dal vivo, poi build e push di tutto (E1a + B39v + fix) su `origin/main`.

## Lavoro completato
- [x] Letto `docs/handoffs/e1a-prova-dal-vivo.md` e verificato in sola lettura codice, route, schema e stato del DB; consegnata a Filippo la lista delle prove a schermo (passi 1-17).
- [x] Trovate tre differenze tra il documento di prova e il codice (vedi "Decisioni chiave").
- [x] Rilanciati gli 11 script `verify:*` senza DB: tutti verdi.
- [x] FASE 0 del bug "Errore temporaneo durante l'attivazione": causa provata con `pg_indexes`/`pg_constraint` e con `postgres_logs` (`there is no unique or exclusion constraint matching the ON CONFLICT specification`, 09:55:21, 09:55:37, 09:57:09 UTC del 6/11). Scritta in `docs/handoffs/invito-admin-fase0.md`.
- [x] Fix invito admin, commit `0969649`: `insert` su `admin_assignments`, 23505 con stesso profilo = successo, 23505 con altro admin = errore di dominio (`RESIDENCE_HAS_ADMIN`), mai sostituzione. Script `verify:assegnazione` (11 casi). `npm run verify` pulito (tsc + lint).
- [x] Prova dal vivo del fix riferita da Filippo: invito accettato da `pippoloro02+admin`, vede Residenza Prova; Excel da admin con 3 schede e senza Fornitori; la pagina Fornitori per l'admin lo rimanda alla pagina Attività (`/admin/manutenzioni`); passo 13 dà 403 (altro builder) e 404 (id non UUID). Controllato io con SELECT (vedi "Funziona").
- [x] `npm run build` pulito sul commit `0969649`.
- [x] Push: `6415ed0..0969649` su `origin/main`, 21 commit (E1a-a…g2, B3 fase 0, B39v fase 0 + fix, migrazione 051, fix invito). Dopo il push 0 commit non pubblicati.
- [ ] Registrare PASS/NON PASSA per ogni passo della prova dal vivo: Filippo ha riferito solo i passi sopra (admin, Excel admin, Fornitori, passo 13). I passi 1-12 (super_admin) risultano eseguiti in parte dal registro attività (correzione dati 09:17, assegnazioni unità 09:26-09:43) ma **non c'è un esito scritto** per passo.

## File toccati
### Creati
- `src/lib/admin-assignment-outcome.ts` — `classifyAssignmentWrite`: decisione pura sull'esito dell'insert (assegnata / già assegnata allo stesso profilo / altro admin / tecnico). Fuori da `accept-invite.ts` perché quel file usa il service client e non è testabile con uno script Node.
- `scripts/verify-admin-assignment.mjs` — 11 casi sui quattro esiti (`npm run verify:assegnazione`).
- `docs/handoffs/invito-admin-fase0.md` — diagnosi FASE 0 con path:riga, prove DB e log. **Non committato.**

### Modificati
- `src/app/welcome/[token]/accept/accept-invite.ts` — `activateInvite` righe ~137-182: l'`upsert` con `onConflict: 'profile_id,residence_id'` diventa `insert`; su 23505 rilegge l'assegnazione della residenza e decide con `classifyAssignmentWrite`; nuova costante `RESIDENCE_HAS_ADMIN`. `ACTIVATION_ERROR` resta per i guasti tecnici.
- `package.json` — script `verify:assegnazione`.

### Letti (solo quelli rilevanti)
- `docs/handoffs/e1a-prova-dal-vivo.md` — la lista delle prove.
- `src/app/api/documenti-xlsx/route.ts`, `src/lib/document-access.ts`, `unit-export.ts`, `deadline-export.ts`, `document-export.ts` — schede, colonne, nome file e gate della route Excel.
- `src/lib/unit-documents.ts`, `UnitDocumentMatrix.tsx`, `AssignUnitPanel.tsx`, `documenti/actions.ts` (`setDocumentUnit`), `document-unit.ts`, `activity-event-view.ts` — quadro unità × documenti, assegna unità e frasi del registro.
- `src/lib/document-checklist.ts` e tabella `document_checklist_template` — scope dell'attesa Agibilità.
- `src/app/welcome/[token]/accept/{actions.ts,accept-invite.ts,page.tsx}`, `supabase/migrations/050_invites_rls_scoped.sql`, `001_schema.sql`, `src/lib/admin-scope.ts`, `admin-actions.ts` — percorso di accettazione dell'invito.
- `docs/handoffs/HANDOFF_b23_isolamento_builder_11_05_15_17.md` — aveva già segnalato il bug (riga 61, "probabile 42P10, backlog P1").

## Decisioni chiave
- **Variante A per l'assegnazione (approvata da Filippo)**: `insert` + gestione di 23505. Scartato `upsert(onConflict: 'residence_id', ignoreDuplicates: true)` perché, con una residenza già assegnata a un altro admin, sarebbe un no-op silenzioso (profilo promosso, invito chiuso, nessuna assegnazione, schermo di successo). Scartato anche l'upsert senza `ignoreDuplicates`, che sostituirebbe l'admin esistente: un invito non deve poterlo fare.
- **Funzione pura in `src/lib/`**: la decisione sta in `admin-assignment-outcome.ts` per poterla verificare con `verify:*`. È un file in più rispetto alle sole righe 137-147 chiesto da Filippo; segnalato come tale.
- **`builder_id` non toccato**: `activateInvite` imposta il builder solo se l'invito ha un'unità, quindi un admin nuovo (invito con sola residenza) resta con `builder_id = null`. Filippo ha deciso di non intervenire prima della prova dal vivo; l'admin vede la residenza, quindi il commit B (builder dalla residenza se null, errore di dominio se diverso) **non è stato preparato**.
- **Backlog, non assorbiti nel fix**: ordine delle scritture (P1), messaggio "temporaneo" per errori di dominio (P1), migrazione `UNIQUE(residence_id)` (P2), header admin per `builder_id` null (P2).
- **Tre differenze tra il documento di prova e il codice** (riportate a Filippo prima della prova): (1) la pagina Fornitori per l'admin non dà errore, rimanda a `/admin/manutenzioni` (`fornitori/page.tsx:28`); (2) assegnare a un'unità la DiCo elettrica senza unità fa comparire in "Da caricare" la voce "Conformità impianto elettrico parti comuni" (scope condominio, `document-checklist.ts:358`); (3) stessa cosa per l'agibilità ("Agibilità (SCA)", scope condominio, confermato dal DB).
- **Commit di codice dopo la verifica dal vivo**: il fix è stato committato solo dopo che Filippo ha scritto che la prova era riuscita, e dopo il controllo SELECT.

## Stato attuale
### Funziona
- DB, verificato con SELECT dopo la prova: `admin_assignments` ha 1 riga per Residenza Prova (`cb14e7c1-bf83-45af-bed2-89f117c16e41`): `pippoloro02+admin` (`adca9258-e162-4e74-b462-ab9e804a90e3`), creata 06/11 10:05:22 UTC; `activity_events` ha un `invito_accettato` (attore `admin`, `role_acquired: admin`, 10:05:22); l'invito `347d5e21-583d-4683-b491-70aaf4633e2e` ha `used_at` valorizzato.
- `npm run verify` (tsc + lint) e `npm run build` puliti sul commit `0969649`; `verify:assegnazione` 11 casi, più gli altri 11 script `verify:*` senza DB verdi (extraction, export, unitdocs, schede, batch, docunit, overrides, evento, match, features, sistemi).
- `origin/main` = `0969649`, nessun commit non pubblicato.
- Il percorso `/api/documenti-xlsx` risponde come da codice per i perimetri provati (403/404) e l'Excel admin ha 3 schede senza Fornitori (riferito da Filippo).

### Non funziona / da verificare
- Il bug era presente anche in produzione (stesso DB, stesso codice): ora il fix è su `main`, ma **non ho verificato che il deploy di produzione sia avvenuto** né provato un'accettazione di invito admin in produzione.
- `pippoloro02+admin` ha `builder_id = null` (unico admin del DB con builder nullo). Non verificato se manchi qualcosa oltre all'header.
- Ramo "altro admin" del fix: provato solo con lo script sulla regola di decisione, **non dal vivo**. Quando scatta, il profilo è già stato promosso ad `admin` (ordine delle scritture, P1) anche se l'assegnazione viene rifiutata.
- Esito per passo della prova E1a (passi 1-12, 14-17 tranne quanto riferito): non registrato.
- Cause dei fallimenti nei batch con rete assente (passo 12) e pagina "Impossibile caricare i documenti per un problema tecnico": la seconda non è provabile da qui, coperta solo da tsc/lint/build.
- Il dev server non è acceso (nessun processo sulla porta 3000 a fine sessione).
- File non tracciati in `docs/handoffs/`: `HANDOFF_b23_isolamento_builder_11_05_15_17.md`, `HANDOFF_b3_design_fase0_11_06_09_49.md`, `HANDOFF_e1a_excel_documenti_11_05_16_03.md`, `invito-admin-fase0.md` e questo file. Nessuno è stato committato o pubblicato.

## Prossimi passi
1. Verificare il deploy di produzione del commit `0969649` (Vercel) e fare un'accettazione di invito admin reale lì, con un indirizzo nuovo, controllando `admin_assignments` e `invito_accettato` con SELECT.
2. **P1 — ordine delle scritture in `activateInvite`** (`accept-invite.ts:98` promuove il profilo prima dell'assegnazione a `:138`): oggi un fallimento o il rifiuto "altro admin" lascia un account promosso senza assegnazione. Fase 0 prima di cambiare, poi un commit.
3. **P1 — messaggio "temporaneo" per errori di dominio**: `ACTIVATION_ERROR` (`accept-invite.ts:6`) copre ancora tutti gli altri punti di `activateInvite` (aggiornamento profilo, lettura e inserimento membership, chiusura invito, e i guasti tecnici dell'assegnazione) senza guardare `error.code`; separare gli esiti di dominio dai guasti tecnici in tutto `activateInvite`. Riguarda anche gli altri "Errore temporaneo…" delle action (grep `temporaneo` in `src`).
4. **P2 — migrazione che registra `UNIQUE(residence_id)`** su `admin_assignments` (esiste solo sul DB live; `001_schema.sql:95` dichiara `UNIQUE (profile_id, residence_id)`, che il DB non ha). Correggere nello stesso lavoro il commento in `src/lib/notification-recipients.ts:127-130`. Chiedere conferma a Filippo (tocca un vincolo) e aggiungere la riga a `docs/migrations.log`.
5. **P2 — header admin "CasaZero" per `builder_id` null**: l'admin con builder nullo non vede il nome/white-label del suo builder. Decidere con Filippo tra ricavare il builder dalla residenza dell'invito (commit B: se null lo imposta, errore di dominio se diverso) e leggerlo dall'assegnazione nell'header; correggere a mano `pippoloro02+admin` solo con SQL mostrato e approvato.
6. Compilare l'esito PASS/NON PASSA per ciascun passo di `docs/handoffs/e1a-prova-dal-vivo.md` (soprattutto i tre che contano per la consegna a Nicola: A2 e B2 senza APE nel quadro e nell'Excel; "Consigliata" mai "Scaduta" sulle promemoria; l'admin che non vede mai fornitori) e committare i documenti di handoff non tracciati.

## Comandi da rilanciare
```bash
# Apertura sessione
git log --oneline -10
git status --short

# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Gate e prove locali
npm run verify
npm run verify:assegnazione
npm run build
```

Query di controllo dell'accettazione (solo SELECT, via MCP Supabase `kuvekkseclhhcamojysj`):
```sql
SELECT a.profile_id, p.full_name, p.role, p.builder_id, a.created_at
FROM admin_assignments a JOIN profiles p ON p.id = a.profile_id
WHERE a.residence_id = 'cb14e7c1-bf83-45af-bed2-89f117c16e41';

SELECT created_at, event_type, actor_role, actor_name, payload
FROM activity_events
WHERE residence_id = 'cb14e7c1-bf83-45af-bed2-89f117c16e41' AND event_type = 'invito_accettato';
```

## Domande aperte
- `pippoloro02+admin` resta con `builder_id = null`: va corretto a mano, e con quale builder (`c71e9e4e-b90e-479b-85d7-cb352b798b5e`)? Oppure il commit B lo risolve per i nuovi inviti e questo caso si lascia com'è?
- Il rifiuto "altro admin" deve lasciare il profilo promosso (stato attuale) o annullarlo? Dipende dall'ordine delle scritture (P1).
- Cambio di admin su una residenza che ne ha già uno: oggi è solo `assignAdmin` del super_admin (`admin-actions.ts:65`, upsert su `residence_id`). Va bene che un invito non possa mai sostituirlo, anche con il consenso del super_admin?
- Dove tenere il backlog P1/P2: nel repo non c'è un file di backlog, le voci sono solo negli handoff.
- Il passo 12 della prova (rete assente nel batch) e i passi 1-12 sono stati eseguiti o no? Servono gli esiti per chiudere E1a.

## Leggi emerse (candidate per CLAUDE.md)

- **Regole di codice ricorrenti (bug class note)**: **Ogni `upsert` con `onConflict` deve corrispondere a un indice unico che esiste davvero sul DB live, non allo schema delle migrazioni.** Prima di scriverlo, verificare con `pg_indexes`/`pg_constraint` sul progetto `kuvekkseclhhcamojysj`: i vincoli di unicità creati a mano non sono nelle migrazioni (es. `admin_assignments` ha solo `UNIQUE(residence_id)` e non `UNIQUE(profile_id, residence_id)` dichiarato in `001_schema.sql`). Un `onConflict` senza indice corrispondente fallisce sempre con 42P10 prima di scrivere. In dubbio, `insert` e gestione esplicita di 23505, rileggendo la riga in conflitto per distinguere "già mio" (successo ripetibile) da "di un altro" (esito di dominio).

- **Regole di codice ricorrenti (bug class note)**: **"Errore temporaneo… riprova" si usa solo per guasti che un nuovo tentativo può risolvere.** Un errore deterministico (vincolo mancante, schema, configurazione) o di dominio (la residenza ha già un amministratore) ha un testo proprio, scelto guardando `error.code`; mai una stringa unica per più scritture diverse. Completa la regola "mai collassare un fallimento tecnico in un messaggio di dominio" nell'altra direzione: un esito di dominio o deterministico non si presenta come transitorio.

- **Invarianti (mai violare)**: **Un invito non sostituisce mai l'amministratore di una residenza.** `admin_assignments` ha `UNIQUE(residence_id)`: una residenza, un solo admin. L'accettazione di un invito admin inserisce l'assegnazione e, se la residenza ha già un altro admin, rifiuta con un errore di dominio senza toccare la riga esistente. Il cambio di admin è solo un atto esplicito del super_admin (`assignAdmin`).

# Handoff — Registro attività, Blocco A · 17/09/2026 13:26

## Sommario
Il registro attività (`activity_events`, migrazione 037) aveva un solo produttore, il sollecito. Il Blocco A ha aggiunto tre atti amministrativi del super_admin — archiviazione di una voce, rimozione e assegnazione dell'amministratore — con un commit preparatorio che fa restituire ad `assertSuperAdmin` l'identità del chiamante da congelare come attore. I quattro commit sono stati fatti il 16/09 tra le 15:46 e le 15:49 in una sessione rimasta senza handoff; questa sessione li ha verificati contro le decisioni approvate, ha chiuso la pendenza di `CLAUDE.md` nel working tree e ha ricevuto da Filippo la conferma della prova a mano. Il Blocco B (inviti) parte da qui.

## Lavoro completato
- [x] Commit `9f6e9db` — `assertSuperAdmin` restituisce `{ userId, role, fullName } | { error }`; i 4 chiamanti (`assignAdmin`, `removeAdminAssignment`, `createAdminInvite`, `getAdminEmail`) passano a `if ('error' in caller)`, stessi messaggi, zero cambi visibili
- [x] Commit `0b53a00` — `voce_archiviata` in `setTemplateActivationForResidence`, solo ramo archiviata e solo se count > 0, una riga per atto con `template_id`, `title`, `count`, `item_ids`
- [x] Commit `bce0f78` — `admin_rimosso` in `removeAdminAssignment`, delete con `.select('profile_id')`, riga solo se qualcosa è stato rimosso, payload `removed_profile_id`, `removed_name`, `count`
- [x] Commit `6df4930` — `admin_assegnato` in `assignAdmin`, lettura dell'assegnazione precedente PRIMA dell'upsert, payload `assigned_profile_id`, `assigned_name`, `replaced_profile_id`, `replaced_name`; riga saltata se l'upsert è identico
- [x] Commit `d78ff37` — `CLAUDE.md` (+10 righe, regola "mai scartare `error`") committato da solo: era la pendenza di due handoff precedenti
- [x] Verifica del Blocco A contro le decisioni D1–D4 (vedi Decisioni chiave) e `npm run verify` verde su `6df4930`
- [x] Prova a mano da pippoloro02 dichiarata superata da Filippo (archiviazione, rimozione, assegnazione)
- [ ] Blocco B — inviti (commit 4 e 5): approvato, non iniziato in questa sessione

## File toccati
### Creati
- `docs/handoffs/HANDOFF_registro_blocco_a_09_17_13_26.md` — questo documento

### Modificati
- `CLAUDE.md` — commit `d78ff37`, nuova regola "Mai scartare `error` da una destrutturazione Supabase" in Regole di codice ricorrenti (scritta in una sessione precedente, committata ora)
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — (16/09) tipo `SuperAdminCaller`, nuova firma di `assertSuperAdmin`, innesti `logActivityEvent` in `assignAdmin` e `removeAdminAssignment`, helper `readProfileName`
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — (16/09) select `role, full_name` e innesto `voce_archiviata` in `setTemplateActivationForResidence`
- `src/lib/activity-event-view.ts` — (16/09) `describeActivityEvent` compone le frasi per `voce_archiviata`, `admin_assegnato` (con "al posto di" se sostituzione), `admin_rimosso`

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/activity-log.ts` — contratto di scrittura: service client, attore dalla sessione, mai solleva, payload solo strutturato
- `supabase/migrations/037_activity_events.sql` — CHECK sugli 8 tipi, "un evento per atto", append-only via assenza di policy + REVOKE
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — flusso "Cambia amministratore" = `removeAdminAssignment` poi `assignAdmin` (righe 367-378): il ramo `replaced_name` non è raggiungibile dalla UI
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — "Escludi dal piano" (riga 641) è l'unico ingresso all'archiviazione
- `src/app/(dashboard)/admin/residences/[id]/attivita/page.tsx` — la pagina registro legge `activity_events` per residenza, ordine decrescente
- `src/app/(app)/profilo/actions.ts` — riga 45: `createFamilyInvite` inserisce `residenceId` senza verificarlo (debito D1)
- `docs/handoffs/HANDOFF_passata_estetica_09_16_15_21.md` — ultimo handoff prima di questo; da lì in poi git e handoff divergevano

## Decisioni chiave
- **Git vince sull'handoff mancante**: i commit 0–3 esistevano già (16/09, 15:46–15:49) senza handoff. Rifarli avrebbe prodotto doppioni; sono stati verificati e non ricreati.
- **D1 — invito familiare escluso dal registro**: `createFamilyInvite` (PWA residente) non produrrà `invito_inviato` nel Blocco B. Il `residenceId` non verificato a `profilo/actions.ts:45` resta com'è: è **debito di sicurezza** annotato, non un concern di questo blocco.
- **D2 — un solo evento all'accettazione**: `activateInvite` scriverà un solo `invito_accettato` con `role_acquired` nel payload, dopo l'update di `used_at` e prima del return. Nessun `admin_assegnato` sintetico in quel percorso, anche quando l'invito è admin.
- **D3 — lettura prima dell'upsert**: applicata in `admin-actions.ts:46-52`; `replaced_profile_id` nel payload alla riga 87. Alternativa scartata: emettere un `admin_rimosso` sintetico nella sostituzione (il flusso UI passa già dalla rimozione e produce i due eventi separati).
- **D4 — tipo `invito_inviato`, testo "Invito generato"**: il valore del CHECK non cambia (niente migrazione), ma in `NEUTRAL_LABEL` e in `describeActivityEvent` la frase dice "Invito generato": nessuna email parte alla creazione del link.
- **Riga solo se l'atto è avvenuto**: archiviazione a zero righe, delete a vuoto, upsert identico non registrano nulla. La tabella è append-only: una riga falsa resterebbe falsa per sempre.
- **Nomi congelati lato server**: `readProfileName` con service client, `null` su errore senza bloccare l'atto. Il registro non deve cambiare senso se una persona cambia nome dopo.
- **`CLAUDE.md` committato da solo**: concern separato dal blocco, messaggio su riga singola come da regola 7.

## Stato attuale
### Funziona
- `npm run verify` verde su `6df4930` (tsc pulito, lint con il solo warning noto su `src/app/api/reconcile-documents/route.ts:12`)
- Prova a mano da pippoloro02 su Residenza Cavaccio: Filippo ha dichiarato superata la prova dei tre atti (archiviazione, rimozione admin, assegnazione admin). **L'output della query di controllo non è stato incollato in conversazione**: il segnaposto è rimasto letterale. La conferma vale come dichiarazione, non come evidenza allegata.
- Working tree pulito a parte i 12 handoff non tracciati in `docs/handoffs/`

### Non funziona / da verificare
- **Ramo `replaced_name` di `admin_assegnato`** non provabile dalla UI: "Cambia amministratore" rimuove sempre prima di assegnare. Provabile solo con un upsert diretto o dopo un cambio di flusso UI.
- **`main` avanti di 10 commit su `origin/main`**, non pushati
- **12 handoff non tracciati** in `docs/handoffs/` (incluso questo)

## Prossimi passi
1. **Blocco B, commit 4 — `invito_inviato`**: innesto in `createInvite` (`units/actions.ts:109`), `createBulkInvites` (`units/actions.ts:141`, una riga con `count`) e `createAdminInvite` (`admin-actions.ts:160`). Escluso `createFamilyInvite` (D1). Testo "Invito generato" in `NEUTRAL_LABEL` e `describeActivityEvent` (D4). Attore da `requireCaller`/`assertSuperAdmin`.
2. **Blocco B, commit 5 — `invito_accettato`**: innesto in `activateInvite` (`welcome/[token]/accept/accept-invite.ts:76`) dopo l'update di `used_at`, prima del return, payload con `role_acquired` (D2). Nessun `admin_assegnato` in quel percorso. Attore = l'utente che accetta.
3. **Dopo il commit 5**: STOP, passi di prova con accettazione in finestra incognito e query di controllo su `activity_events`.
4. **Debito di sicurezza D1**: `profilo/actions.ts:45` — `createFamilyInvite` accetta `residenceId` dal client senza verificare che l'unità appartenga a quella residenza. Blocco a sé, non dentro il registro.
5. **Push** dei 10 commit accumulati quando Filippo lo decide.
6. **Handoff non tracciati**: decidere se committarli in blocco.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# commit del Blocco A + CLAUDE.md
git log --oneline cda14cf..HEAD
```

```sql
-- Controllo registro su una residenza (SQL Editor, statement singolo)
select created_at, event_type, actor_role, actor_name, unit_id, payload
from activity_events
where residence_id = '<id residenza>'
  and created_at > now() - interval '2 hours'
order by created_at desc;
```

## Domande aperte
- **Quarto atto della prova**: i produttori del Blocco A sono tre; il ramo di sostituzione non è raggiungibile dalla UI. Serve renderlo raggiungibile o basta il controllo negativo (rimozione a card vuota non produce righe)?
- **Attore di `invito_accettato`**: chi accetta è l'utente appena creato, il cui `profiles.full_name` potrebbe non esistere ancora al momento dell'atto. Da decidere in commit 5 se `actor_name` viene dal form di accettazione (già validato server-side) o resta null.
- **`createBulkInvites` con fallimenti parziali**: `count` nel payload conta gli inviti creati o quelli richiesti? Da fissare in commit 4 prima di scrivere righe immutabili.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Metodo di lavoro**: `Un commit non esiste finché non ha il suo handoff: se una sessione chiude dei commit senza generarlo, la sessione successiva parte dalla verifica di quei commit contro le decisioni approvate, non dal rifarli. Trovata in sessione: i quattro commit del Blocco A registro attività (16/09) erano in git senza handoff e l'approvazione è stata inviata una seconda volta.`

- **Sezione Regole di codice ricorrenti**: `Una riga in una tabella append-only si scrive solo se l'atto è avvenuto davvero: ogni produttore del registro attività verifica il risultato dell'operazione (righe toccate > 0, stato cambiato) prima di chiamare logActivityEvent. Un delete a vuoto, un upsert identico o un update a zero righe non sono atti. Vale per activity_events e per qualsiasi tabella senza policy UPDATE/DELETE.`

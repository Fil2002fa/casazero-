# Handoff — Registra consegna: modale e consegna prima dell'invito · 27/10/2026 21:16

## Sommario
Commit 13 del blocco "date di consegna" (milestone M5). La pagina Unità ora ha uno stato di ciclo di vita per unità e la modale "Registra consegna" su singola unità, con anteprima del ricalcolo lato client. È stata introdotta la regola "consegna prima dell'invito": invito unico, controlli lato server, revoca degli inviti alla rimozione della consegna. La verifica dal vivo del conflitto di data ha fatto emergere un loop infinito di PostgREST sul SQLSTATE 40001, corretto con la migrazione 046 (PT409).

## Lavoro completato
- [x] `e673c89` committati i due handoff di settembre non tracciati (gli handoff restano versionati: si lavora su due computer)
- [x] `a870585` loader condiviso `loadDeliveryPreview` in `units/actions.ts`, usato sia da `registerDelivery` sia dalla nuova action di sola lettura `getDeliveryPreview`
- [x] `22fc2fd` `DateField` con `onChange` e `id` opzionali (resta non controllato)
- [x] `38b5ade` `unitNotDelivered` + `unitLifecycleStatus` in `src/lib/unit-utils.ts`; componente `UnitLifecycleBadge`; `delivery_date` nei select di pagina Unità e pagina residenza
- [x] `cdf6c35` modale `RegistraConsegnaModal` (anteprima `planDeliveryRecalc`, avvisi "già scadute" e "nel fascicolo", "Segna come non consegnata" con conferma, toast dal `riepilogo` della action)
- [x] `d49423b` migrazione 046 (conflitto PT409 al posto di 40001), applicata e verificata da Filippo; `42c3811` footer con la prova dal vivo
- [x] `c8c954f` mappa errori di `registerDelivery` su `PT409`
- [x] `6e4968d` ritocchi UI: `UnitsSummaryTable` con una sola colonna "Stato" (badge + nome residente), `Modal` con taglia `wide`, titolo modale con etichetta unità, footer su una riga, anteprima con data vecchia barrata e nuova in evidenza
- [x] `5e1bb8e` consegna prima dell'invito: invito unico (`createInvite` restituisce quello attivo), rifiuto server per unità non consegnate (`createInvite`, `createBulkInvites`), invito mostrato subito dopo la consegna (`InviteLinkCard`), revoca degli inviti attivi alla rimozione della consegna, nuova card unità (stato residente testuale), file di pulizia inviti
- [x] Pulizia dati inviti eseguita da Filippo: 2 inviti revocati in teolo (Appartamento 2, TestR9ssss), V3 = 0
- [x] Loop PostgREST trovato in `pg_stat_activity` (pid 369635) e terminato con `pg_terminate_backend`
- [x] Verifica nel browser di Filippo: stati su Portello (super_admin e admin), modale su teolo (anteprima, già scadute, conferma, invito, segna come non consegnata), conflitto a due schede con messaggio in pochi secondi, card su schermo grande e piccolo

## File toccati
### Creati
- `src/components/UnitLifecycleBadge.tsx` — pill del ciclo di vita (Non consegnata / Consegnata, senza residente / Residente attivo, con riga "residente già attivo" per l'incoerenza). Usata solo in `UnitsSummaryTable`
- `src/app/(dashboard)/admin/residences/[id]/units/RegistraConsegnaModal.tsx` — modale registra/modifica consegna. Passi interni: `form`, `conferma_rimozione`, `invito`, `revoca_fallita` (una modale non apre mai un'altra modale). Dopo 20 s senza risposta mostra "Nessuna risposta dal server…" e diventa chiudibile
- `src/app/(dashboard)/admin/residences/[id]/units/InviteLinkCard.tsx` — link d'invito con Copia / WhatsApp / Email e Revoca opzionale; condiviso tra card unità e modale
- `supabase/migrations/046_register_delivery_pt409.sql` — `CREATE OR REPLACE` di `czero_register_delivery`, identica alla 045 salvo `ERRCODE = 'PT409'` sul conflitto di data; footer V1, V2, NEG3, residui e prova dal vivo compilati
- `supabase/maintenance/revoca_inviti_unita_non_consegnate.sql` — V1/V2/D1/V3 per revocare (DELETE) gli inviti attivi di unità con `delivery_date` null; ESITO compilato (27/10, senza filtro builder: 2 → 0)

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — `loadDeliveryPreview` + `getDeliveryPreview`; `registerDelivery` usa il loader, mappa `PT409`, e se la nuova data è null revoca gli inviti attivi (ritorna `revokedInvites` / `revokeError`); `requireUnitsInResidence` ritorna anche `delivery_date`; `createInvite` idempotente (`existing: true`) e rifiuta unità non consegnate; `createBulkInvites` salta le non consegnate e ritorna `notDelivered`
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — card: sotto il nome "Piano N · Consegnata il <data>" / "Non consegnata", stato residente a destra (da md) o in coda (sotto md) con un solo componente `ResidentStatusText`; "Registra consegna" principale per le non consegnate, "Modifica data di consegna" secondario per le consegnate; "Genera invito" disattivato con "Registra prima la consegna"; sezione inviti nascosta per le non consegnate; bottone in blocco "Invita le unità consegnate (N)"; helper locale `activeInvitesOf`
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — `delivery_date` nel select delle unità
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — `delivery_date` nel select; righe di `UnitsSummaryTable` con `lifecycle` (rimosso `active`)
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` — una colonna "Stato" (badge + nome residente), colonna Residente rimossa
- `src/lib/unit-utils.ts` — `unitNotDelivered`, `unitLifecycleStatus`, `unitResidentStatus`
- `src/components/DateField.tsx` — `onChange(value)` e `id` opzionali
- `src/components/ui/Modal.tsx` — taglia `wide` (`max-w-2xl`)

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/delivery-recalc.ts` — `planDeliveryRecalc` è puro e client-safe; il riepilogo contiene già `gia_scadute`
- `supabase/migrations/045_rpc_register_delivery.sql` — RPC originale; il `RAISE … ERRCODE = '40001'` (riga 157) era la causa del loop
- `supabase/migrations/013_add_unit_atomic.sql` — riga 46: `SELECT COALESCE(delivery_date, CURRENT_DATE) … FROM residences`: origine dell'incoerenza delle unità create dopo la 041
- `node_modules/@supabase/postgrest-js/dist/index.cjs` (v2.108.1) — righe 7-29: retry solo su GET/HEAD/OPTIONS e status 520/503; `rpc()` è POST, quindi supabase-js non c'entra col loop

## Decisioni chiave
- **Stato visibile all'admin nella pagina residenza, non nella pagina Unità**: la pagina Unità resta solo super_admin (token d'invito, revoche); l'admin vede lo stato in `UnitsSummaryTable` (readOnly). Scartato: aprire la pagina Unità all'admin.
- **"Non consegnata" vince anche con residente attivo**, mostrando l'incoerenza ("residente già attivo"); data futura = consegnata.
- **Anteprima da action di lettura all'apertura della modale**, non precaricando le voci nella pagina (limite di 1000 righe di PostgREST). `expectedOldDate` = data letta all'apertura; al salvataggio il piano si ricalcola su dati freschi e il toast usa il riepilogo della action.
- **Consegna prima dell'invito**, garantita lato server: `createInvite` e `createBulkInvites` rifiutano/saltano le unità con `delivery_date` null; un'unità non consegnata non ha inviti attivi (revoca = DELETE, come `revokeInvite`, via service client dopo la RPC riuscita).
- **Invito unico**: `createInvite` restituisce l'invito attivo esistente invece di crearne un secondo. Resta una finestra di race (due chiamate simultanee): vedi prossimi passi.
- **PT409 invece di 40001** per il conflitto di data (046): PostgREST ritenta 40001 all'infinito. Scartato P0001 (generico), perché la action deve distinguere il conflitto dal SQLSTATE.
- **Verde "success" = `text-brand-medium`**: nessun token nuovo. Lo stato residente mostra solo il residente principale (elenco completo nella card espansa).

## Stato attuale
### Funziona
- Tutto verificato nel browser da Filippo il 27/10 (vedi "Lavoro completato")
- 046 applicata: V1 `false | {search_path=public} | ha_pt409 true | ha_40001 false`; V2 `authenticated, postgres, service_role` al primo colpo; NEG3 OK (PT409, data invariata, eventi invariati 5); residui `data_a1 2026-06-01`
- `npm run verify` passa (unico warning preesistente: `src/app/api/reconcile-documents/route.ts:12`); `npm run verify:consegna` 32/32
- Working tree pulito; `main` è 33 commit avanti a `origin/main`

### Non funziona / da verificare
- **Unità create dopo la 041 incoerenti**: `czero_add_unit_with_items` calcola le scadenze dalla data della residenza (`013_add_unit_atomic.sql:46`), quindi un'unità nuova nasce con `delivery_date` null ma voci già datate (caso reale: TestR9ssss in teolo, creata il 26/10)
- Avviso "nel fascicolo" della modale mai visto dal vivo: nel builder Furlan nessuna voce di unità ha completamenti (0 su 232 voci di unità; 5 completamenti totali, tutti senza `unit_id`)
- Avviso "revoca fallita" e timeout dei 20 s della modale: verificati solo leggendo il codice
- Race su inviti doppi con due `createInvite` simultanee: nessun vincolo DB
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx:37` destruttura il select delle unità senza `error` (viola la regola di CLAUDE.md)

## Prossimi passi
1. **Commit 14, consegna multipla**: selezione di più unità → "Registra consegna" con inviti generati in automatico. Decidere lì se il pulsante "Invita le unità consegnate (N)" resta. Decidere anche N chiamate atomiche separate contro una RPC batch con un'unica transazione.
2. **Migrazione 044 con FASE 0**: `czero_add_unit_with_items` (e la RPC di creazione residenza della 034, se coinvolta) devono creare voci senza scadenza quando l'unità non è consegnata. Includere una query di riallineamento per le unità create dopo la 041 con `delivery_date` null e voci datate (caso test: TestR9ssss). Solo anteprima, la applica Filippo.
3. **Indice unico parziale sugli inviti attivi** per unità (`unit_id` dove `used_at IS NULL`; la condizione su `expires_at > now()` non è ammessa in un indice: va pensata in FASE 0) per chiudere la race degli inviti doppi.
4. **Scenari `docs/scenari-date-consegna.md`**: aggiornare ed eseguire gli scenari `C10`, compilandone l'esito nella matrice.
5. **Dati demo**: creare completamenti su voci di unità del builder Furlan, così il fascicolo residenti della demo non è vuoto e l'avviso "nel fascicolo" diventa visibile.
6. **`units/page.tsx:37`**: destrutturare `error` e distinguere guasto tecnico da esito di dominio.
7. Dall'handoff precedente, ancora aperti: frase del registro attività per `data_consegna_modificata` dal payload (`activity-event-view.ts`); `src/app/(app)/page.tsx:56` senza `error`; documento DiCo Portello classificato in modo incoerente; `<select>` nativi da sostituire; rinforzo "delivery_date scrivibile solo via RPC" (045, limiti noti).
8. Push: `main` è 33 commit avanti a `origin/main`.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify
npm run verify:consegna
```

## Domande aperte
- Commit 14: il pulsante inviti in blocco resta, se la consegna multipla genera già gli inviti?
- Consegna multipla: N chiamate atomiche (esito parziale possibile) o RPC batch in un'unica transazione?
- Indice unico inviti: come esprimere "attivo" senza `now()` nell'indice (es. unicità su `unit_id` dove `used_at IS NULL` + pulizia degli scaduti)?
- Versione PostgREST del progetto non letta (endpoint REST non la espone con chiave anon): visibile in Dashboard → Settings → Infrastructure.
- La revoca inviti (DELETE) non lascia traccia nel registro attività, come `revokeInvite` oggi: va bene così?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: "**Mai `ERRCODE = '40001'` in una RPC chiamata via PostgREST.** PostgREST tratta 40001 (`serialization_failure`) come errore transitorio e ritenta la transazione all'infinito: se la funzione rifallisce in modo deterministico, la richiesta HTTP non risponde mai e la UI resta in caricamento. Un conflitto di concorrenza si segnala con `PT409` (HTTP 409, nessun retry). Gli esiti di dominio usano codici non ritentabili (`42501`, `P0002`, `22023`, `PTxxx`), mappati nella server action su `error.code`. Caso: 045 → 046, loop osservato il 27/10."
- **Metodo di lavoro**: "**Se una RPC resta in attesa senza errore, controllare subito `pg_stat_activity`.** Query: `select pid, state, query_start, now() - query_start as durata, left(query, 120) from pg_stat_activity where usename = 'authenticator' order by query_start;`. Un backend `active` su `pgrst_call <funzione>` da minuti è un loop di retry: si chiude con `SELECT pg_terminate_backend(<pid>);` (o riavviando il progetto). Correggere la funzione non ferma i loop già partiti. La query la lancia Filippo nel SQL Editor."
- **Regole di codice ricorrenti**: "**Una modale con salvataggio asincrono non resta bloccata all'infinito.** Se la action non risponde entro un tempo dato (oggi 20 s in `RegistraConsegnaModal`), la modale lo dice ('Nessuna risposta dal server. Ricarica la pagina per vedere lo stato attuale') e diventa chiudibile, senza chiudersi da sola né dichiarare un esito che non conosce."

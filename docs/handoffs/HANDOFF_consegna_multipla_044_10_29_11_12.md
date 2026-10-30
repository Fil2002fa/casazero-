# Handoff — Consegna multipla e migrazione 044 · 29/10/2026 11:12

## Sommario
Chiuso il commit 14 (consegna multipla dalla pagina Unità, con inviti generati in automatico) e applicata la migrazione 044: le unità nascono "Non consegnata" sia dal wizard sia da "Aggiungi", le RPC di creazione seguono la cascata di `resolveDueBasis` e le date per categoria del wizard ora sono salvate in `residence_category_dates`. Riallineati i dati incoerenti (4 unità di Tencarola) e aggiunta al wizard l'opzione "Unità già consegnate tutte il <data>" per gli edifici già abitati.

## Lavoro completato
- [x] `b405f91` commit 14 parte 4: selezione delle sole unità non consegnate (casella solo su quelle, link testuale "Seleziona le non consegnate (N)" / "Deseleziona tutte", 14px), modale `RegistraConsegnaMultiplaModal` con frase "Per unità consegnate lo stesso giorno…", header della card rientrato; ritocchi: "Residente:" neutro e solo il nome in verde; `UnitsSummaryTable` senza nome residente (solo etichetta di stato)
- [x] `c78aeb2` 5a: messaggio degli inviti in blocco estratto in `src/lib/bulkInviteMessage.ts` (helper condiviso)
- [x] `a1c8c5e` 5b: dopo la consegna multipla, una chiamata unica a `createBulkInvites` per le unità registrate; esito nella modale, guasto inviti separato dalle consegne già scritte. Verificato da Filippo su teolo (2 unità, "Inviti generati per 2 unità", un solo invito attivo per card)
- [x] `5842cb4` commit D: "Invita le unità consegnate (N)" in stile secondario (il bottone resta)
- [x] FASE 0 della 044 con subagent read-only, decisioni di Filippo raccolte
- [x] `a42a381` migrazione 044 applicata (due volte: la seconda con lo status delle promemoria sempre `in_attesa`) e verificata: V1, blocco 0, POS1–POS3, NEG1–NEG3, residui 0
- [x] `fc9d2d5` riallineamento eseguito: 20 voci corrette su 4 unità di Tencarola (Furlan srl)
- [x] `d2f9d31` wizard: opzione "Unità già consegnate tutte il <data>" e testo di aiuto della data residenza (parti comuni). Verificato nel browser: "TEST wizard A" → 5 unità Non consegnata; "TEST wizard B" (01/03/2026) → 5 unità "Consegnata il 1 mar 2026", "Modifica data di consegna" funzionante
- [x] `supabase/maintenance/test_044.sql` cancellato (esiti nel footer della 044)
- [ ] `docs/scenari-date-consegna.md:377` ancora con l'atteso sbagliato pre-044 (vedi Prossimi passi)

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/units/RegistraConsegnaMultiplaModal.tsx` — consegna di più unità non consegnate con una data: anteprima per unità (`getDeliveryPreviews` + `planDeliveryRecalc`), riepilogo sommato, N chiamate `registerDelivery` in serie (esito parziale possibile), poi inviti in blocco; timeout 20 s per chiamata
- `src/lib/bulkInviteMessage.ts` — frase di esito di `createBulkInvites`, usata dal bottone di testata e dalla consegna multipla
- `supabase/migrations/044_rpc_creazione_unita_non_consegnate.sql` — `czero_create_residence_with_units` a 9 argomenti (`p_units_delivery_date date DEFAULT NULL`, DROP della firma a 8), `czero_add_unit_with_items` riscritta (firma invariata, `P0002` su residenza inesistente); footer con esiti
- `supabase/maintenance/riallinea_voci_unita_non_consegnate.sql` — C1/C2/D1/C3 per azzerare `next_due_date` delle voci di unità ricalcolabili su unità non consegnate; footer con la sequenza effettivamente eseguita

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — selezione per la consegna multipla, casella solo sulle non consegnate, `ResidentStatusText` con colore solo sul nome, bottone inviti secondario, import dell'helper condiviso
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` — solo `UnitLifecycleBadge`, rimosso `residentName`
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — `buildUnitSummary` senza calcolo del residente principale (la query legge ancora `profiles(full_name)`, ora inutile)
- `src/app/(dashboard)/admin/residences/new/page.tsx` — stato `unitsAlreadyDelivered`, casella + `DateField name="units_delivery_date" required` nel riquadro "Edificio esistente", azzerata al reset bfcache e togliendo "Edificio esistente"; testo di aiuto della data residenza
- `src/app/(dashboard)/admin/residences/new/actions.ts` — legge `units_delivery_date` (assente = NULL), controlla `YYYY-MM-DD`, passa `p_units_delivery_date`

### Letti (solo quelli rilevanti per capire il contesto)
- `supabase/migrations/034_rpc_creazione_condizionale.sql`, `013_add_unit_atomic.sql` — corpi riscritti dalla 044
- `supabase/migrations/042_cascata_date_consegna.sql` — `residence_category_dates`, formato dei test DO (042:354-368)
- `supabase/migrations/045_rpc_register_delivery.sql`, `046_register_delivery_pt409.sql` — regole di salto (promemoria, fascicolo, fuori piano), stile test
- `src/lib/maintenance-due.ts:170-202` — `resolveDueBasis`, la cascata da replicare in SQL
- `src/lib/delivery-recalc.ts:93-98` — `planDeliveryRecalc` salta le promemoria
- `src/app/api/cron/daily/route.ts:52-85` — il cron prende solo voci datate; le promemoria (colonna legacy `priority`) vengono avanzate e notificate, mai marcate scadute
- `supabase/migrations/001_schema.sql:18-24` — tabella `builders` (colonna `name`)

## Decisioni chiave
- **Consegna multipla = N chiamate atomiche** a `registerDelivery`, non una RPC batch: ogni unità tutto-o-niente, esito parziale detto unità per unità. Inviti dopo, in una sola chiamata `createBulkInvites` sulle unità registrate.
- **Il bottone "Invita le unità consegnate (N)" resta**, in stile secondario: è il rimedio indicato se gli inviti automatici falliscono.
- **Promemoria delle unità non consegnate restano datate** (base: categoria, altrimenti residenza). Scartato il NULL: il cron non le vedrebbe e `registerDelivery` le salta, quindi resterebbero senza data per sempre.
- **Status delle promemoria sempre `in_attesa`** nei tre INSERT di voci, anche con data passata (invariante "promemoria mai scaduta" portato nel DB).
- **`p_category_dates` salvate in `residence_category_dates`**, solo chiavi con un template: così la consegna successiva (che le legge dalla tabella) segue la stessa cascata della creazione. Scartato: continuare a buttarle.
- **D1 esclude le unità con residente attivo**: restano incoerenti e segnalate in UI ("Residente già attivo") finché non si registra la loro consegna.
- **Filtro `condition_key` in `czero_add_unit_with_items` rimandato a una 047 dedicata**, con i suoi test (oggi no-op: nessun template condizionale ha scope unità, 034:71-80).
- **Opzione "già consegnate" solo nel riquadro "Edificio esistente"**: un edificio nuovo nasce sempre con unità non consegnate.

## Stato attuale
### Funziona
- 044 sul DB: V1 (2 funzioni, 1 overload ciascuna, solo `service_role`, SECURITY DEFINER, `search_path=public`, nessun 40001), status promemoria corretto (2 nella creazione, 1 in Aggiungi); POS1–POS3, NEG1 (`P0002`), NEG2 (`22007`), NEG3 (`42501` su entrambe) OK; residui 0
- Riallineamento: variante di C1 (solo voci da correggere) vuota dopo D1 → nessuna voce ricalcolabile datata su unità non consegnate senza residente
- Consegna multipla e wizard verificati nel browser da Filippo (vedi Lavoro completato)
- `npm run verify` passa (unico warning preesistente: `src/app/api/reconcile-documents/route.ts:12`); working tree pulito; `main` è 11 commit avanti a `origin/main`

### Non funziona / da verificare
- ~~Controllo promemoria su Tencarola mai riportato~~ — **risolto il 30/10**: esito riportato da Filippo (4 unità, promemoria datate 3, ricalcolabili datate 0, ricalcolabili fuori da `in_attesa` 0), registrato nel footer del riallineamento
- **Residenze create con "Unità già consegnate" nascono consegnate ma senza inviti**: nessun invito automatico dal wizard
- **Residenze di prova "TEST wizard A" e "TEST wizard B"** da archiviare
- `docs/scenari-date-consegna.md:377` dice che prima della 044 un'unità aggiunta riceve `delivery_date 2026-06-01`: falso (013 non la scriveva) e ora superato dalla 044
- `src/app/(dashboard)/admin/residences/new/actions.ts:14`: query `profiles` senza `error` (viola la regola di CLAUDE.md); `actions.ts:89` (era la riga 74 prima del commit del wizard): messaggio grezzo della RPC mostrato all'utente
- `src/app/(dashboard)/admin/residences/[id]/page.tsx`: la query unità legge ancora `profiles(full_name)` senza usarlo
- Promemoria nate `scaduta` prima della 044 (034/013 non le escludevano): non contate. Query di sola lettura proposta in sessione, mai eseguita

## Prossimi passi
1. **Migrazione 047** con FASE 0: filtro `condition_key` (stessa forma di `034:194-203`, con `residence_features`) in `czero_add_unit_with_items`; `CREATE OR REPLACE`, firma invariata, test DO in un file temporaneo `supabase/maintenance/test_047.sql` come per la 044. Solo anteprima, applica Filippo.
2. **Push** di `main` (11 commit) e controllo in produzione: creazione residenza con e senza opzione, "Aggiungi", consegna multipla.
3. **Stato demo**: archiviare "TEST wizard A" e "TEST wizard B"; decidere se servono completamenti su voci di unità del builder Furlan (avviso "nel fascicolo" mai visto dal vivo).
4. **Commit separato su `new/actions.ts`**: destrutturare `error` sulla query `profiles` (riga 14) e distinguere guasto tecnico da esito di dominio; non mostrare il messaggio grezzo della RPC.
5. **Inviti dopo il wizard con unità già consegnate**: decidere se generarli in automatico o lasciarli al bottone della pagina Unità.
6. Eseguire la query di controllo promemoria su Tencarola (footer di `riallinea_voci_unita_non_consegnate.sql`) e compilarne l'esito in un commit docs.
7. Aggiornare `docs/scenari-date-consegna.md` (riga 377 e scenari di creazione con e senza opzione).
8. Dagli handoff precedenti, ancora aperti: indice unico parziale sugli inviti attivi per unità (race di `createInvite`); `units/page.tsx:37` e `(app)/page.tsx:56` senza `error`; frase del registro attività per `data_consegna_modificata`; rinforzo "delivery_date scrivibile solo via RPC" (045, limiti noti).

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
- Residenze create con "Unità già consegnate": inviti generati subito o lasciati al bottone?
- Promemoria già `scaduta` nel DB da prima della 044: vanno contate e riportate a `in_attesa` con un file di riallineamento?
- La 047 deve allineare anche altro della 013 rispetto alla 034 (oggi l'unica differenza rimasta è il filtro `condition_key`)?
- Indice unico inviti: come esprimere "attivo" senza `now()` nell'indice?

## Leggi emerse (candidate per CLAUDE.md)
- **Invarianti**: "**Promemoria: mai `scaduta` nemmeno nel DB, mai senza data.** Ogni scrittura di `maintenance_items.status` (RPC, migrazioni, riallineamenti) scrive `in_attesa` per le voci con `completion_mode` effettivo `promemoria`, qualunque sia la data. E una promemoria non si mette mai a `next_due_date` NULL: il cron la avanza e la notifica solo se datata (`api/cron/daily/route.ts:52-54`), e `czero_register_delivery` la salta, quindi una promemoria senza data resta muta per sempre. Caso: 044, 29/10."
- **Metodo di lavoro**: "**Un esito con un segnaposto non è un esito.** Se l'output riportato contiene un segnaposto ('[incolla esito]', '[vuota/esito]') o manca un passo previsto, il footer lo scrive come NON RIPORTATO, con la query che lo produrrebbe; non si ricostruisce un numero, né si deduce un esito da passi vicini. Se il passo mancante è un test ancora da eseguire, il file temporaneo dei test non si cancella."
- **Metodo di lavoro**: "**Il file nel repo coincide con quello applicato.** Se Filippo applica una variante del SQL proposto (forma diversa di un CASE, una query di verifica diversa), il file della migrazione o del riallineamento si allinea al testo eseguito e il footer lo dice; le query di verifica successive si riscrivono sulla forma applicata, non su quella proposta."

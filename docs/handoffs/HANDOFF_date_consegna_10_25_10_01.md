# Handoff — Date di consegna · 25/10/2026 10:01

## Sommario
Blocco "date di consegna" (milestone M5): la data base delle scadenze ora viene da una cascata a livelli. La data dell'unità è un cancello: senza consegna il piano dell'unità non parte. Lo schema è a posto (migrazioni 041-043 applicate), la precedenza sta in un'unica funzione (`resolveDueBasis`) e c'è una matrice di accettazione degli scenari. In questa sessione è stato committato lo stato "In attesa di consegna" per le voci senza data (`a0cb342`). Lo stato "non consegnata" mostrato a livello di unità nella pagina Manutenzioni è stato provato e poi scartato dopo la verifica nel browser. Manca ancora la modale "Registra consegna" con le sue RPC.

## Lavoro completato
- [x] `6f64ab5` una sola aritmetica delle scadenze (`nextDueFrom`), clamp a fine mese come `date + interval` di Postgres
- [x] `7bf5e3b` tipo `MaintenanceItem` riallineato allo schema (le tre colonne della 011)
- [x] `f34a5ff` completamento residente: il ricalcolo della scadenza lo fa solo il trigger `czero_recalc_due`
- [x] `30cf6b1` cascata delle date: `resolveDueBasis` (`src/lib/maintenance-due.ts`) è l'unica precedenza
- [x] `a58f18d` migrazione 041 `units.delivery_date`, applicata e verificata
- [x] `65e3b78` migrazione 042 livelli categoria (`residence_category_dates`) e voce (`maintenance_items.due_basis_override`), applicata e verificata
- [x] `97b74a4` + `989cf19` migrazione 043, tipo di evento `data_consegna_modificata` in `activity_events`, applicata il 2026-10-24. Il footer riporta gli esiti reali; alcune verifiche risultano "non eseguito" (vedi sotto)
- [x] `3b96dca` la data dell'unità è un cancello e non un livello di fallback
- [x] `df787e1` + `def0637` matrice di accettazione `docs/scenari-date-consegna.md` (12 scenari; A1 ha 8 voci, 2 delle quali promemoria)
- [x] `a0cb342` stato "In attesa di consegna": chip sulle righe chiuse del piano di residenza, etichetta nel dettaglio voce (due shell), riga nella lista admin, card neutra in home residente al posto di "Tutto in ordine" quando nessuna voce ha data. Verificato nel browser da Filippo
- [ ] Modale "Registra consegna" + RPC di scrittura delle date (+ ricalcolo delle voci senza completamenti) — non iniziata
- [ ] Scenari della matrice marcati `C10` — non eseguibili finché manca la modale

## File toccati
### Creati
- `src/components/AwaitingDelivery.tsx` — resa unica dello stato "In attesa di consegna": `AwaitingDeliveryNote` (dettaglio voce, prop `shell` app/dashboard), `AwaitingDeliveryLine` (riga lista), `AwaitingDeliveryHomeCard` (home residente), `AwaitingDeliveryChip` (riga chiusa del piano; mostra "N in attesa di consegna" quando solo una parte del gruppo è ferma)

### Modificati
- `src/lib/maintenance-status.ts` — aggiunti `AWAITING_DELIVERY_LABEL` e `isAwaitingDelivery` (conteggiabile, non promemoria, non completata, `next_due_date` null; per costruzione disgiunto da `isOverdueLive`). Nuovo bucket `in_attesa_consegna` in `activityBucket`, in coda e separato da `in_arrivo`
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — chip sulla riga chiusa del gruppo, `AwaitingDeliveryLine` nella riga unità espansa al posto del vuoto
- `src/app/(app)/page.tsx` — `hasAnyDated`: senza nessuna voce datata non compare il banner verde "Tutto in ordine", compare solo `AwaitingDeliveryHomeCard`
- `src/app/(app)/manutenzioni/[id]/page.tsx`, `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — `AwaitingDeliveryNote` al posto di "Prossima scadenza" quando manca la data
- `src/app/(dashboard)/admin/manutenzioni/page.tsx`, `.../ManutenzioniTable.tsx` — bucket `in_attesa_consegna` nella lista attività admin

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/maintenance-due.ts` — `resolveDueBasis`, ordine della cascata (voce → [cancello unità] → categoria → unità | residenza per le parti comuni)
- `docs/scenari-date-consegna.md` — matrice di accettazione e questioni aperte
- `supabase/migrations/043_event_data_consegna_modificata.sql` — footer con gli esiti reali
- `src/lib/pluralize.ts` — helper per la pluralizzazione

## Decisioni chiave
- **"Non consegnata" è uno stato dell'unità, non della voce**: sono stati provati un banner neutro sul piano filtrato per unità, un riepilogo "N unità non ancora consegnate" su "Tutte le unità" e un suffisso "· non consegnata" nel selettore. Dopo la verifica nel browser sono stati scartati tutti e tre: troppo peso nella pagina Manutenzioni e aspetto che cambiava a seconda del filtro. Sulla voce resta solo l'informazione minima (chip ed etichetta). Lo stato dell'unità andrà nella pagina Unità (commit 13).
- **Helper `unitNotDelivered` rimosso**: non aveva più chiamanti dopo lo scarto dei banner. Va reintrodotto in `src/lib/unit-utils.ts` insieme al suo primo chiamante, cioè la colonna di stato nella pagina Unità.
- **La cascata governa solo la prima scadenza**: dal primo completamento la data la riscrive il trigger `czero_recalc_due` partendo da `completed_at`. Il ricalcolo su cambio data salta le voci che hanno già un completamento.
- **Override di voce vince sempre**, anche su un'unità non consegnata: è l'unico modo di far partire una voce prima della consegna.
- **Promemoria esclusi da "In attesa di consegna"**: `isAwaitingDelivery` li esclude, così resta valido l'invariante "Consigliata · ogni X mesi".

## Stato attuale
### Funziona
- Chip "In attesa di consegna" sulle righe chiuse, nessun chip sulle promemoria, etichetta nel dettaglio, nessun banner nella pagina Manutenzioni (verificato nel browser da Filippo il 25/10)
- `npm run verify`: tsc pulito, un solo warning lint preesistente (`src/app/api/reconcile-documents/route.ts:12` `req` non usato)
- Migrazioni 041, 042, 043 applicate

### Non funziona / da verificare
- Migrazione 043: nel footer alcune verifiche risultano "non eseguito" (la query V3 corretta e il test di scrittura del valore). Vanno eseguite e annotate prima di scrivere eventi `data_consegna_modificata` dalle RPC
- Scenari `C10` della matrice non eseguibili finché manca la modale
- `src/app/(app)/page.tsx:56`: la `Promise.all` destruttura `{ data: rawUrgent }` (e le altre query) senza `error`. Il problema c'era già prima e viola la regola di CLAUDE.md: un errore tecnico diventa "nessuna voce", e quindi ora diventa anche la card "piano non partito"
- File non tracciati lasciati fuori di proposito: `docs/handoffs/HANDOFF_estrazione_documenti_09_18_14_21.md`, `docs/handoffs/HANDOFF_export_excel_documenti_09_18_15_07.md`, `supabase/maintenance/passo0.sql`, `passo1.sql`, `passo2.sql` (seed demo Padova, da decidere se committarli)

## Prossimi passi
1. Aggiornare `docs/scenari-date-consegna.md`: la questione aperta 1 (banner "Tutto in ordine" in home) è risolta da `a0cb342`, e la nota `C8` in testa ("pronto ma non committato") è superata.
2. Eseguire le verifiche 043 rimaste "non eseguito" e compilarne l'esito nel footer.
3. Commit 13, modale "Registra consegna" (FASE 0 prima): selezione singola o in blocco, anteprima con il livello di cascata per voce, RPC di scrittura + evento `data_consegna_modificata` + ricalcolo delle sole voci senza completamenti. **Nello stesso piano**: nella pagina Unità, una colonna di stato con un ciclo di vita unico — *Non consegnata* / *Consegnata, senza residente* / *Residente attivo* — che unisce `delivery_date` e `unitHasNoActiveAccount`, accanto al pulsante "Registra consegna". Reintrodurre lì `unitNotDelivered`. Questo copre anche la questione aperta 3 della matrice.
4. Concern separato: `src/app/(app)/page.tsx:56`, destrutturare `error`, loggarlo lato server e distinguere il fallimento tecnico dall'esito "nessuna voce".
5. Backlog FASE 0 separata: il documento "01 DiCo impianto elettrico Portello" compare sotto "Per unità · A1" ma la classificazione dice parti comuni, e il filtro "Parti comuni" lo mostra. Va capito se è sbagliata l'archiviazione (unit_id valorizzato) o se il filtro è incoerente con il raggruppamento.
6. Fase design: sostituire i `<select>` nativi (es. selettore unità del piano di residenza, `Select` in `src/components/ui/Input`).

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
- Numerazione: `docs/scenari-date-consegna.md:11` chiama la modale `C10`, mentre in sessione è stata chiamata "commit 13". Va allineata la numerazione del piano dei commit (cosa sono i commit 9-12?).
- Lista manutenzioni del residente (`(app)/manutenzioni/ManutenzioniList.tsx`): mostrare "In attesa di consegna" anche lì? È la questione aperta 2 della matrice, lasciata fuori di proposito.
- `supabase/maintenance/passo0-2.sql`: committarli o lasciarli locali?

## Leggi emerse (candidate per CLAUDE.md)
- **Invarianti**: "**Lo stato di consegna è dell'unità, non della voce.** Sulle superfici del piano (Manutenzioni) una voce senza data mostra solo il chip/etichetta neutra \"In attesa di consegna\" (`isAwaitingDelivery`, mai sulle promemoria). Banner, riepiloghi o marcature di \"unità non consegnata\" vivono nella pagina Unità, non nel piano: lì lo stato non cambia aspetto a seconda del filtro."
- **Regole di codice ricorrenti**: "**Un banner verde \"tutto a posto\" non si mostra quando l'assenza di problemi deriva dall'assenza di dati.** Se nessuna voce ha una data, \"Tutto in ordine\"/\"Tutto in regola\" è vero per omissione: va soppresso e sostituito dallo stato reale (es. card neutra \"il piano parte dalla data di consegna\")."

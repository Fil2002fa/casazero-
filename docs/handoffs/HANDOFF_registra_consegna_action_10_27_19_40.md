# Handoff — Registra consegna: server action · 27/10/2026 19:40

## Sommario
Blocco "date di consegna" (milestone M5), lato server della scrittura. La migrazione 045 (RPC `czero_register_delivery`) è applicata, verificata e committata con i test nel footer. La server action `registerDelivery` è committata in `9b20264` (commit 12, seconda parte). Nessuna UI chiama ancora la action: la verifica funzionale è rimandata al commit 13, che aggiunge la modale "Registra consegna".

## Lavoro completato
- [x] Footer della 045 compilato con gli esiti reali e committato (`282b32b`). Il primo apply di REVOKE/GRANT non aveva preso effetto (V2 mostrava PUBLIC e anon): è stato rilanciato e V2 è stata rifatta. Esiti finali: V1 `czero_register_delivery | false | {search_path=public}` · V2 `authenticated, postgres, service_role` · NEG1-NEG6 e POS tutti OK · residui: `data_a1` 2026-06-01, eventi 0
- [x] `supabase/maintenance/test_045.sql` cancellato (i test vivono nel footer della 045)
- [x] Server action `registerDelivery` in `units/actions.ts` (`9b20264`)
- [x] `ActivityEventType` allargato con `data_consegna_modificata`, con icona ed etichetta neutra nel registro (`9b20264`)
- [ ] Verifica funzionale della action: rimandata al commit 13

## File toccati
### Creati
- nessuno

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — nuova `registerDelivery(unitId, expectedOldDate, newDate)`, insieme agli helper `registerDeliveryErrorMessage` e `normalizeDeliveryDate`. Cosa fa, in ordine:
  - controlla il ruolo con `requireCaller` (solo super_admin)
  - valida le date con `nextDueFrom(x, 0)` e rifiuta una data uguale a quella attuale
  - legge unità, voci (con `completions(count)`) e `residence_category_dates` con il client di sessione
  - calcola il piano con `planDeliveryRecalc` e passa alla RPC solo le voci con esito `ricalcola`
  - in caso di successo chiama `revalidatePath` su Unità e Manutenzioni e ritorna `{ riepilogo }`
- `src/types/database.ts` — `ActivityEventType` ha 9 valori. Il commento rimanda al CHECK vivo nella 043 e precisa che solo la RPC 045 scrive `data_consegna_modificata`, mai `logActivityEvent`
- `src/lib/activity-event-view.ts` — `CalendarClock` ed etichetta "Data di consegna modificata" nelle due mappe `Record<ActivityEventType, …>`. Servono per far compilare tsc. La frase dettagliata costruita dal payload arriva con la UI
- `supabase/migrations/045_rpc_register_delivery.sql` — footer di verifica (`282b32b`)

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_date_consegna_10_25_10_01.md` — handoff precedente del blocco; contiene il piano del commit 13
- `src/lib/delivery-recalc.ts` — `planDeliveryRecalc` e `DeliveryRecalcSummary`, cioè il riepilogo che la action ritorna alla UI

## Decisioni chiave
- **Client di sessione, non service client**: la RPC è SECURITY INVOKER e riconosce l'attore da `auth.uid()`. La RLS del super_admin fa da perimetro: un'unità di un altro costruttore risulta "Unità non trovata". Alternativa scartata: service client più controllo manuale del perimetro.
- **Concorrenza ottimistica sulla data, piano ricalcolato su dati freschi**: `expectedOldDate` è la data mostrata all'utente nell'anteprima. La RPC la confronta sotto lock e, se diverge, non scrive niente (40001). Il piano invece si ricalcola nella action al momento del salvataggio, non arriva dal client.
- **Esito deciso dal SQLSTATE, mai dal testo del messaggio**:
  - 42501 → permessi
  - P0002 → unità non trovata
  - 40001 → "La data è stata cambiata da qualcun altro: ricarica la pagina."
  - 22023 → piano non valido
  - ogni altro codice → "Errore temporaneo… riprova" (guasto tecnico, non esito di dominio)
- **Controlli in ingresso (approvati da Filippo)**:
  - data malformata
  - data invariata ("nessuna modifica")
  - eccezione di `planDeliveryRecalc` su dati corrotti → errore non transitorio, nessuna scrittura
- **`completions(count)` invece della lista**: per sapere se una voce ha completamenti basta il conteggio, che non incontra il limite di righe per richiesta di PostgREST.

## Stato attuale
### Funziona
- RPC 045 applicata. Permessi, test negativi (NEG1-NEG6) e positivo (POS) verificati sul DB, esiti nel footer
- `npm run verify` passa (tsc e lint). L'unico warning è preesistente e fuori scope: `src/app/api/reconcile-documents/route.ts:12` `'req' is defined but never used`

### Non funziona / da verificare
- `registerDelivery` non è mai stata eseguita end-to-end: nessuna UI la raggiunge. Da verificare nel commit 13:
  - esito positivo
  - 40001 provocato con due schede aperte
  - unità di un altro costruttore
  - unità con voci già completate (devono restare invariate)
- Scenari `C10` di `docs/scenari-date-consegna.md`: ancora non eseguibili

## Prossimi passi
1. Commit 13, modale "Registra consegna", con FASE 0 prima. Il piano è nell'handoff `HANDOFF_date_consegna_10_25_10_01.md`, passo 3. Comprende:
   - anteprima con il livello di cascata per voce
   - chiamata a `registerDelivery`, mostrando `riepilogo` all'utente
   - colonna di stato nella pagina Unità: *Non consegnata* / *Consegnata, senza residente* / *Residente attivo*, che unisce `delivery_date` e `unitHasNoActiveAccount`
   - reintroduzione di `unitNotDelivered`
2. Verifica funzionale di `registerDelivery` nel browser con i casi elencati sopra; poi eseguire gli scenari `C10` e compilarne l'esito nella matrice.
3. Frase del registro attività per `data_consegna_modificata`, costruita dal payload (livello, vecchio → nuovo, voci ricalcolate) in `activity-event-view.ts`.
4. Passi ancora aperti dall'handoff precedente:
   - aggiornare `docs/scenari-date-consegna.md`
   - verifiche 043 rimaste "non eseguito"
   - `src/app/(app)/page.tsx:56` destruttura senza `error`
   - documento DiCo Portello classificato in modo incoerente
   - `<select>` nativi da sostituire

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
- Selezione "in blocco" nella modale: la RPC e la action lavorano su una sola unità. Con più unità, si fanno N chiamate (ognuna atomica, quindi alcune possono riuscire e altre no) o serve una RPC batch con un'unica transazione? Da decidere nella FASE 0 del commit 13.
- I due handoff non tracciati `docs/handoffs/HANDOFF_estrazione_documenti_09_18_14_21.md` e `HANDOFF_export_excel_documenti_09_18_15_07.md`: committarli o eliminarli?
- Numerazione dei commit: è ancora aperta la questione dell'handoff precedente (`C10` contro "commit 13").
- `main` è 22 commit avanti rispetto a `origin/main`: quando fare push?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice ricorrenti**: "**Gli errori di una RPC si mappano sul SQLSTATE, mai sul testo del messaggio.** Ogni RPC che solleva esiti di dominio usa codici dichiarati (es. 42501 permessi, P0002 non trovato, 40001 conflitto di concorrenza, 22023 input non valido), documentati e testati nel footer della migrazione. La server action ha uno switch su `error.code`. Ogni codice non previsto finisce nel messaggio di guasto tecnico (\"riprova\"), mai in un esito di dominio."
- **Metodo di lavoro**: "**Dopo REVOKE/GRANT su una funzione, la verifica dei permessi (V2) si rilancia sempre e il suo output va nel footer.** Un apply di permessi può non prendere effetto senza dare errore: con la 045, il primo apply lasciava ancora PUBLIC e anon. Il footer riporta anche il rilancio, non solo l'esito finale."

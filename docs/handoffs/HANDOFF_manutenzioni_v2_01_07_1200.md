# Handoff — Manutenzioni v2 (due assi) · 01/07/2026 12:00

## Sommario
Questa sessione ha completato la FASE 1 della migrazione del dominio manutenzioni dalla sigla unica N1/N2/N3 al modello a due assi indipendenti: `completion_mode` (chi completa: residente/amministratore/promemoria) e `obligation_type` (quanto è vincolante: A legge/B raccomandata/C consiglio). Il lavoro è stato preceduto da due sessioni di diagnosi read-only che hanno mappato schema DB, codice della vista super_admin `/admin/residences/[id]/manutenzioni` e i dati reali di Residenza Cavaccio. Tutti i commit sono su `master`, build verde, `priority` (N1/N2/N3) non è stata droppata: resta in dual-write durante la transizione.

## Lavoro completato
- [x] **Diagnosi FASE 0**: schema Supabase letto via MCP, catalogo v2 analizzato, gap tra v1 e v2 documentato (27→19 voci, voci rimosse/fuse/condizionali, nuovi enum)
- [x] **Diagnosi FASE 0 bis**: ogni file della vista super_admin mappato riga per riga — occorrenze N1/N2/N3, logica speciale, activation_status assente
- [x] **Commit A** `fc92d04` — `page.tsx` seleziona i nuovi campi; tipo `ItemRow` aggiornato; type alias `CompletionMode/ObligationType/ItemActivation` aggiunti a `database.ts`
- [x] **Commit B** `5a75477` — nuovo componente `MaintenanceBadge` (badge colore-stato + testo obbligo); sostituisce `PriorityBadge` nei due call site della vista; guard "no data scadenza" migrato da `effPriority==='N1'` a `effMode==='promemoria'`
- [x] **Commit E** `f6a4077` — item `activation_status='archiviata'` spariscono dal piano attivo (lista + contatori scadute/in corso) via `liveItems`; tab Completate usa `completions`/`items` pieni (fascicolo intatto); `completionsByCategory` lookup su `items` pieno per evitare count/list divergence
- [x] **Commit D** `a7dec48` — dual-write bidirezionale in `updateMaintenanceItemConfig`: helper `modeToPriority`/`priorityToMode`, `completion_mode` ha precedenza su `priority` (form nuovo), fallback legacy per form vecchio; guard N1 valuta `effectivePriority` dal payload finale
- [x] **Commit C** `2322e11` — `ItemConfigForm` passa da select N1/N2/N3 a due select Modalità + Tipo; submit invia `completion_mode` + `obligation_type`; nota ambra statica sotto frequenza quando tipo è A; call site in `ManutenzioniClient` aggiornata a `currentMode`/`currentObligation`

## File toccati
### Creati
- `src/components/MaintenanceBadge.tsx` — badge a due assi: `mode` determina la label, `status` determina il colore (promemoria sempre blu fisso); testo secondario grigio per `obligation_type`

### Modificati
- `src/types/database.ts` — aggiunti type alias `CompletionMode`, `ObligationType`, `ItemActivation` allineati agli enum DB
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — SELECT estesa con `completion_mode`, `obligation_type`, `activation_status` (item) e `completion_mode`, `obligation_type` (template join)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — tipo `ItemRow` aggiornato; calcolo `effMode`/`effObl` affiancato a `effPriority` (non rimosso); `PriorityBadge` sostituito con `MaintenanceBadge`; guard promemoria; `liveItems` per piano attivo; call site `ItemConfigForm` aggiornata
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ItemConfigForm.tsx` — rewrite: due select (Modalità + Tipo) al posto del select N1/N2/N3; submit invia `completion_mode`/`obligation_type`; nota legale ambra condizionata a `obligation === 'A'`
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — `updateMaintenanceItemConfig` accetta `completion_mode` e `obligation_type`; dual-write con helper puri; guard N1 legge `effectivePriority` dal payload (non `data.priority` grezzo)

### Letti (rilevanti per contesto)
- `src/types/database.ts` — per verificare alias esistenti prima di aggiungere
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — per rispondere al dubbio "priority viene sempre scritta?" prima del dual-write
- Schema Supabase via MCP — colonne, enum, trigger su `maintenance_items`, `maintenance_templates`, `completions`

## Decisioni chiave

- **`activation_status='archiviata'`: piano vs fascicolo**: gli item archiviati spariscono dal piano attivo (`liveItems`) ma le loro completion restano nel tab Completate. `completionsByCategory` fa lookup su `items` pieno (non `liveItems`) per evitare che `completedCount` e la lista divergano nella stessa schermata. Alternativa scartata: filtrare tutto su `liveCompletions` (avrebbe nascosto completion storiche valide).

- **Dual-write bidirezionale**: `completion_mode` ha precedenza su `priority` nell'action; se arriva solo `priority` (form legacy ancora in uso fino a commit C) si deriva `completion_mode`. `obligation_type` è additivo puro — non ha un gemello legacy, non viene derivato da `priority`. Alternativa scartata: write unidirezionale (avrebbe lasciato un asse desincronizzato durante la finestra di transizione).

- **Guard N1 sul payload finale**: il guard "reset status/ricalcola next_due_date" legge `updatePayload.priority` (dopo il dual-write), non `data.priority`. Questo lo fa scattare correttamente anche quando arriva `completion_mode='promemoria'` senza `priority` esplicita.

- **`PriorityBadge` non rimosso**: il vecchio componente serve a viste fuori scope (residente, admin). Solo i due call site in `ManutenzioniClient` sono stati migrati a `MaintenanceBadge`.

- **`effPriority` non rimosso da `ManutenzioniClient`**: è ancora usato come `currentPriority` passato a `ItemConfigForm`... ma dopo commit C non lo è più. È una variabile ora inutilizzata nella lista principale — cleanup schedulato come commit separato ("un concern per commit").

- **Nota legale tipo A**: nota statica ambra, non blocca il salvataggio, reagisce solo al valore corrente di `obligation` nello stato locale. Nessun dialog di conferma, nessun impedimento.

- **`is_active`/`is_conditional` sui template**: le colonne esistono nel DB (migrate) ma non sono ancora usate nel codice. Servono per il futuro "Componi piano" (commit 8).

## Stato attuale
### Funziona
- La vista super_admin `/admin/residences/[id]/manutenzioni` legge e mostra i nuovi campi
- `MaintenanceBadge` mostra la modalità come badge colorato per stato + testo obbligo accanto
- Item `archiviata` esclusi dal piano attivo, loro completion visibili nel tab Completate
- `ItemConfigForm` scrive `completion_mode` e `obligation_type`; il dual-write in actions.ts mantiene `priority` coerente
- Il guard promemoria (no "Scade/Scaduta") gira su `effMode === 'promemoria'`
- `tsc --noEmit` pulito su tutti i commit

### Non funziona / da verificare
- **Test UI reale non eseguito**: il dev server gira in finestra separata; nessuna verifica visiva che i dati DB siano già migrati (completion_mode/obligation_type popolati sui template di Cavaccio)
- **`effPriority` inutilizzata** nella lista principale di `ManutenzioniClient` dopo commit C (non causa errore TS se `noUnusedLocals` non è attivo, ma è dead code)
- **`esclusa`**: gli item con `activation_status='esclusa'` arrivano nel feed mescolati agli `inclusa` — nessuna UI per loro (la diagnosi li esclude da questa residenza, ma il commit futuro dovrà gestirli)
- **Template v1 deprecati**: `is_active=FALSE` settato su 8 template rimossi/fusi, ma la UI non filtra ancora su `is_active` — gli item legati a quei template potrebbero apparire se non sono già `activation_status='archiviata'`

## Prossimi passi
1. **Verificare visivamente la UI** aprendo `/admin/residences/[id]/manutenzioni` su Residenza Cavaccio: controllare che i badge mostrino la modalità corretta, che il form "Configura" mostri i due select, che la nota ambra appaia per le voci tipo A ("Verifica linee vita")
2. **Cleanup `effPriority`** (commit separato, concern unico): rimuovere la variabile inutilizzata nella lista principale di `ManutenzioniClient` ora che `ItemConfigForm` non la riceve più
3. **Commit F — filtra `is_active=FALSE`**: la query in `page.tsx` dovrebbe escludere gli item legati a template `is_active=FALSE` (o filtrare via `activation_status='archiviata'` se già migrati correttamente)
4. **Commit G — UI per `esclusa`**: aggiungere visualizzazione e azione "Attiva/Escludi" per `activation_status='esclusa'` nella vista super_admin
5. **Commit H — nuovi template v2**: inserire i 2 template mancanti ("Manutenzione impianto climatizzazione", "Manutenzione impianto fotovoltaico") e i relativi `maintenance_items` per Residenza Cavaccio
6. **Decidere punto aperto "Promemoria amministratore"**: "Pulizia muri esterni" e "Trattamento idrorepellente" — completabili (Amm/C) o Promemoria non completabili? Impatta la logica del ciclo admin e il fascicolo

## Comandi da rilanciare
```bash
# Il dev server gira in una finestra PowerShell separata e persistente
cd C:\progetti\casazero
npm run dev

# Type check
npx tsc --noEmit

# Build di verifica prima di ogni commit
npm run build
```

## Domande aperte
- **`effPriority` inutilizzata**: rimuoverla in un micro-commit subito, o aspettare il prossimo commit di sostanza e includerla come cleanup?
- **`is_active` lato query**: filtrare `is_active=FALSE` in `page.tsx` (lato SQL) o lato client in `ManutenzioniClient` come `liveItems`? Il guardrail attuale dice "non filtrare a livello SQL gli archiviati" — ma `is_active` è un attributo del template, non dell'item: regola diversa.
- **FV a modalità duale**: "Manutenzione impianto fotovoltaico" ha modalità "Amministratore o Residente" a seconda se l'impianto è condominiale o di unità. Un template con due modalità possibili, o due template distinti?
- **Punto aperto catalogo**: "Promemoria" può esistere lato amministratore (muri esterni, idrorepellente)? O quelle voci restano "Amministratore · C" (completabili ma non urgenti)?

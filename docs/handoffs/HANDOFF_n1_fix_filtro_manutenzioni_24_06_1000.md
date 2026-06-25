# Handoff — Fix N1 visivo + filtro card manutenzioni residenza · 24/06/2026 10:00

## Sommario
Sessione dedicata a due task UI sulla vista manutenzioni della residenza (super_admin). Prima è stato corretto il trattamento visivo delle voci N1/Consigliate in tutti i componenti card (niente rosso né vocabolario di scadenza, sempre testo blu "Consigliata · ogni X mesi"). Poi la card "222 Totali" è stata sostituita con "Completate" (verde brand, conteggio da tabella `completions`), e tutte e tre le card sono diventate filtri interattivi a interruttore sulla lista sotto. Tutti i commit sono su build verde, nessuna modifica a server action, DB o RLS.

## Lavoro completato
- [x] Fix N1 in `MaintenanceCard`: aggiunta prop `frequencyMonths`, `isUrgent` guarda `priority !== 'N1'`, ramo N1 mostra "Consigliata · ogni X mesi" in `text-semantic-blue` senza mai confrontare status o data
- [x] Fix N1 in card inline `/admin/residences/[id]/manutenzioni` (ora rimossa nel refactor): stesso trattamento via `effPriority === 'N1'`
- [x] Fix N1 in `/manutenzioni` (shell client): aggiunta `frequency_months` alla query e al tipo `ItemRow`, passato come `frequencyMonths` nella sezione "Consigliate"
- [x] Estratto `ManutenzioniClient.tsx`: Client Component che riceve `items`, `completions`, `suppliers` dal Server Component; gestisce `activeFilter` e `selectedYear` con `useState`
- [x] Card "Totali" → "Completate": conteggio da `completions WHERE residence_id AND year = selectedYear`; trattamento verde brand (`bg-brand-light`, `text-brand-dark`)
- [x] Tre card cliccabili a interruttore: clic filtra la lista, riclic rimuove il filtro; evidenza attiva con `ring-2`
- [x] Selettore anni a chip visibile solo con filtro Completate attivo; chip anni derivati da `completions` disponibili; default anno corrente
- [x] Vista completamenti: lista per categoria con badge priorità, data `completed_at` formattata, `performed_by_name`
- [x] `page.tsx` semplificato: solo fetch in `Promise.all` + header sticky; zero logica JSX
- [x] CLAUDE.md: aggiunta sezione §13 convenzioni di sviluppo (era stata scritta in sessione precedente, mai committata)
- [x] Build verde su tutti i commit (ultimo: `33a9f58`)

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — Client Component con stato filtro, card-contatore interattive, selettore anni, lista items e lista completamenti

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — ridotto a Server Component puro: fetch `maintenance_items`, `completions`, `suppliers` in parallelo; delega rendering a `ManutenzioniClient`
- `src/components/MaintenanceCard.tsx` — prop `frequencyMonths?: number | null`; `isUrgent = status === 'scaduta' && priority !== 'N1'`; ramo N1 nel markup data
- `src/app/(app)/manutenzioni/page.tsx` — `frequency_months` aggiunto a query e tipo `ItemRow`; passato a `MaintenanceCard` nella sezione "Consigliate"
- `CLAUDE.md` — sezione §13 "Convenzioni di sviluppo" committata

### Letti (rilevanti per il contesto)
- `src/components/PriorityBadge.tsx` — confermato già corretto per N1 (sempre "Consigliata" blu, indipendente da status)
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — confermato che `ItemCard` è solo N3, N1 non ci arriva; `MaintenanceCard` usata per N3 upcoming con `priority="N3"` hardcoded

## Decisioni chiave
- **N1 mai confronta status/data**: anche item legacy con `status='scaduta'` nel DB (da prima del server action fix) devono mostrare solo "Consigliata · ogni X mesi" blu — la card non deve dipendere dalla coerenza del dato DB
- **Completions da tabella, non da `status='completata'`**: gli item completati tornano a `in_attesa` dopo il completamento; filtrare `maintenance_items.status === 'completata'` darebbe lista vuota; la sorgente corretta è la tabella `completions` con `residence_id`
- **Vista completamenti ≠ byCategory filtrata**: quando filtro='completate', si usa una mappa separata costruita da `yearCompletions + items.find(item_id)`, non il byCategory map (che conterrebbe 0 item completata)
- **Server Component + Client Component separati**: page.tsx resta RSC per i fetch; ManutenzioniClient è CC per l'interattività — pattern Next.js App Router corretto senza useEffect o fetch client-side
- **frequencyMonths opzionale con fallback '?'**: MaintenanceCard può ricevere null (altri call site come N3 non la passano); la stringa "Consigliata · ogni ? mesi" è il fallback accettabile

## Stato attuale
### Funziona
- Build verde — `npm run build` pulita su `33a9f58`
- N1 non mostra mai rosso né "Scaduta" in nessuno dei tre punti card (MaintenanceCard, ManutenzioniClient, /manutenzioni client)
- Card "Completate" mostra 7 per Residenza Cavaccio (anno 2026) — numero sensato per la demo
- Selettore anni derivato dinamicamente da completions presenti (2025: 5, 2026: 7)
- Toggle filtro: clic su card attiva filtra lista, riclic rimuove filtro
- Vista completamenti per categoria con data e eseguito_da

### Non funziona / da verificare
- **Test visivo su browser**: nessuna verifica a browser con account super_admin reale — la logica è corretta ma il rendering visivo va confermato
- **N1 con frequencyMonths null**: se un item N1 non ha `frequency_months` né sul template, mostra "Consigliata · ogni ? mesi" — da verificare se esiste nel seed Cavaccio
- **Item completati senza `residence_id`**: alcuni completion record potrebbero avere solo `unit_id` e `residence_id=null`; la query li esclude. Verificare con `SELECT COUNT(*) FROM completions WHERE residence_id IS NULL AND unit_id IN (SELECT id FROM units WHERE residence_id = '45196dac-...')`
- **Handoff precedenti non committati** in `docs/handoffs/` (3 file untracked)

## Prossimi passi
1. Aprire `/admin/residences/[id]/manutenzioni` come super_admin e verificare: card "Completate" verde con numero 7, clic filtra la lista, selettore anni 2025/2026 appare, lista completamenti per categoria corretta
2. Verificare che N1 appaia sempre in blu anche se il DB ha ancora `status='scaduta'` per qualche item legacy
3. Decidere se committare i file handoff in `docs/handoffs/` (3 untracked)
4. Verificare eventuali `completions` con `residence_id IS NULL` per Cavaccio e decidere se la query va estesa per includerle (via unit_id → residence_id join)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Build di verifica
npm run build

# Verifica completions con residence_id null per Cavaccio
# Eseguire in Supabase SQL Editor:
# SELECT COUNT(*) FROM completions WHERE residence_id IS NULL
# AND unit_id IN (SELECT id FROM units WHERE residence_id = '45196dac-bd81-4368-9452-1c066652e464');
```

## Domande aperte
- Le `completions` con solo `unit_id` (N2 completate dal cliente) devono comparire nel contatore "Completate" della card super_admin? Ora la query filtra solo per `residence_id` diretto — le N2 completate da cliente potrebbero avere `residence_id=null`
- Il filtro "Completate" nella lista deve mostrare anche le N2 (interventi di unità) o solo N3 (condominio)? Ora mostra tutte le completions della residenza per anno
- Il selettore anni deve comparire anche quando non ci sono completions per quell'anno (years array vuoto)? Ora è nascosto se `years.length === 0`

# Handoff — CK5: Fascicolo residenza, allegato cliccabile e "Registrato da" · 12/07/2026 17:42

## Sommario
CK5: tre punti poco chiari nel Fascicolo della residenza (schermo + PDF), risolti con FASE 0 diagnosi read-only su `completions` (fascicolo legale, mai scritto) prima di ogni modifica, poi due commit. La graffetta accanto a ogni riga diventa cliccabile e apre l'allegato reale (regge N allegati, non solo il caso attuale con al massimo 1). La colonna "Registrato da" non mostra più un trattino muto quando `performed_by_name` è NULL: fallback esplicito su un'etichetta di modalità ("Residente"/"Amministratore"/"Autocertificato"), derivato con un helper unico condiviso da schermo e PDF — mai dal profilo utente, perché mutabile e il fascicolo deve renderizzare identico per sempre. La terza domanda (colonna "Unità") era già chiara: confermata in FASE 0, nessuna modifica necessaria.

## Lavoro completato
- [x] FASE 0 (read-only, nessuna query di scrittura): letti `fascicolo/page.tsx`, `api/fascicolo-pdf/route.ts`, `FascicoloDocument.tsx`, `completeN2`/`completeN3` (le due action che scrivono su `completions`); eseguite query read-only reali su `completions` per contare NULL/valorizzato di `performed_by_name` per modalità effettiva (residente 8 tot./2 NULL, amministratore 7 tot./1 NULL, promemoria 1 tot./1 NULL) e verificare che nessuna riga avesse più di un allegato
- [x] Diagnosi riportata e approvata da Filippo prima di scrivere codice (icona non cliccabile per costruzione; NULL su `performed_by_name` viene da due path di scrittura diversi — `completeN2` non lo passa mai, `completeN3` lo passa solo se il campo form è compilato — non da una correlazione pulita con la modalità; colonna Unità già derivata correttamente da `unit_id`)
- [x] Commit A (`2fef1cc`): graffetta trasformata in link per allegato (`/api/download?bucket=attachments&path=...`, pattern già esistente in `ManutenzioniClient.tsx`); query estesa a `attachments(id, storage_path, file_name)`; audit `/impeccable` ha trovato un P2 (focus-visible ring mancante sul nuovo link, incoerente col resto del sistema) — fix incluso nello stesso commit su richiesta esplicita di Filippo (`git commit --amend`, non un commit separato)
- [x] Commit B (`59d3fca`): nuovo helper `src/lib/formatRegisteredBy.ts`, unica fonte di derivazione per "Registrato da" (nome se presente, altrimenti etichetta statica per modalità effettiva, mai fallback sul profilo); usato sia da `fascicolo/page.tsx` (schermo) sia da `api/fascicolo-pdf/route.ts` (che pre-calcola `registered_by` prima di passarlo a `FascicoloDocument.tsx`, coerente col pattern già in uso per `title`)
- [x] `tsc --noEmit` verde su entrambi i commit; audit `/impeccable` dopo ciascuno (18/20 su A prima del fix P2, 20/20 su B)

## File toccati
### Creati
- `src/lib/formatRegisteredBy.ts` — helper unico per "Registrato da": nome valorizzato → nome; altrimenti etichetta statica da `completion_mode` risolto (item → template, mai da `priority`); mai risoluzione da `profiles.full_name`

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` — query estesa (`attachments(id, storage_path, file_name)`, `maintenance_items(completion_mode, maintenance_templates(title, completion_mode))`); graffetta → link per allegato con focus ring di sistema; colonna "Registrato da" via `formatRegisteredBy`
- `src/app/api/fascicolo-pdf/route.ts` — stessa estensione di query lato PDF; `rows` ora pre-calcola `registered_by` con lo stesso helper invece di passare `performed_by_name` grezzo
- `src/lib/pdf/FascicoloDocument.tsx` — `FascicoloRow.performed_by_name` sostituito da `registered_by: string` (valore già risolto, nessun fallback duplicato nel componente PDF)

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(app)/manutenzioni/actions.ts` (`completeN2`) — conferma che il completamento residente/promemoria non scrive mai `performed_by_name`
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` (`completeN3`) — conferma che il completamento amministratore lo scrive solo se il campo form è compilato
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — pattern di download allegato già esistente (`/api/download?bucket=attachments&path=...`), riusato identico in Commit A
- `src/types/database.ts` — tipo `CompletionMode`, tipo `Completion` (conferma campi `performed_by_profile_id`/`performed_by_name` disponibili sulla riga)

## Decisioni chiave
- **Fallback su etichetta di modalità, mai su `profiles.full_name`**: vincolo esplicito di Filippo — il profilo è mutabile (nome può cambiare, account può essere riassegnato), il fascicolo deve renderizzare identico per sempre. La modalità effettiva (`item.completion_mode ?? template.completion_mode`) è comunque tecnicamente mutabile anch'essa (un template può cambiare modalità in futuro), ma è lo stesso pattern di risoluzione già accettato altrove nel codebase (`resolveCompletionMode`, `resolveAxes`) — non un precedente nuovo introdotto qui.
- **Copy proposto e non ridiscusso**: "Residente" / "Amministratore" / "Autocertificato" (promemoria — nessuna registrazione formale attesa su queste voci, coerente con l'invariante "la promemoria non è mai scaduta"). Scelta delegata esplicitamente da Filippo ("proponi tu il copy").
- **`registered_by` pre-calcolato in `route.ts` invece che nel componente PDF**: stesso pattern già in uso per `title` (`c.maintenance_items?.maintenance_templates?.title ?? '—'` calcolato prima di passare a `FascicoloDocument`), a differenza di `unit_label` che oggi passa grezzo e viene formattato dentro il documento — inconsistenza pre-esistente, non toccata (fuori scope, un concern per commit).
- **Fix P2 (focus ring) in amend, non commit separato**: richiesto esplicitamente da Filippo dopo l'audit — eccezione dichiarata alla regola di default "mai amend", coerente con CLAUDE.md ("a meno che l'utente non richieda esplicitamente un git amend").

## Stato attuale
### Funziona
- Fascicolo (schermo): graffetta cliccabile per ogni allegato presente, apre in una nuova richiesta verso `/api/download` (URL firmato 1h, solo lettura); "Registrato da" mostra sempre un valore leggibile, mai un trattino muto quando il nome manca
- Fascicolo (PDF): stessa semantica su "Registrato da" tramite l'helper condiviso; l'icona allegato nel PDF resta un'emoji statica (📎), non cliccabile — non richiesto per questo commit, i PDF sono documenti statici
- `tsc --noEmit` verde su entrambi i commit; audit `/impeccable` 18/20 → 20/20 dopo il fix P2

### Non funziona / da verificare
- Nessuna verifica in browser reale registrata in questa sessione (solo `tsc --noEmit` + audit statico) — da testare il click sull'allegato e il rendering delle tre etichette di fallback sulla Residenza Cavaccio prima di considerare CK5 chiuso end-to-end
- `CLAUDE.md` (modificato) e `docs/spec.md` (cancellato) restano non committati — quarta sessione consecutiva che lo segnala senza risoluzione
- File non tracciati ancora presenti e non spiegati: `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py`

## Prossimi passi
1. Verificare in browser (`npm run dev`) il click sulla graffetta (apertura allegato) e le tre etichette di fallback "Registrato da" sulla Residenza Cavaccio, sia a schermo sia nel PDF scaricato
2. Backlog dichiarato (non toccare finché non richiesto): `completeN2` non scrive mai `performed_by_name` — il fix strutturale è catturare il nome al momento del completamento residente, va insieme al lavoro più ampio sul flusso completamenti, post-demo
3. Backlog dichiarato (non toccare finché non richiesto): lentezza generazione PDF, insieme all'audit `activation_status` sul report — post-demo
4. Chiarire definitivamente `CLAUDE.md`/`docs/spec.md` non committati — quarta sessione che lo segnala

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Nessuna nuova rispetto a quelle già aperte nelle sessioni precedenti (vedi Prossimi passi 4)

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** — generalizzare l'esempio già presente su `PlanSummaryRow` (estrazione di riga condivisa) al caso di derivazione di valore condivisa schermo/PDF:

  > Quando lo stesso valore derivato appare sia a schermo sia nel PDF (stessa fonte dati, stessa logica di fallback), estrarre un helper puro condiviso (es. `formatRegisteredBy`) che calcola il valore finale già risolto, e far sì che il componente PDF riceva solo il risultato — mai ricalcolare il fallback due volte in punti diversi del codice.

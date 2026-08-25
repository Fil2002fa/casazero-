# Handoff — Manutenzioni: viste Attive/Escluse, Select design system, fix live-status · 11/07/2026 19:57

## Sommario
Sessione sulla pagina Manutenzioni del dettaglio residenza (`ManutenzioniClient.tsx`). I tipi esclusi dal piano erano una riga collassabile in fondo alla pagina, scoperta solo per caso: ora sono una vista dedicata (`Attive`/`Escluse`) raggiunta da un segmented control in testa. Nello stesso passaggio il filtro-unità nativo è stato sostituito col `Select` del design system, ed è stato corretto un bug per cui il filtro "Scadute" mostrava la zona attenzione ma nascondeva le righe corrispondenti nella lista sottostante perché confrontava lo `status` salvato in DB (non aggiornato dal cron in locale) invece del predicato live. Chiude con un fix di audit su contrasto e target size del segmented control. Nessun handoff era stato generato per questi 4 commit a fine sessione precedente: questo documento li ricostruisce da `git log`/`git show`, non da conversazione diretta.

## Lavoro completato
- [x] Commit `14c57db`: `showExcluded` (boolean, sezione collassabile in fondo) sostituito da `planView: 'attive' | 'escluse'` con segmented control in testa pagina; vista Escluse ha stato vuoto dedicato ("Nessun tipo escluso dal piano") invece di non renderizzare nulla; conteggio nel badge del tab derivato dallo stesso array `excludedTemplates` già in uso, nessun nuovo calcolo
- [x] Commit `782d025`: filtro-unità nativo (`<select>` con classi custom) sostituito da `Select` di `@/components/ui/Input`, già adottato altrove per lo stesso stile di campo
- [x] Commit `641a68f`: fix bug — con filtro "Scadute" attivo, la lista sotto la zona attenzione confrontava `i.status === status` (colonna DB, non aggiornata dal cron in locale) invece del predicato live; introdotto `matchesFilter = status === 'scaduta' ? isOverdueLive : isInCorso`, stesso helper già usato dalla zona attenzione — le due superfici ora leggono dalla stessa fonte di verità
- [x] Commit `b3379fe`: fix audit sul segmented control — wrapper passato da `bg-background` a `bg-surface` (e tab attivo da `bg-surface` a `bg-background`) così il contrasto del tab inattivo (`text-text-primary` fisso, non più `text-text-secondary` variabile) non è più al limite AA; aggiunto `aria-pressed` sui due bottoni; altezza allineata a `h-11 md:h-9` come `Input`/`Select`/`Button`

## File toccati
### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — unico file toccato in tutti e 4 i commit: segmented control Attive/Escluse, Select del design system per filtro-unità, fix predicato live per lista scadute/in corso, fix contrasto/aria-pressed/altezza sul segmented control

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/maintenance-status.ts` — helper condivisi `isOverdueLive`, `isInCorso` (fonte di verità già esistente, riusata per il fix del commit `641a68f` invece di introdurre un nuovo confronto)
- `src/components/ui/Input.tsx` — componente `Select` del design system, adottato al posto del `<select>` nativo

## Decisioni chiave
- **Vista dedicata invece di sezione collassabile**: i tipi esclusi erano scoperti "solo per caso" (sezione in fondo pagina, collassata di default). Alternativa scartata: tenere la sezione collassabile ma spostarla più in alto — scelto invece un segmented control in testa che rende esplicita l'esistenza della vista, coerente col pattern già usato in `residences/[id]/page.tsx` (Commit F della sessione precedente, stesso principio).
- **Predicato live invece di `status` salvato**: il bug (zona attenzione trova voci scadute ma la lista le nasconde) è la stessa classe di problema già documentata in CLAUDE.md — "in dev il cron non gira, quindi `status` in DB non riflette lo stato reale". Fix: entrambe le superfici (zona attenzione e lista) leggono ora `isOverdueLive`/`isInCorso` da `lib/maintenance-status.ts`, mai il campo salvato. Nessuna alternativa scartata esplicitamente registrata nei commit — il fix è diretto una volta identificata la causa.
- **`Select` del design system invece di `<select>` nativo con classi custom**: coerenza visiva con gli altri campi della pagina (`Input`, `Button`), nessuna logica di filtro cambiata.

## Stato attuale
### Funziona
- `npx tsc --noEmit` verde sullo stato attuale del branch (verificato in questa sessione di ricostruzione)
- Segmented control Attive/Escluse con conteggio nel badge, stato vuoto dedicato per "Escluse"
- Filtro-unità usa `Select` del design system
- Filtro "Scadute"/"In corso" nella lista ora coerente con la zona attenzione (stesso predicato live)

### Non funziona / da verificare
- Nessuna sessione `npm run dev` + verifica visiva registrata per questi 4 commit — solo `tsc --noEmit` e ispezione statica dei diff, sia nella sessione originale (non documentata) sia in questa ricostruzione
- `CLAUDE.md` (modificato) e `docs/spec.md` (cancellato) restano non committati nel working tree — stesso stato segnalato nell'handoff precedente (`HANDOFF_dettaglio_residenza_ck3_07_11_18_29.md`), ancora irrisolto, non toccato da questi 4 commit
- File non tracciati presenti nel working tree e non spiegati da questa sessione: `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py` — di provenienza ignota, da chiarire prima che si accumuli altro lavoro sopra

## Prossimi passi
1. Verificare in browser (`npm run dev`) il segmented control Attive/Escluse e il fix del filtro Scadute/In corso sulla Residenza Cavaccio (15 unità) — nessuna sessione dev è mai stata registrata per questi 4 commit
2. Chiarire lo stato di `CLAUDE.md`/`docs/spec.md` non committati (domanda aperta ereditata, ora accumulata su due sessioni)
3. Chiarire la provenienza di `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py` — committarli, spostarli fuori dal repo o ignorarli esplicitamente
4. Applicare lo stesso audit di contrasto/target-size/aria-pressed fatto sul segmented control di `manutenzioni` ad altri controlli a due stati del progetto, se esistono, per coerenza

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Questi 4 commit erano l'intero scope della sessione di ieri sera o restava lavoro non committato che è andato perso (nessun `git stash` trovato, ma vale la pena chiederlo a Filippo)?
- Il pattern segmented control introdotto qui (`bg-surface` su wrapper, `bg-background` su tab attivo, `h-11 md:h-9`, `aria-pressed`) va promosso a componente condiviso se ricompare altrove, o resta locale a questa pagina finché non si ripete una terza volta?

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** — aggiungere una riga esplicita sulla classe di bug "status salvato vs stato live", finora solo implicita nella nota sul cron in dev:

  > Non confrontare mai il campo `status` salvato in DB per decidere se una voce è scaduta/in corso: il cron non gira in locale e quel valore può essere disallineato. Usare sempre `isOverdueLive`/`isInCorso` (o l'helper live equivalente) da `lib/maintenance-status.ts` su ogni superficie — contatori, zone attenzione, filtri di lista — mai un confronto diretto con `status`. Bug reale: in `ManutenzioniClient.tsx` la zona attenzione usava il predicato live e trovava voci scadute, ma la lista sotto usava `status` e le nascondeva.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** — aggiungere il pattern del segmented control come alternativa preferita alla sezione collassabile per contenuti "secondari ma non nascosti":

  > Un contenuto secondario ma che l'utente deve poter scoprire (es. tipi esclusi dal piano) va esposto con un controllo esplicito in testa pagina (segmented control, tab), non con una sezione collassata di default in fondo pagina — la sezione collassata in fondo è stata "scoperta solo per caso" nel caso reale che ha motivato questo fix.

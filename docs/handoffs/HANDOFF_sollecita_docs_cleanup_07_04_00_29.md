# Handoff — Bottone Sollecita + pulizia doc v1 · 04/07/2026 00:29

## Sommario
Sessione con due concern separati: (1) aggiunto un bottone "Sollecita" nel drill-down
per-unità della vista manutenzioni admin, puramente visivo (nessun backend); (2)
diagnosi e rimozione di `SPECIFICA-CASAZERO-V1.md`, spec v1 orfana in root non
referenziata da nulla, doppione di `docs/spec.md` (che ha già banner DEPRECATO).

## Lavoro completato
- [x] Diagnosi FASE 0 del drill-down `UnitRow` in `ManutenzioniClient.tsx` (props disponibili, dove va il bottone, assenza di libreria toast nel progetto)
- [x] Implementato bottone "Sollecita" in `UnitRow`, condizionato a `effMode !== 'promemoria'` e `status` in `scaduta`/`in_corso`, con pattern "cambia testo per 2.5s" replicato da `SollecitaButton.tsx` (administrators)
- [x] Verificato `npx tsc --noEmit` pulito dopo la modifica
- [x] Diagnosi FASE 0 su CLAUDE.md + occorrenze N1/N2/N3 in tutto il repo (documentazione vs codice vivo)
- [x] Verificato che `SPECIFICA-CASAZERO-V1.md` non è referenziato da nessun file (`grep -rn` su tutto il repo, zero match)
- [x] Rimosso `SPECIFICA-CASAZERO-V1.md` e committato isolatamente (commit `dfa4705`)
- [ ] **Bottone "Sollecita" NON committato** — modifica ancora in working tree, nessun commit creato per questo concern

## File toccati
### Creati
- Nessuno

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — aggiunto bottone "Sollecita" in `UnitRow`: import `Bell, Clock` da lucide-react, stato locale `solicited` + `canSollecitare`, handler `handleSollecita` (setTimeout 2500ms), bottone renderizzato nella riga flex fornitore/data, visibile solo se modalità ≠ Promemoria e stato in `scaduta`/`in_corso`. **Non ancora committato.**

### Eliminati
- `SPECIFICA-CASAZERO-V1.md` (root) — spec v1 orfana, zero riferimenti nel repo, sostituita da `CLAUDE.md` + `docs/spec.md` (già deprecato con banner). Commit `dfa4705`.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/administrators/SollecitaButton.tsx` — precedente diretto del pattern "bottone che cambia testo/icona per 2.5s senza toast reale", riusato per il nuovo bottone
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ItemConfigForm.tsx` — verificato dove sta il toggle "Configura" (componente separato, non nello stesso markup di `UnitRow`)
- `docs/spec.md`, `docs/catalogo-manutenzioni-v2.md`, `CLAUDE.md` — per la diagnosi sulle occorrenze N1/N2/N3 e sui doppioni di documentazione

## Decisioni chiave
- **Nessun toast reale, pattern "bottone che cambia stato"**: il progetto non ha alcuna libreria toast/sonner. Invece di introdurne una, si è replicato il pattern già esistente in `SollecitaButton.tsx` (cambia icona/testo del bottone stesso per 2.5s). Alternativa scartata: nuovo componente toast condiviso — avrebbe introdotto una dipendenza/pattern nuovo per un solo bottone visivo senza backend.
- **Bottone Sollecita posizionato nella riga fornitore/data, non dentro `ItemConfigForm`**: `ItemConfigForm` è un componente separato che gestisce solo la configurazione persistita; il bottone Sollecita è stato tenuto nel markup di `UnitRow` per restare vicino alle informazioni di stato (data/fornitore) senza toccare `ItemConfigForm` (vincolo esplicito "un concern per commit").
- **`SPECIFICA-CASAZERO-V1.md` eliminato senza banner intermedio**: la doc non era referenziata da nulla (verificato con grep completo), quindi non serviva marcarla deprecata prima di rimuoverla — direttamente cancellata.

## Stato attuale
### Funziona
- Bottone Sollecita: verificato con `tsc --noEmit` (zero errori). Non ancora verificato visivamente nel browser (nessun `npm run dev` lanciato in questa sessione).
- Rimozione spec v1: build non ri-verificata dopo la rimozione (file .md, nessun impatto su build atteso), commit isolato creato correttamente.

### Non funziona / da verificare
- **Il bottone Sollecita è ancora un diff non committato** — a inizio prossima sessione va deciso se committarlo così com'è o rivederlo prima.
- Nessuna verifica manuale in browser del bottone Sollecita (stile, comportamento su mobile/PWA, sovrapposizione con badge/altri elementi nella riga flex quando ci sono più elementi contemporaneamente — fornitore + data + bottone su schermi stretti).

## Prossimi passi
1. Decidere se committare il bottone Sollecita così com'è (diff mostrato e approvato dall'utente in sessione, build verde) — manca solo il commit esplicito con messaggio dedicato (un concern = un commit, separato dalla pulizia doc già fatta).
2. Verificare visivamente in browser (`npm run dev`) il rendering del bottone Sollecita su una riga con fornitore + data assegnati contemporaneamente, per controllare wrapping/allineamento su viewport stretti (PWA residente non è coinvolta, ma la vista admin desktop va comunque controllata a schermo ridotto).
3. Valutare se estendere la stessa nomenclatura ufficiale (Modalità/Tipo) coerente al resto della vista anche per eventuali futuri stati del bottone (es. cooldown, disabilitazione dopo N solleciti) — al momento non richiesto, solo se emerge in una prossima sessione.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipo prima di un eventuale commit del bottone Sollecita
npx tsc --noEmit

# oppure build completa
npm run build
```

## Domande aperte
- Il bottone Sollecita in `UnitRow` va committato subito con messaggio dedicato, o Filippo vuole rivederlo/testarlo a schermo prima?
- La sessione ha confermato che gran parte del codice vivo (shell `(app)` residente, `admin/manutenzioni` non-per-residenza, cron giornaliero, PDF report, email) usa ancora N1/N2/N3 come logica primaria, non solo come colonna legacy di scrittura. Non è stata presa nessuna decisione su se/quando estendere la migrazione al modello a due assi oltre `ManutenzioniClient.tsx` — resta un'area scoperta per M5 o milestone successive.

## Leggi emerse (candidate per CLAUDE.md)
Una possibile legge di metodo è emersa ma è già coperta esplicitamente da CLAUDE.md
esistente ("Un concern per commit"): in questa sessione il concern "bottone Sollecita"
è rimasto scritto ma non committato quando la conversazione è passata al concern
successivo (pulizia doc v1), che invece è stato committato. Non è una violazione
della legge esistente (il commit non è mai stato richiesto esplicitamente per il
bottone), ma segnala un rischio pratico: modifiche approvate ma non committate
possono restare "in sospeso" tra un concern e l'altro nella stessa sessione.

- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** — "Dopo l'approvazione di una modifica (diff mostrato e confermato), se l'utente non chiede esplicitamente il commit prima di passare a un concern successivo, segnalarlo esplicitamente a fine turno (es. 'nota: la modifica X resta non committata') invece di lasciarla implicita nel diff di lavoro."

Nessun'altra legge nuova è emersa oltre a questa.

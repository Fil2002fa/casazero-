# Handoff — Dettaglio residenza: bottone e stat card non cliccabili · 12/07/2026 17:20

## Sommario
Tre fix mirati sulla coppia dettaglio residenza / pagina Manutenzioni, un commit ciascuno con FASE 0 diagnosi prima di ogni modifica. Il bottone "Vedi tutte le manutenzioni" annulla la logica condizionale e punta sempre a `/manutenzioni` senza filtro. Le stat card del dettaglio residenza tornano metriche pure, non cliccabili — inclusa "Scadute", corretta con un commit di follow-up dopo verifica manuale di Filippo che l'aveva trovata ancora cliccabile nel primo giro. Verificato in FASE 0 che il toggle "click su card filtro attiva la deseleziona" nella pagina Manutenzioni esisteva già: nessun commit necessario per quel punto.

## Lavoro completato
- [x] FASE 0: letto `page.tsx` (dettaglio residenza) e `ManutenzioniClient.tsx` prima di ogni modifica; confermato che `toggleFilter` (righe 135-137 di `ManutenzioniClient.tsx`) già implementa `prev === f ? null : f` su tutti e tre i bottoni-card, incluso "Scadute" — comportamento richiesto già presente, nessun commit per questo punto
- [x] Commit A (`eab7974`): `href` del bottone "Vedi tutte le manutenzioni" reso statico (`/admin/residences/${id}/manutenzioni`), rimossa la logica condizionale `overdueCount > 0 ? ...?filtro=scaduta : ...`
- [x] Commit B (`067233a`): `StatCard` reso condizionale (`href?: string`) — con `href` renderizza `<Link>` con hover/focus di sistema, senza renderizza `<div>` statico; applicato a "Unità"/"Voci attive"/"Completamenti" (senza href) mantenendo "Scadute" come link verso `?filtro=scaduta`
- [x] Fix di follow-up (`f3b691d`): Filippo ha verificato in browser che la card "Scadute" restava ancora cliccabile — rimosso anche il suo `href`; `StatCard` semplificata rimuovendo il ramo `Link` diventato morto (nessun caller lo usa più dopo la rimozione)
- [x] Build (`tsc --noEmit`) verde dopo ciascuno dei tre commit; diff mostrato e audit `/impeccable` (scoped al diff) prima di ogni commit successivo — nessun finding su nessuno dei tre

## File toccati
### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — `href` statico sul bottone "Vedi tutte le manutenzioni"; `StatCard` prima resa condizionale (Commit B) poi semplificata a solo `<div>` statico (fix di follow-up), tutte e 4 le stat card ora non cliccabili

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — verificato in FASE 0 il comportamento di `toggleFilter` sulle card-contatore Scadute/In corso/Completate (righe 135-137, 268-314): toggle già presente, non serviva codice nuovo

## Decisioni chiave
- **`StatCard` semplificata invece di lasciare `href` opzionale inutilizzato**: dopo il fix di follow-up nessun caller passa più `href` a `StatCard`. Alternativa scartata: lasciare la prop opzionale "per il futuro" — violava la regola del progetto contro astrazioni speculative, quindi il ramo `Link` è stato rimosso insieme all'ultimo caller che lo usava.
- **Nessun commit per il toggle (punto C della richiesta)**: la FASE 0 ha verificato che il comportamento richiesto ("cliccare la card filtro attiva la deseleziona") esisteva già in `ManutenzioniClient.tsx`, introdotto in una sessione precedente non ancora documentata in un handoff dedicato (vedi `HANDOFF_manutenzioni_viste_07_12_00_00.md`). Rispettato il vincolo esplicito "se sì, nessun commit".
- **Effetto collaterale accettato, non ricorretto**: dopo il fix di follow-up non resta più alcun link diretto da questa pagina a `/manutenzioni?filtro=scaduta` (il bottone in fondo punta sempre senza filtro dal Commit A, la card Scadute non è più cliccabile). Segnalato esplicitamente a Filippo come nota di scope; nessuna richiesta di reintrodurlo in questa sessione.

## Stato attuale
### Funziona
- Bottone "Vedi tutte le manutenzioni" sempre senza filtro
- Le 4 stat card ("Unità", "Voci attive", "Scadute", "Completamenti") sono ora uniformi: metriche statiche, nessun hover/focus/cursor-pointer
- Toggle deseleziona-su-click-attivo confermato preesistente sulle card-contatore di `ManutenzioniClient.tsx`
- `tsc --noEmit` verde su tutti e tre i commit

### Non funziona / da verificare
- Nessun link diretto rimasto verso la vista filtrata `?filtro=scaduta` da questa pagina (vedi Decisioni chiave) — accettabile per ora, da riconsiderare se emerge un bisogno reale di accesso rapido
- `CLAUDE.md` (modificato) e `docs/spec.md` (cancellato) restano non committati nel working tree — stesso stato segnalato in almeno due handoff precedenti (`HANDOFF_dettaglio_residenza_ck3_07_11_18_29.md`, `HANDOFF_manutenzioni_viste_07_12_00_00.md`), ancora irrisolto, accumula su tre sessioni consecutive
- File non tracciati ancora presenti e non spiegati: `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py`

## Prossimi passi
1. Chiarire definitivamente lo stato di `CLAUDE.md`/`docs/spec.md` non committati — è la terza sessione consecutiva che lo segnala senza risoluzione
2. Chiarire la provenienza di `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py` prima che si accumuli altro lavoro sopra
3. Se emerge un bisogno reale di accesso rapido alla vista "Scadute" filtrata dal dettaglio residenza, valutare dove reintrodurlo (non necessariamente sulla stat card)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Nessuna nuova rispetto a quelle già aperte nelle sessioni precedenti (vedi Prossimi passi 1-2)

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** — aggiungere una riga sulla verifica manuale come parte del ciclo, non solo su richiesta esplicita:

  > Dopo un commit che tocca affordance interattive (link, click, hover), la verifica visiva in browser da parte di Filippo fa parte del ciclo normale, non un passo opzionale: in questa sessione il primo giro di "stat card non cliccabili" (Commit B) ha lasciato la card "Scadute" ancora cliccabile per errore — scoperto solo dalla verifica manuale, non da `tsc --noEmit` né dall'ispezione statica del diff, entrambi ciechi a questo tipo di regressione comportamentale.

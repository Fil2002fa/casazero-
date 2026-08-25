# Handoff — Card zona-attenzione: conteggi live, click, terminologia · 04/07/2026 13:38

## Sommario
Sessione a tre concern sequenziali (un commit ciascuno) sulla pagina dettaglio
residenza super_admin e sulla vista Manutenzioni per-residenza. Partita da un bug
diagnosticato in FASE 0: la card residenza diceva "N3 in ritardo · 4 voci" mentre
la vista Manutenzioni della stessa residenza mostrava "Tutto in regola / 0 Scadute".
Le due superfici divergevano perché la card calcolava lo stato live da `next_due_date`
mentre la vista Manutenzioni leggeva ancora il campo `status` salvato (che solo il
cron avanza, e il cron non gira in locale). Chiuso il bug, poi rese cliccabili le
card zona-attenzione con filtro per modalità, poi rimossa la terminologia legacy
N2/N3 dal testo delle card.

## Lavoro completato
- [x] FASE 0 — diagnosi read-only del bug divergenza card residenza ↔ vista Manutenzioni, con prove (path+righe) e query SQL affiancate su Residenza Cavaccio
- [x] Commit `dd9a940` — conteggi vista Manutenzioni per-residenza migrati da `status` stored a stato live (`isOverdueLive`/`isInCorso`)
- [x] Commit `8221e87` — card zona-attenzione (Amministratore/Residente in ritardo) rese cliccabili con nuovo param URL `?modalita=` che filtra la sola zona-attenzione
- [x] Commit `733a560` — rimossa terminologia N2/N3 dal testo delle due card ("N3 in ritardo" → "Amministratore in ritardo", "N2 in ritardo" → "Residente in ritardo")
- [x] `npx tsc --noEmit` verde prima di ogni commit; diff mostrato e approvato prima di ogni commit

## File toccati
### Creati
- `docs/handoffs/HANDOFF_card_zona_attenzione_07_04_13_38.md` — questo documento

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — (commit `dd9a940`) aggiunto `is_active` alla select nested di `maintenance_templates`, necessario a `isCountable`. (commit `8221e87`) legge nuovo searchParam `?modalita=`, validato contro union `'amministratore'|'residente'` (altro/assente → null), passato come prop `initialModeFilter` a `ManutenzioniClient`.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — (commit `dd9a940`) `scaduteCount`/`inCorsoCount` ora da `isOverdueLive`/`isInCorso`; `allAttentionItems` filtra/ordina live; rendering per-item dentro `allAttentionItems.map` allineato allo stato live (accent bordo, `badgeStatus`, testo "in ritardo/in corso") per non lasciare card stale sotto un header corretto; badge "in ritardo" per-tipo nel corpo idem. (commit `8221e87`) nuovo tipo esportato `AttentionModeFilter`, prop `initialModeFilter`, `const modeFilter = initialModeFilter` (non useState: valore da URL non interattivo), filtro `modeFilter` iniettato dentro la definizione di `allAttentionItems` così header e lista leggono lo stesso array.
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — (commit `8221e87`) aggiunto `href` alle due `AttenzioneCard` rosse → `manutenzioni?filtro=scaduta&modalita=amministratore` e `...&modalita=residente`. (commit `733a560`) testo card: "N3 in ritardo" → "Amministratore in ritardo", "N2 in ritardo" → "Residente in ritardo"; sottotitoli e href invariati.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/maintenance-status.ts` — fonte di verità stato live; forniti `isOverdueLive`, `isInCorso`, `isCountable`, `resolveCompletionMode`, `overdueLive`. Confermato che la card residenza già lo usava e la vista Manutenzioni no.
- `docs/handoffs/HANDOFF_stato_scaduta_live_07_02_15_43.md` — ha stabilito lo stato live come unica definizione di "scaduta" e migrato molte superfici il 02/07, MA non `ManutenzioniClient.tsx` (rimasto scoperto, causa del bug di questa sessione).
- `docs/handoffs/HANDOFF_sollecita_docs_cleanup_07_04_00_29.md` — handoff precedente, per lo stato di partenza.
- `src/components/MaintenanceBadge.tsx` — per verificare che accetta `status` e come mappa gli stili (usato dal rendering per-item allineato).
- `src/types/database.ts` — union `ItemActivation = 'inclusa'|'esclusa'|'archiviata'` (3 valori, non 2) e `CompletionMode`.

## Decisioni chiave
- **Rendering per-item incluso nel commit del fix conteggi (`dd9a940`)**: non era tra i 4 punti inizialmente elencati, ma lasciarlo stale avrebbe prodotto un header "5 interventi richiedono attenzione" sopra 5 card tutte con bordo ambra / badge "in attesa" / testo "in corso" (verificato: i 5 item hanno `stored_status='in_attesa'`). Fix a metà scartato: stesso concern = "rendere coerente TUTTA la zona-attenzione", non solo l'header.
- **`UnitRow` (drill-down piano) lasciato stale di proposito**: stessa classe di bug (`item.status` raw per badge e testo Scaduta/Scade), ma superficie diversa (corpo del piano, non zona-attenzione). Fuori dal concern di oggi, segnalato come candidato commit futuro invece di assorbirlo.
- **`modalita` filtra SOLO la zona-attenzione, non il corpo**: decisione esplicita di Filippo. Il corpo/piano mantiene il comportamento attuale di `filtro=scaduta`. Niente scroll esplicito (no useRef/scrollIntoView): la zona-attenzione è già la prima sezione.
- **`const modeFilter` invece di `useState`**: nessun elemento UI modifica il filtro modalità dopo il mount (arriva solo dall'URL). Un `useState` con setter mai chiamato mentirebbe sul comportamento. `activeFilter` resta `useState` perché ha `toggleFilter` sulle card-contatore.
- **Gap `is_active` verificato a zero righe globali prima di introdurlo**: migrando a `isCountable` si aggiunge il filtro `template.is_active=true`, assente prima in `ManutenzioniClient`. Query globale `activation_status='inclusa' AND is_active=false` → 0 righe su tutte le residenze: nessun conteggio cambia oggi. Segnalato per evitare sorprese silenziose.
- **Terminologia N2/N3 in commit isolato (`733a560`)**: scope stretto a due sole stringhe in `[id]/page.tsx`. Ricerca `N[123]\s+in\s+ritardo` su tutto il repo → zero altre occorrenze UI da migrare.

## Stato attuale
### Funziona
- `npx tsc --noEmit` verde su tutti e 3 i commit. Working tree pulito.
- Bug conteggi risolto (verificato via SQL su Cavaccio, id `45196dac-bd81-4368-9452-1c066652e464`): la logica live dà 5 scadute (4 Amministratore + 1 unità Residente), coerente con la card residenza; la vecchia logica `status` stored dava 0/0/0. Dopo il fix le due superfici concordano.
- Le due card rosse ora sono `<Link>` (prima `<div>`) e portano alla vista Manutenzioni filtrata per modalità. Header e lista della zona-attenzione derivano dallo stesso array `allAttentionItems` già filtrato — nessuna fonte parallela.

### Non funziona / da verificare
- **Nessuna verifica visiva in browser** (`npm run dev` non lanciato in questa sessione): allineamento card, comportamento del click e del filtro `?modalita=` verificati solo via lettura codice + query SQL, non a schermo.
- **`UnitRow` resta stale** (per scelta): badge e testo "Scaduta/Scade" nel drill-down del piano leggono ancora `item.status` grezzo. Candidato commit futuro, non un errore introdotto oggi.
- **6 commit locali non pushati** (`master` è avanti di 6 su `origin/main`).

## Prossimi passi
1. Verificare a schermo (`npm run dev`, account `pippoloro02` super_admin) il click sulle due card di Residenza Cavaccio: deve aprire Manutenzioni con la zona-attenzione ristretta a sola modalità Amministratore (una card) o sola Residente (l'altra), header coerente col numero di card mostrate.
2. Valutare il commit futuro per `UnitRow`: migrare badge e testo "Scaduta/Scade" del drill-down piano a stato live (`isOverdueLive`), stessa logica del fix `dd9a940`.
3. Decidere se/quando pushare i 6 commit locali su remoto.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica tipo / build prima di ogni commit
npx tsc --noEmit
npm run build
```

## Domande aperte
- Il filtro `?modalita=` non ha un affordance visivo nella vista Manutenzioni (nessun chip "stai filtrando: Amministratore" né un modo per rimuoverlo dall'interno della pagina, se non modificando l'URL). Va bene così per la demo, o serve un indicatore/reset? Non richiesto oggi.
- `UnitRow` stale: confermare che il commit futuro sia la scelta giusta, o se conviene aspettare la migrazione più ampia al modello a due assi (area M5 citata dagli handoff precedenti).

## Leggi emerse (candidate per CLAUDE.md)

Due candidate. La prima è una specializzazione concreta di regole già esistenti
(stato live + helper condivisi) applicata alla classe di bug header↔lista; la
seconda è una convenzione su useState vs const emersa in modo netto in sessione.

- **Sezione Regole di codice ricorrenti (bug class note)**: "Header/contatore e lista che descrivono lo stesso insieme devono leggere lo STESSO array già filtrato, non ricalcolare il conteggio da una fonte più ampia. Quando si aggiunge un filtro (es. per modalità) a una sezione con intestazione contata, iniettarlo DENTRO la definizione dell'array sorgente, non in un derivato separato — altrimenti l'header conta un insieme e la lista ne mostra un altro (bug contatore↔lista)."

- **Sezione Regole di codice ricorrenti (bug class note)**: "Migrare una superficie a stato live (`isOverdueLive`/`isInCorso`) significa migrare ANCHE il rendering per-item di quella sezione (accent, badge status, testo scaduta/in corso), non solo i contatori. Un header live sopra card che leggono ancora `item.status` grezzo è un fix a metà che introduce un'incoerenza visiva nuova. Se una superficie adiacente (es. drill-down piano) resta sullo stato stored per scope, segnalarlo esplicitamente come debito, non assorbirlo in silenzio."

- **Sezione Regole di codice ricorrenti**: "Un valore che arriva solo dall'URL/props e non viene mai modificato dalla UI si tiene come `const` derivata dalla prop, non come `useState` con setter mai chiamato. Lo stato React si usa solo quando qualcosa in pagina lo cambia (es. `activeFilter` ha `toggleFilter`; `modeFilter` no). Il `const` dice la verità sul comportamento non interattivo."

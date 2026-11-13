# Handoff — Rifiniture residente (lista, dettaglio, home) · 11/11/2026 19:20

## Sommario
Sessione di integrazione: le modifiche non committate prodotte da Codex nel worktree `C:\progetti\casazero-codex` (branch `codex/profilo-residente`) sono state committate un commit per task, portate con cherry-pick su `main`, verificate (tsc + `npm run verify`), controllate a schermo da Filippo con l'account residente e pushate su `origin/main` (`cb987c3..34957ac`). Nessuna logica nuova scritta da Claude: solo integrazione e verifica.

## Lavoro completato
- [x] Task A: lista manutenzioni residente, gruppi Scadute / Più avanti, unità prima delle parti comuni, obbligo come testo — `8902842`
- [x] Task B: dettaglio manutenzione, timeline numerata dalla più recente, stato vuoto, regola della frequenza — `ac143c6`
- [x] Task C: Home residente, card riepilogo (voce più urgente, conteggio altre, prossima scadenza, attesa consegna) — `34957ac`
- [x] tsc --noEmit = 0, `npm run verify` = 0 (lint pulito)
- [x] Verifica a schermo di Filippo (account `lorofilippo2002`)
- [x] Push su origin/main (ha incluso anche i commit locali precedenti non ancora pubblicati)

## File toccati
### Creati
- `src/app/(app)/HomeRiepilogo.tsx` — card riepilogo in cima alla Home residente

### Modificati
- `src/app/(app)/manutenzioni/ManutenzioniList.tsx` — raggruppamento Scadute/Più avanti, ordinamento unità prima, `OBLIGATION_LABELS` come testo, riepilogo nascosto se l'unità attende la consegna
- `src/app/(app)/manutenzioni/[id]/page.tsx` — timeline storico numerata, stato vuoto, frequenza con `pluralize`
- `src/app/(app)/page.tsx` — monta `HomeRiepilogo`

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/` — stato precedente (CLAUDE.md lo richiede a inizio sessione)

## Decisioni chiave
- **Gruppi limitati a Scadute / Più avanti**: la lista residente non dispone di date né di voci completate, quindi "Entro 30 giorni" e "Fatte di recente" sono omessi e il riepilogo dichiara il conteggio a 30 giorni non disponibile. Alternativa scartata: estendere la query (fuori scope di Codex, file ammessi limitati).
- **Nessuna etichetta di ritardo nello storico**: manca la scadenza storica per intervento; non inventata.
- **Un commit per task, raggruppati per file**; messaggi via `git commit -F`, senza here-string.
- **Dev avviato con `npm run dev` semplice**: lo script passa già la porta, `-- -p 3000` fa fallire con "Invalid project directory".

## Stato attuale
### Funziona
- tsc e verify puliti; schermate verificate da Filippo; `main` allineato a `origin/main`.

### Non funziona / da verificare
- Resa a 320 px: Codex non l'ha verificata; Filippo ha confermato la verifica a schermo ma non è stato specificato se a 320 px.
- Gruppi "Entro 30 giorni" / "Fatte di recente" assenti per limite dati (vedi decisioni).
- Nel working tree compare `supabase/migrations/056_catalogo_testi_residente_dati.sql` NON tracciato e non creato in questa sessione (origine da chiarire; probabilmente lavoro parallelo). Anche `docs/handoffs/catalogo-testi-35.json.json` (doppia estensione) e altri 3 handoff non tracciati.
- Il dev server sulla porta 3000 è stato lasciato acceso.

## Prossimi passi
1. Chiarire l'origine di `supabase/migrations/056_catalogo_testi_residente_dati.sql` e, se è da applicare, seguire il flusso migrazioni di CLAUDE.md (SQL mostrato, riga in `docs/migrations.log`).
2. Valutare di estendere la query della lista manutenzioni residente con `next_due_date` e ultimo completamento per abilitare i gruppi "Entro 30 giorni" e "Fatte di recente" e le etichette di ritardo nello storico.
3. Controllo visivo a 320 px di lista, dettaglio e Home.
4. Rinominare o rimuovere `docs/handoffs/catalogo-testi-35.json.json` e decidere se committare gli handoff non tracciati.

## Comandi da rilanciare
```bash
npm run dev
npm run verify
```

## Domande aperte
- La migrazione 056 e il catalogo testi sono legati a questo filone residente? Chi li ha prodotti?
- Si vuole davvero estendere la query lista per le date, o il riepilogo "non disponibile" è accettabile per il pilota?

## Leggi emerse (candidate per CLAUDE.md)
- **Comandi**: `npm run dev` accetta già la porta nello script: non aggiungere `-- -p 3000` (fallisce con "Invalid project directory"). Avviare sempre con `npm run dev` semplice.

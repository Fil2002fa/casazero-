# Handoff — Gate di verifica e comando /fase0 · 07/09/2026 18:33

## Sommario
Sessione dedicata a formalizzare il workflow di verifica del progetto: uno script
`npm run verify` che accorpa tsc, lint e stato git in un comando, un comando slash
`/fase0` che impone la modalità diagnosi read-only con delega a subagent, e
l'allineamento di `CLAUDE.md` a questi due strumenti. I tre pezzi sono stati
proposti, mostrati in diff e committati uno alla volta su richiesta esplicita,
poi pushati su `origin/main`.

## Lavoro completato
- [x] Creato `scripts/verify.ps1`: gate unico che esegue `tsc --noEmit`, `next lint`,
      `git status --short`, `git diff --staged --stat` in sequenza, con exit code
      combinato — committato in `cb52d6f`
- [x] Aggiunta la riga `"verify"` in `package.json` che lancia lo script via
      PowerShell — stesso commit `cb52d6f`
- [x] Creato il comando slash `.claude/commands/fase0.md`: modalità read-only,
      delega dell'esplorazione a subagent con formato di ritorno
      FINDING/EVIDENCE/CONFIDENCE, default su ampiezza (pagina intera) e struttura
      (niente JSX duplicato tra rami di ruolo) — committato in `e6d75a0`
- [x] Aggiornato `CLAUDE.md`: riformattazione in markdown con headers/bold, più tre
      aggiunte sostanziali (apertura sessione con `git log`/`git status`, gate
      unico `npm run verify` al posto del vecchio riferimento a `npm run build`,
      nota su SQL incollato per intero nella risposta oltre che su file) —
      committato in `4b77c06`
- [x] Push dei tre commit su `origin/main` (`b5db32c..4b77c06`)

## File toccati
### Creati
- `scripts/verify.ps1` — script PowerShell del gate di verifica pre-commit
- `.claude/commands/fase0.md` — comando slash per la diagnosi read-only

### Modificati
- `package.json` — aggiunta la riga `"verify": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1"`
- `CLAUDE.md` — riformattato e aggiornato con le tre regole sopra descritte
  (già applicato dall'utente in working tree, l'agente si è limitato a mostrare
  il diff e committare su richiesta esplicita)

### Letti (solo quelli rilevanti per capire il contesto)
- `package.json` — per verificare gli script esistenti prima di proporre `verify`
- `CLAUDE.md` — per mostrare il diff prima del commit isolato

## Decisioni chiave
- **Script `verify.ps1` dedicato invece di un one-liner con `&&`**: un one-liner
  si sarebbe fermato al primo fallimento (`tsc` o `lint`), impedendo di stampare
  comunque `git status`/`git diff --staged` come richiesto. Uno script PowerShell
  separato accumula gli exit code dei due gate e stampa sempre i quattro blocchi,
  uscendo con l'exit code combinato solo alla fine.
- **`CLAUDE.md` modificato dall'utente, non dall'agente**: la regola di progetto
  vieta all'agente di modificare `CLAUDE.md` direttamente. La modifica era già
  presente in working tree quando l'agente l'ha rilevata; l'agente ha solo
  mostrato il diff e committato su istruzione esplicita, senza generarne il
  contenuto.
- **Tre commit separati invece di uno unico**: un concern per commit
  (script+package.json, comando `/fase0`, `CLAUDE.md`) anche se i tre cambiamenti
  appartengono allo stesso arco di lavoro, per rispettare la regola "un concern
  per commit".

## Stato attuale
### Funziona
- `npm run verify` eseguito con successo: `tsc --noEmit` pulito, `next lint` con
  un solo warning preesistente non bloccante (`req` non usato in
  `src/app/api/reconcile-documents/route.ts:12`), stampa `git status --short` e
  `git diff --staged --stat`, exit code `0`.
- I tre commit (`cb52d6f`, `e6d75a0`, `4b77c06`) sono pushati su `origin/main`,
  branch `main` allineato.

### Non funziona / da verificare
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` risulta modificato e non
  committato nella working tree, ma **non fa parte del lavoro di questa
  sessione**: è un refactor del componente `Stat` da props `color`/`bg` a un
  sistema `tone`-based con stato attivo in bianco su sfondo pieno. Non è stato
  toccato né valutato qui — da decidere se completarlo, committarlo così com'è,
  o scartarlo.
- Tre handoff precedenti risultano ancora non tracciati in `docs/handoffs/`
  (`HANDOFF_accesso_admin_residenza_09_07_13_08.md`,
  `HANDOFF_admin_residenza_09_07_10_04.md`,
  `HANDOFF_pagina_attivita_admin_09_07_14_37.md`): da valutare se versionarli.
- Il warning ESLint su `req` non usato in `reconcile-documents/route.ts` non è
  mai stato affrontato: resta silenzioso perché `next lint` non fallisce su
  semplici warning.

## Prossimi passi
1. Decidere sul refactor non committato di `manutenzioni/page.tsx` (componente
   `Stat` tone-based): completarlo, committarlo isolato, oppure `git checkout --`
   per scartarlo — richiede una FASE 0 dedicata perché non è stato diagnosticato
   in questa sessione.
2. Valutare se versionare i tre handoff non tracciati in `docs/handoffs/` o
   lasciarli locali.
3. Eventualmente ripulire il warning ESLint su `req` non usato in
   `src/app/api/reconcile-documents/route.ts:12`, se il parametro è davvero
   superfluo nella firma della route.
4. Validare `/fase0` lanciandolo su un task reale, per verificare che il
   subagent rispetti il formato FINDING/EVIDENCE/CONFIDENCE richiesto.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Gate di verifica pre-commit (tsc + lint + git status + git diff --staged)
npm run verify

# oppure production
npm run build && npm start
```

## Domande aperte
- Il refactor di `manutenzioni/page.tsx` era già in corso prima di questa
  sessione: non è chiaro se sia completo o a metà. Serve una FASE 0 diagnosi
  dedicata prima di deciderne il destino.
- I default dichiarati nel comando `/fase0` (pagina intera, niente JSX
  duplicato tra rami di ruolo) sono per ora solo dentro il comando stesso: vanno
  promossi a regola generale in `CLAUDE.md`, o restano vincolati all'uso
  esplicito di `/fase0`?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  ```
  - **Ruoli e UI condivisa:** quando si espone una pagina o sezione esistente a un
    nuovo ruolo, esporre la pagina INTERA per default, mai una variante ridotta a
    porta singola, salvo richiesta esplicita di scope ridotto. Mai JSX duplicato
    tra rami di ruolo: estrarre un componente condiviso e ramificare solo sulle
    prop che differiscono davvero.
  ```
  Motivazione: friction ricorrente nelle sessioni precedenti (proposta di pagina
  admin residenza troppo stretta, poi JSX duplicato tra rami di ruolo da
  rifattorizzare) — regola già scritta come default nel comando `/fase0`, ma non
  ancora presente come legge generale valida anche fuori da quel comando.

- **Sezione CLAUDE.md di destinazione: Metodo di lavoro (non negoziabile)**:
  ```
  - **Diagnosi read-only con subagent:** quando la diagnosi FASE 0 viene delegata
    a un subagent, il formato di ritorno per ogni riscontro è obbligatorio:
    `FINDING: una riga` / `EVIDENCE: path:riga + estratto di codice reale` /
    `CONFIDENCE: alta | media | bassa`. Il report torna nella sessione
    principale; il rumore dell'esplorazione resta nel contesto del subagent.
  ```
  Motivazione: il formato esiste già nel comando `/fase0`, ma non è ancora
  codificato come metodo generale — utile anche quando la diagnosi non passa dal
  comando slash esplicito.

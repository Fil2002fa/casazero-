# Handoff — Disattiva connettori claude.ai · 01/11/2026 19:14

## Sommario
Sessione breve, senza modifiche al codice. Dopo l'apertura sessione (git pulito, ultimo handoff letto) Filippo ha chiesto, con FASE 0 e STOP, di spegnere i connettori che arrivano dal suo account claude.ai solo per il progetto CasaZero. Ho trovato il metodo ufficiale, fatto il backup di `~/.claude.json` e verificato il risultato dopo il toggle fatto da Filippo in `/mcp`.

## Lavoro completato
- [x] Apertura sessione: `git log --oneline -10` e `git status --short` (albero pulito, `main` allineato a `origin/main`, ultimo commit `4a2e43f`).
- [x] Letto l'ultimo handoff `docs/handoffs/HANDOFF_blocco_accesso_10_30_11_57.md`.
- [x] FASE 0 sul metodo per disattivare i connettori claude.ai per progetto (documentazione `code.claude.com/docs/en/mcp`, parte letta: primi 100.000 caratteri su 154.700).
- [x] Backup `~/.claude.json` in `~/.claude.json.bak-casazero-20261101` (85.776 byte, `cmp` identico all'originale al momento della copia).
- [x] Filippo ha disattivato in `/mcp` quattro connettori; verifica in sola lettura eseguita sul file.
- [ ] Non letta la parte finale della pagina della documentazione (da `offset: 100000`), che contiene la sezione "Disable claude.ai connectors".

## File toccati
### Creati
- `~/.claude.json.bak-casazero-20261101` — backup (fuori dal repo) dello stato di `~/.claude.json` prima del toggle.
- `docs/handoffs/HANDOFF_disattiva_connettori_11_01_19_14.md` — questo file.

### Modificati
- `~/.claude.json` (fuori dal repo, scritto da Claude Code tramite `/mcp`, non da me) — nella voce `projects["C:/progetti/casazero"]` è comparsa `disabledMcpServers`.

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_blocco_accesso_10_30_11_57.md` — stato del progetto a inizio sessione.
- `.gitignore:22-23` — `.claude/settings.local.json` è già ignorato.
- `~/.claude/settings.json` — nessuna chiave MCP; Supabase è un plugin abilitato (`supabase@claude-plugins-official`).
- `~/.claude.json` — voci di progetto e chiavi top-level relative a MCP.

## Decisioni chiave
- **Scope del toggle**: usato il toggle per progetto di `/mcp`, che scrive `disabledMcpServers` nella voce del progetto in `~/.claude.json`. Scartata la scrittura in `.claude/settings.local.json` (non è il meccanismo documentato per i connettori claude.ai, e il file non esiste).
- **Modifica fatta da Filippo, non da me**: `/mcp` è interattivo; io ho fatto solo backup e verifica read-only.
- **Fuori scope**: `chrome-devtools` (in `mcpServers` globale) e Supabase (plugin) non sono stati toccati.

## Stato attuale
### Funziona
- `disabledMcpServers` compare solo in `C:/progetti/casazero`, con: `claude-artifacts`, `claude.ai Google Drive`, `claude.ai Google Calendar`, `claude.ai Claude Docs`.
- Nessuna chiave globale `disabledMcpServers`; `C:/progetti/CasaZeroVault` non toccato.
- Rispetto al backup l'unica differenza è `projects["C:/progetti/casazero"].disabledMcpServers`; nessuna chiave top-level cambiata; `mcpServers` globale contiene ancora solo `chrome-devtools`.

### Non funziona / da verificare
- Non è provato dalla documentazione letta che il toggle non tocchi l'account claude.ai né gli altri progetti: lo conferma solo il confronto sul file locale (`claudeAiMcpEverConnected` invariata).
- Gli strumenti dei connettori disattivati risultano scollegati nella sessione corrente; l'effetto su una sessione nuova nel progetto non è stato osservato.
- Il backup copre lo stato di `~/.claude.json` al momento della copia, non modifiche successive.

## Prossimi passi
1. Aprire una nuova sessione in `C:\progetti\casazero` e controllare con `/mcp` che i quattro connettori restino disattivati e che `chrome-devtools` e Supabase siano ancora attivi.
2. Opzionale: leggere il resto della pagina `code.claude.com/docs/en/mcp` (`offset: 100000`) per chiudere il punto sull'account claude.ai e sull'eventuale variabile d'ambiente.
3. Riprendere il lavoro del handoff precedente: `HANDOFF_blocco_accesso_10_30_11_57.md`, sezione "Prossimi passi" (in particolare FASE 0 sulle etichette della PWA residente e la verifica in produzione del login). Verificare con `git log origin/main` se `199fe41` risulta già pushato: nel log recente non compare.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# verifica read-only dei connettori disattivati
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.env.USERPROFILE+'/.claude.json','utf8'));console.log(j.projects['C:/progetti/casazero'].disabledMcpServers)"

# annullare: riabilitare in /mcp, oppure con Claude Code chiuso
cp ~/.claude.json.bak-casazero-20261101 ~/.claude.json
```

## Domande aperte
- Il toggle vale anche per le sessioni future nel progetto, o va riconfermato dopo aggiornamenti di Claude Code? Non verificato.
- `199fe41` (middleware `?code=`) è stato pushato? Non verificato in questa sessione.

## Leggi emerse (candidate per CLAUDE.md)
Nessuna.

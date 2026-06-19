Analizza la conversazione corrente e lo stato del repository, poi scrivi un documento di handoff strutturato.

## Istruzioni

1. **Determina topic e timestamp**
   - Ricava un TOPIC breve (2-3 parole, snake_case) dal lavoro svolto in questa sessione
   - Usa la data/ora attuale per MM_GG e HH_MM
   - Nome file: `docs/handoffs/HANDOFF_[TOPIC]_[MM_GG]_[HH_MM].md`

2. **Raccogli informazioni** eseguendo questi comandi in parallelo:
   - `git status` — file modificati/non tracciati
   - `git diff --stat HEAD` — diff rispetto all'ultimo commit
   - `git log --oneline -10` — ultimi commit
   - `git branch` — branch corrente

3. **Scrivi il documento** con questa struttura esatta (non omettere nessuna sezione):

```markdown
# Handoff — [TOPIC leggibile] · [GG/MM/AAAA HH:MM]

## Sommario
[2-3 righe che descrivono cosa è stato fatto e perché, senza elenchi]

## Lavoro completato
- [x] item completato
- [x] altro item completato
- [ ] item iniziato ma non finito (se presente)

## File toccati
### Creati
- `path/al/file.ts` — [cosa fa]

### Modificati
- `path/al/file.ts` — [cosa è cambiato e perché]

### Letti (solo quelli rilevanti per capire il contesto)
- `path/al/file.ts` — [perché è stato letto]

## Decisioni chiave
- **[Titolo decisione]**: [spiegazione della scelta e alternativa scartata]

## Stato attuale
### Funziona
- [cosa è verificato funzionante]

### Non funziona / da verificare
- [cosa è rotto o non testato]

## Prossimi passi
1. [passo specifico e azionabile — non generico]
2. [passo successivo]

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- [domanda tecnica o decisione ancora da prendere]
```

4. **Vincoli**
   - NON toccare mai `CLAUDE.md`
   - NON sovrascrivere handoff esistenti — crea sempre un nuovo file con timestamp fresco
   - Il documento deve essere leggibile da zero da un nuovo agente senza accesso alla conversazione
   - Includi ID e nomi reali (file path assoluti no, relativi dal root del progetto sì)
   - Riferimento progetto: CasaZero, Next.js 15 App Router + Supabase, milestone attiva M5

5. **Al termine** conferma il path del file scritto e mostra le prime 10 righe come anteprima.

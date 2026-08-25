# Handoff — Fuga item archiviati (activation_status) · 06/07/2026 17:45

## Sommario
Diagnosi FASE 0 read-only su un sospetto di regressione: le viste piano attivo e il cron notifiche erano stati scritti prima che esistesse la colonna `activation_status` e non la filtravano, lasciando trapelare item `archiviata` (esclusi dal piano ma non dal fascicolo). Confermati e corretti con prove empiriche tre leak distinti in due commit separati: query del cron, e le tre query delle viste piano attivo (residente-lista, home-banner, admin-condominiale).

## Lavoro completato
- [x] FASE 0 — diagnosi read-only: schema, 6 superfici (residente x3, admin, cron, fascicolo-inverso), verdetto documentato con conteggi SQL scope-dichiarati
- [x] Fix cron (`83810fb`): `.eq('activation_status', 'inclusa')` aggiunto alla query di selezione in `src/app/api/cron/daily/route.ts`
- [x] Verifica empirica cron: con fix 0/6 archiviati a Cavaccio, senza fix (controprova) 11/17 — combacia col numero FASE 0
- [x] Fix viste piano attivo (`78ec600`): stesso pattern in tre file (residente-lista, home-banner-urgenti, admin-condominiale)
- [x] Verifica empirica delle tre viste: residente-lista 0/18, admin 0/10, home-banner 0/0 (già silente in FASE 0, ora chiuso anche per il futuro)
- [ ] PDF report (`src/app/api/report/route.ts:162`) — nominato come possibile quarta superficie in FASE 0, MAI analizzato: concern separato, post-demo

## File toccati
### Creati
- Nessuno

### Modificati
- `src/app/api/cron/daily/route.ts` — aggiunto `.eq('activation_status', 'inclusa')` dopo `.lte('next_due_date', today)` (riga ~51): il cron non processa più item archiviati (niente avanzamento N1/promemoria, niente marcatura scaduta, niente email)
- `src/app/(app)/manutenzioni/page.tsx` — aggiunto `.eq('activation_status', 'inclusa')` dopo `.neq('status', 'completata')` (riga ~49): la lista piano attivo del residente non mostra più archiviati
- `src/app/(app)/page.tsx` — aggiunto `.eq('activation_status', 'inclusa')` dopo `.in('status', ['scaduta', 'in_corso'])` (riga ~71): banner urgenti/"Da completare" in home non mostra più archiviati
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — aggiunto `.eq('activation_status', 'inclusa')` dopo `.in('status', ['scaduta', 'in_corso', 'in_attesa'])` (riga ~41): vista condominiale admin non mostra più archiviati

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/maintenance-status.ts` — fonte di verità `isCountable`/`resolveCompletionMode`: qui il filtro su `activation_status` era già corretto in JS (usato da home "Prossima manutenzione" e fascicolo/conformità), a differenza dei tre punti fixati che filtravano solo in JS assente o non filtravano affatto
- `src/app/(app)/fascicolo/page.tsx` — verificato che il check inverso dell'invariante regge: la query completions non filtra su `activation_status` (corretto, i completamenti di archiviati restano nel fascicolo)
- `supabase/migrations/011_catalogo_v2_columns.sql` — origine di `activation_status`/`item_activation` (enum: inclusa/esclusa/archiviata, default inclusa)

## Decisioni chiave
- **Due commit separati invece di uno**: cron e viste piano attivo sono stati due commit distinti anche se stesso identico difetto, perché toccano superfici diverse (job schedulato vs UI) e Filippo l'ha esplicitamente richiesto come "un concern per commit". Alternativa scartata: un commit unico "fix leak activation_status ovunque" — più veloce ma viola il metodo di lavoro del progetto.
- **Filtro in query, non in JS**: per le tre viste piano attivo è stato usato `.eq('activation_status', 'inclusa')` lato query invece di riusare l'helper `isCountable` (che pure esiste ed è corretto altrove). Richiesto esplicitamente da Filippo per questi tre punti specifici — il pattern `isCountable` resta il default dove già presente (home "prossima manutenzione", fascicolo), ma qui serve il filtro a monte nella query stessa.
- **PDF report escluso dallo scope**: identificato come possibile quarta superficie di leak ma deliberatamente non analizzato né toccato, per tenere il fix scope-contenuto e rimandarlo a un commit futuro post-demo.

## Stato attuale
### Funziona
- Cron: verificato via query SQL equivalente a quella del codice (0/6 archiviati con fix, 11/17 senza — la query non può essere eseguita realmente in locale, il cron non gira in dev)
- Lista piano attivo residente: 0/18 archiviati nel perimetro dell'utente di test (unità propria + condominio)
- Vista admin condominiale: 0/10 archiviati a Residenza Cavaccio
- Home banner urgenti: 0/0 (era già silenzioso oggi, ora strutturalmente chiuso anche per item futuri marcati `scaduta` dal cron)
- `tsc --noEmit` verde su entrambi i commit
- Fascicolo (check inverso): confermato che i 3 completamenti di item archiviati a Cavaccio restano visibili — invariante "Piano ≠ fascicolo" rispettato

### Non funziona / da verificare
- PDF report (`src/app/api/report/route.ts`) — non ancora verificato se filtra `activation_status`; possibile quarto leak, mai investigato in questa sessione

## Prossimi passi
1. FASE 0 dedicata al PDF report (`src/app/api/report/route.ts:162`): stessa metodologia read-only, verificare se la query batch del PDF filtra `activation_status` e se il conteggio "scadute" nel PDF include archiviati
2. Se confermato leak nel PDF, fix mirato con lo stesso pattern `.eq('activation_status', 'inclusa')`, commit separato
3. Considerare se serve un test di regressione automatico (es. seed con item archiviato + assert che non compaia in nessuna delle 4 superfici) per evitare che il prossimo nuovo campo enum riproduca la stessa classe di bug

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- Il PDF report va investigato prima o dopo la demo pilota? Impatta la priorità del prossimo passo 1.
- Serve un test automatico anti-regressione per `activation_status`, o il pattern manuale FASE 0 + verifica empirica per ogni nuova superficie è sufficiente per la fase attuale del progetto (M5, pre-produzione)?

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione "Regole di codice ricorrenti"**: `activation_status = 'inclusa'` è un filtro obbligatorio su ogni nuova query di `maintenance_items` che alimenta una vista "piano attivo" o un job che scrive stato/notifiche (cron). Bug class nota: query scritte prima dell'introduzione della colonna non la ereditano automaticamente — verificare esplicitamente ad ogni nuova superficie che legge `maintenance_items` per uno scopo diverso dal fascicolo/storico.
- **Sezione "Invarianti"**: Il fascicolo (tabella `completions` e le sue query) NON deve mai filtrare su `activation_status` — è l'unico punto dove un item archiviato deve restare visibile. Ogni fix per il leak di `activation_status` va verificato per NON aver toccato le query su `completions`.

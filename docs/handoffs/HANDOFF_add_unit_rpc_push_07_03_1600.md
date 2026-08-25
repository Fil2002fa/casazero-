# Handoff — Aggiunta unità atomica via RPC + primo push · 03/07/2026 16:00

## Sommario
Chiuso il pattern "scrittura atomica via RPC" anche per l'aggiunta di una singola
unità a una residenza esistente: nuova funzione `czero_add_unit_with_items`
(migrazione 013), applicata a mano e verificata con smoke test positivo e
negativo, poi `createUnit` rifattorizzato per chiamarla al posto dei due insert
PostgREST separati che aveva prima. In coda alla sessione, configurato per la
prima volta il remote `origin` (repo GitHub in precedenza assente) e pushati
tutti i 12 commit locali accumulati dalle sessioni precedenti su `origin/main`.

## Lavoro completato
- [x] Diagnosi FASE 0 (approvata in sessione precedente, non ripetuta qui) e anteprima SQL di `czero_add_unit_with_items` con `SELECT ... INTO STRICT` sulla residenza, `COALESCE(delivery_date, CURRENT_DATE)`, filtro `is_active = true`, aritmetica date via `interval` Postgres, status `'scaduta'` se la scadenza calcolata è nel passato
- [x] SQL applicato a mano da Filippo nel SQL Editor Supabase; smoke test positivo: `n_items=8` (= template attivi `scope='unit'`), `n_incoerenti_attesi_0=0`; smoke test negativo: errore esplicito `Residenza ... inesistente` prima di qualsiasi scrittura, zero residui
- [x] Migrazione `013_add_unit_atomic.sql` scritta e versionata, fedele all'SQL già applicato, con esito degli smoke test documentato nei commenti
- [x] `createUnit` in `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` rifattorizzato: 2 insert PostgREST separati (unità poi item, con rollover `setMonth()` JS e nessun filtro `is_active`) → una chiamata `admin.rpc('czero_add_unit_with_items', ...)`; firma e valore di ritorno `{ error?, id? }` invariati, `UnitsManager` non toccato
- [x] `npx tsc --noEmit` verde, diff mostrato, commit (`242b104`)
- [x] Configurato remote `origin` (`https://github.com/Fil2002fa/casazero-.git`) — non esisteva su questa macchina
- [x] Push `master` → `origin/main` (branch remoto creato ex novo): 12 commit portati da locale a remoto, `master` ora traccia `origin/main`

## File toccati
### Creati
- `supabase/migrations/013_add_unit_atomic.sql` — DDL della funzione `czero_add_unit_with_items(p_residence_id, p_label, p_floor)`: crea l'unità e i `maintenance_items` per i template attivi `scope='unit'` in un'unica transazione; `SECURITY DEFINER`, `search_path=public`, `REVOKE`/`GRANT` solo `service_role`; commento di testa con limite noto (override data per categoria del wizard non persistiti — un'unità aggiunta a posteriori usa sempre `delivery_date` come base) e blocchi di smoke test (positivo con `ROLLBACK`, negativo separato) con gli esiti reali osservati

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — `createUnit` (righe 24-66 prima del refactor) sostituito con una singola chiamata RPC; gestione errore `rpcErr?.message ?? 'Errore creazione unità'` nello stesso stile della 012 (`czero_create_residence_with_units`)

### Letti (solo quelli rilevanti per capire il contesto)
- `supabase/migrations/012_create_residence_atomic.sql` — modello di stile per la 013: struttura RPC, commenti "differenze consapevoli", pattern smoke test `BEGIN...ROLLBACK`
- `src/app/(dashboard)/admin/residences/new/actions.ts` (righe 31-59) — verifica dello stile di chiamata RPC esistente (`admin.rpc(...)`, gestione `rpcErr`) da replicare in `createUnit`
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — verifica che l'interfaccia di `createUnit` non venisse toccata dal refactor

## Decisioni chiave
- **`SELECT ... INTO STRICT` invece di affidarsi alla FK violation**: per una residenza inesistente la funzione fallisce con messaggio esplicito (`Residenza % inesistente`) prima di qualsiasi INSERT, non con l'errore generico di violazione di foreign key che si otterrebbe lasciando fallire l'INSERT su `units`. Decisione di Filippo, applicata identicamente alla 012 dove non serviva (la residenza lì viene creata, non letta).
- **Limite noto sulle date per categoria accettato esplicitamente**: un'unità aggiunta dopo la creazione della residenza non eredita gli override `p_category_dates` del wizard (non sono persistiti da nessuna parte); usa sempre `delivery_date` della residenza come base per tutte le categorie. Commentato nella migrazione invece di essere risolto — fuori scope per questa sessione.
- **RPC anche per operazioni a singola unità**: nonostante l'operazione tocchi meno righe della creazione residenza, si è comunque scelta un'unica transazione atomica (unità + item) invece di due chiamate PostgREST sequenziali, per coerenza con l'invariante "Piano ≠ fascicolo" e per evitare unità orfane senza piano in caso di errore a metà.
- **Push su `origin/main` invece che `origin/master`**: il branch locale si chiama `master` ma il remote GitHub creato da Filippo usa `main` come default; push esplicito con refspec `master:main` invece di rinominare il branch locale o forzare `main` lato locale.

## Stato attuale
### Funziona
- Migrazione 013 applicata e verificata sul DB reale (smoke test positivo e negativo, entrambi con l'esito atteso)
- `npx tsc --noEmit` verde sul commit `242b104`
- Push completato: `git status` conferma `master` allineato a `origin/main`, working tree pulito, nessun commit in sospeso
- Remote `origin` ora configurato in modo permanente su questa macchina

### Non funziona / da verificare
- **Nessun test UI reale del refactor `createUnit`**: verificato solo a livello DB (smoke test SQL) e typecheck: aggiungere un'unità da `UnitsManager` in un browser (account `pippoloro02`, super_admin) non è stato ancora fatto in questa sessione
- **Comportamento visivo diverso per residenze con `delivery_date` passata**: con la RPC, un'unità aggiunta oggi a una residenza con `delivery_date` nel passato nascerà con voci a frequenza breve già `'scaduta'` (rosso), mentre prima nascevano sempre `'in_attesa'`. È il comportamento corretto secondo l'invariante, ma è un cambio visibile rispetto a prima — da verificare che non sorprenda in demo con Furlan
- **Migrazione delle viste residente `(app)` ai due assi v2** (Modalità/Tipo): diagnosi FASE 0 già approvata in sessione precedente (vedi handoff `HANDOFF_perf_riordino_repo_07_03_16_11.md`), piano a 4 commit (componenti condivisi → home → lista → dettaglio) non ancora avviato in questa sessione — resta il prossimo blocco di lavoro più grande
- **`n2n3Total`/`n2n3Ok` in `ReportData`**: rinomina con nomi neutri rispetto alla colonna legacy, rimasta aperta da più handoff, non toccata

## Prossimi passi
1. Aprire `UnitsManager` nel browser (account `pippoloro02`) e aggiungere un'unità a una residenza esistente per conferma visiva del refactor RPC (nessun test UI fatto finora)
2. Avviare il piano a 4 commit per la migrazione delle viste residente `(app)` ai due assi v2, partendo dai componenti condivisi (`MaintenanceCard`, `PriorityBadge`) — blast radius noto anche su `(dashboard)/admin/manutenzioni`
3. Decidere con Filippo se il cambio di comportamento su residenze con `delivery_date` passata (unità nuove che nascono già scadute) va comunicato o mitigato prima della prossima demo
4. Rifare il test case fotovoltaico (aperto da handoff 02/07, mai chiuso)
5. Rinominare `n2n3Total`/`n2n3Ok` in `ReportData` (cleanup minore, aperto da più sessioni)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica prima di ogni commit
npx tsc --noEmit
npm run build
```

## Domande aperte
- Il repo GitHub `Fil2002fa/casazero-` era già esistente e vuoto, o è stato creato al volo in questa sessione? Non verificato — il push ha semplicemente creato il branch `main` da zero sul remote.
- Serve configurare un deploy Vercel collegato a questo remote ora che esiste, o il deploy avviene con un flusso separato (`vercel` CLI)?
- Priorità tra "migrazione viste residente ai due assi v2" (passo 2) e "test case fotovoltaico" (passo 4): resta la stessa domanda aperta dell'handoff precedente, non ancora risposta.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: "Ogni RPC `SECURITY DEFINER` che legge una riga-genitore per id prima di scrivere (es. residenza prima di aggiungere un'unità) deve usare `SELECT ... INTO STRICT` con `EXCEPTION WHEN NO_DATA_FOUND` e messaggio esplicito, non affidarsi alla violazione di foreign key sull'INSERT successivo: l'errore deve essere leggibile e arrivare prima di qualsiasi scrittura."

- **Sezione Regole di codice ricorrenti**: "Operazioni che scrivono su più tabelle collegate da un invariante (es. unità + relativi `maintenance_items`, mai unità senza piano) vanno sempre in un'unica RPC `SECURITY DEFINER` transazionale, anche quando il volume di righe è piccolo (es. una singola unità) — non due chiamate PostgREST sequenziali dal client, che lasciano stato parziale in caso di errore a metà."

**Nota**: nessuna delle due tocca la nomenclatura N1/N2/N3 (già abolita e rispettata in questa sessione) né lo stato del debito tecnico dual-write, che restano invariati.

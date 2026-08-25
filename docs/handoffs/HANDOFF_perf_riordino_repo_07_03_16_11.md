# Handoff — Performance (app) e riordino repository · 03/07/2026 16:11

## Sommario
Chiuso il piano performance (commit 2 e 3): memoizzazione con React `cache()`
sulla catena auth condivisa tra layout/page/whitelabel, e parallelizzazione
delle query nelle tre route residente `(app)` con unificazione count+card in
un'unica query. In parallelo, riordinato il repository: catalogo v2 rinominato
e committato, handoff e settings locali esclusi da git, migrazioni 010 e 011
(retroattiva colonne catalogo v2) versionate, `docs/spec.md` archiviato come
riferimento storico. Verificato sul DB che la SQL di riconciliazione catalogo
v2 (handoff 02/07) è stata applicata: 19 template attivi, template fotovoltaico
presente. **Il push è rimasto bloccato: il repo non ha alcun remote configurato.**

## Lavoro completato
- [x] Verifica DB: SQL riconciliazione catalogo v2 applicata (`is_active` true=19/false=10; sort 11/15 con colonna legacy `priority='N1'` allineata a Modalità Promemoria; template "Manutenzione impianto fotovoltaico" presente, sort 29)
- [x] Rinomina `docs/catalogo-manutenzioni-casazero-v2.md` → `docs/catalogo-manutenzioni-v2.md` e commit (`e6e934e`) — allinea il link citato da CLAUDE.md
- [x] `.gitignore`: esclusi `docs/handoffs/` e `.claude/settings.local.json` (quest'ultimo anche rimosso dall'indice con `git rm --cached`, resta su disco) (`e78212c`)
- [x] Versionata migrazione `010_builders_contact.sql`, colonne già presenti sul DB (`8060424`)
- [x] Commit 2 piano performance: React `cache()` su `getUser`/`getProfile` in `src/lib/auth.ts` + `getWhitelabelBrand` che riusa il profilo cache-ato (`aa4e098`)
- [x] Committato template handoff con sezione "Leggi emerse" (`f252b12`)
- [x] Eliminata cartella `scripts/` (script di verifica throwaway; era untracked → nessun commit possibile)
- [x] Committato `docs/spec.md` creato a mano da Filippo (`cb419f9`)
- [x] Scritta e committata migrazione retroattiva `011_catalogo_v2_columns.sql`, idempotente, fedele allo schema DB verificato (`6d087db`)
- [x] Commit 3 piano performance: parallelizzazione query route `(app)` (`5262f85`)
- [ ] **Push su origin fallito: nessun remote configurato nel repo** (tutti gli 8 commit sono solo locali)

## File toccati
### Creati
- `supabase/migrations/011_catalogo_v2_columns.sql` — DDL retroattivo colonne catalogo v2: tre enum (`completion_mode`, `obligation_type`, `item_activation`) creati in blocchi `DO $$ ... EXCEPTION WHEN duplicate_object` e colonne con `ADD COLUMN IF NOT EXISTS` su `maintenance_templates` (completion_mode, obligation_type, is_active, is_conditional) e `maintenance_items` (completion_mode, obligation_type, activation_status). Il DB era già allineato: il file serve solo a versionare.
- `docs/catalogo-manutenzioni-v2.md` — il catalogo (19 voci) prima untracked col nome vecchio; ora tracciato col nome citato da CLAUDE.md.
- `docs/handoffs/HANDOFF_perf_riordino_repo_07_03_16_11.md` — questo documento (non versionato: la cartella è ora in .gitignore).

### Modificati
- `src/lib/auth.ts` — `getUser` (nuovo export) e `getProfile` avvolti in React `cache()`: una sola `auth.getUser()` e una sola query `profiles` per request, condivise da layout, page e `requireProfile`/`requireRole`. La modifica era già nel working tree a inizio sessione (provenienza: commit 2 del piano performance, incompleto); firma e dati ritornati invariati.
- `src/lib/whitelabel.ts` — `getWhitelabelBrand` non rifà più `auth.getUser()` né la query `profiles`: riusa `getProfile()` cache-ato e legge `builder_id` dal profilo. Query `builders` invariata, `DEFAULT` negli stessi casi di prima.
- `src/app/(app)/layout.tsx` — `getProfile` e `getWhitelabelBrand` in `Promise.all`; il redirect per ruolo resta subito dopo. Le due chiamate concorrenti condividono la parte auth grazie alla `cache()` (che memoizza la promise in volo).
- `src/app/(app)/page.tsx` — le due query urgenti (count `head:true` + card `limit(3)`) unificate in UNA query con `{ count: 'exact' }` (il count esatto ignora il limit): banner e card derivano dallo stesso filtro per costruzione. Query unica in `Promise.all` con la membership.
- `src/app/(app)/manutenzioni/page.tsx` — membership e query `maintenance_items` in `Promise.all` (la query items è scopata da RLS, non dipende dalla membership). Early return "nessuna unità" invariato; in quel caso raro la query items parte comunque e il risultato si scarta (costo accettato). Nessuna logica di rendering toccata.
- `.gitignore` — aggiunti `docs/handoffs/` e `.claude/settings.local.json`.
- `.claude/commands/handoff.md` — sezione "Leggi emerse" + vincolo nomenclatura ufficiale (modifica preesistente nel working tree, solo committata).

### Eliminati
- `scripts/` (con `screenshots/`, `verify-freq.mjs`, `verify-freq-scroll.mjs`) — script di verifica usa-e-getta del 25-26/06; era untracked, quindi eliminata senza commit.
- `.claude/settings.local.json` dall'indice git (il file resta su disco e funziona).

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_stato_scaduta_live_07_02_15_43.md` — stato di partenza della sessione e lista dei punti aperti.
- `src/types/database.ts` — verifica che `Profile` esponga `builder_id` (serve al refactor di whitelabel).

## Decisioni chiave
- **Handoff NON versionati**: decisione di Filippo — sono documenti di sessione, vanno in `.gitignore` (`docs/handoffs/`). Alternativa scartata: committarli come documentazione.
- **Count e card dalla STESSA query**: invece di parallelizzare le due query urgenti della home, sono state fuse: `{ count: 'exact' }` sulla query delle card con `limit(3)` restituisce sia le 3 righe sia il conteggio totale. Elimina per costruzione la possibilità che banner e lista divergano. Alternativa scartata: due query parallele con filtro duplicato.
- **Migrazione 011 idempotente**: enum creati via `DO $$ ... EXCEPTION WHEN duplicate_object` (Postgres non supporta `CREATE TYPE IF NOT EXISTS`) e colonne con `IF NOT EXISTS`, così eseguirla sul DB già allineato non fa nulla. Tipi, default e NOT NULL verificati riga per riga contro `information_schema.columns` e `pg_enum` prima di scrivere il file.
- **`getWhitelabelBrand` riusa `getProfile`, non viene cache-ata a sua volta**: la parte costosa e duplicata era auth+profilo; la query `builders` gira una volta per request nel layout. Wrapping aggiuntivo non richiesto dalle istruzioni e non necessario.
- **`scripts/` eliminata senza commit**: era untracked (mai entrata in git), quindi il commit previsto dal piano non era materialmente possibile.

## Stato attuale
### Funziona
- `npx tsc --noEmit` verde su ogni commit (8 commit di sessione, da `e6e934e` a `5262f85`); working tree completamente pulito.
- DB verificato: 19 template attivi / 10 inattivi; enum e colonne corrispondono esattamente alla migrazione 011.
- Un hook PostToolUse esegue `npx tsc --noEmit` dopo ogni Edit: ha intercettato in sessione una ridichiarazione di `rawItems` (query vecchia non rimossa), corretta subito.

### Non funziona / da verificare
- **Push impossibile**: `git remote -v` è vuoto, niente `.vercel/project.json`, `gh` CLI non installata. Tutti i commit sono solo locali. Serve l'URL del remoto da Filippo.
- **Nessun test UI reale delle route `(app)` parallelizzate**: verificato solo il typecheck, non il comportamento nel browser (dev server in finestra separata). Le query sono identiche a prima nei filtri, ma home e manutenzioni residente andrebbero aperte una volta per conferma visiva.
- **Le viste residente leggono ancora `status` salvato e la colonna legacy `priority`**: la home `(app)` conta urgenti con `status IN ('scaduta','in_corso')` e `manutenzioni` raggruppa via `effPriority` — non usano l'helper `src/lib/maintenance-status.ts`. Debito noto (dual-write attivo per questo), NON introdotto in questa sessione: le query sono rimaste semanticamente identiche.

## Prossimi passi
1. Configurare il remote e pushare: `git remote add origin <url>` + `git push -u origin master` (8 commit in attesa). Serve l'URL da Filippo.
2. Aprire nel browser home residente e `/manutenzioni` (account `lorofilippo2002`) per conferma visiva delle route parallelizzate.
3. Migrare le viste residente `(app)` dall'asse legacy `priority`/`status` salvato all'helper `maintenance-status.ts` e ai due assi v2 — è il prerequisito per rimuovere il dual-write (invariante CLAUDE.md).
4. Rifare il test case fotovoltaico ora che il template esiste nel DB (punto rimasto dall'handoff 02/07).
5. (Cleanup rimasto dal 02/07) Rinominare `n2n3Total`/`n2n3Ok` in `ReportData` con nomi neutri rispetto alla colonna legacy.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica prima di ogni commit
npx tsc --noEmit
npm run build
```

## Domande aperte
- Qual è l'URL del repository remoto? Il repo locale non ha mai avuto un remote configurato su questa macchina — oppure il deploy Vercel avviene con un flusso diverso (CLI `vercel` senza git remote)?
- La migrazione delle viste residente ai due assi (prossimo passo 3) è il "commit 4" naturale dopo il piano performance, o ha priorità il test case fotovoltaico?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice ricorrenti**: "Quando un contatore e una lista mostrano lo stesso insieme di righe (es. banner urgenti + card), usare UNA sola query Supabase con `{ count: 'exact' }` e `limit` (il count esatto ignora il limit), mai due query con filtro duplicato: due query sono due definizioni dello stesso numero e prima o poi divergono."

- **Sezione Regole di codice ricorrenti**: "Auth e profilo si leggono SOLO via `getUser`/`getProfile` di `src/lib/auth.ts` (memoizzate con React `cache()` per request). Mai rifare `supabase.auth.getUser()` o la query `profiles` inline in layout, page o helper (es. whitelabel): duplica round-trip che la cache ha già pagato. Le funzioni `cache()` memoizzano la promise in volo, quindi sono sicure anche dentro `Promise.all`."

- **Sezione Metodo di lavoro**: "Prima di pianificare un commit su file o cartelle esistenti, verificare se sono tracciati (`git status`): una cartella untracked si elimina senza commit, un file untracked non si `git mv` (si usa `mv` + `git add`)."

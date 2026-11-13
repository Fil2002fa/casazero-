# Export per il nuovo repo "Gestionale Stefano" — inventario di CasaZero

Data: 11/11/2026 · Sola lettura: nessun file toccato tranne questo, nessun commit, nessun segreto riportato (solo NOMI di variabili).
Repo analizzato: `C:\progetti\casazero` (HEAD `56df58a`, branch `main`). Utente Windows: `C:\Users\raffa`.

## Come leggere questo documento

- **Repo** = il file sta dentro la cartella del progetto e viene salvato con git (lo vede chiunque cloni il repo).
- **Utente** = il file sta nella cartella personale `C:\Users\raffa\.claude` e vale per tutti i tuoi progetti, non viaggia con git.
- Azioni: **copiare** (così com'è) · **adattare** (copiare e cambiare nomi/regole) · **riscrivere** (usare solo l'idea) · **lasciare** (non portare).

Glossario minimo (ogni termine nuovo, una riga):
- **Comando personalizzato (slash command)**: un file `.md` che, scrivendo `/nome` in Claude Code, incolla delle istruzioni già pronte.
- **Subagent**: un "assistente" secondario con compiti stretti, definito in un file `.md`; lavora a parte e riporta solo il risultato.
- **Skill**: un pacchetto di istruzioni che Claude carica quando serve (es. design dell'interfaccia).
- **Plugin**: un'estensione installata a livello utente che aggiunge strumenti (es. collegamento a Supabase).
- **Hook**: una regola automatica ("ogni volta che succede X, esegui Y") configurata nei settings; la esegue il programma, non Claude.
- **Migrazione**: un file SQL numerato che modifica la struttura del database; si applica una sola volta, in ordine.
- **RLS (Row Level Security)**: regole del database che decidono quali righe può vedere/scrivere ogni utente.
- **Tenant**: un cliente-azienda isolato dagli altri (in CasaZero: un costruttore). "Multi-tenant" = più clienti sullo stesso sistema, senza vedersi tra loro.
- **Storage / bucket**: l'archivio file di Supabase; un bucket è una "cartella" con le sue regole di accesso.
- **Handoff**: documento di fine sessione che permette alla sessione successiva di ripartire senza ricordare nulla.
- **CI**: controllo automatico su GitHub che rilancia i test a ogni push.

---

## 1. Comandi personalizzati

| Voce | Cos'è | Percorso | Livello | Azione |
|---|---|---|---|---|
| `/fase0` | Diagnosi in sola lettura: indaga, riporta con prove (file:riga), poi si ferma e aspetta approvazione. 33 righe, generico. | `C:\progetti\casazero\.claude\commands\fase0.md` | **Repo** (tracciato da git) | **Copiare** così com'è. Unico dettaglio: cita `esploratore`, quindi copia anche quel file (voce 3). |
| `/handoff` | Scrive il documento di fine sessione in `docs/handoffs/` con struttura fissa. | `C:\progetti\casazero\.claude\commands\handoff.md` | **Repo** | **Adattare**: struttura da tenere; da cambiare "CasaZero", "Filippo", "milestone attiva M5", la riga su N1/N2/N3 e la nomenclatura Residente/Amministratore/Promemoria. |

Non esiste nessuna cartella `C:\Users\raffa\.claude\commands` (verificato): **tutti i comandi stanno nel repo**, nessuno a livello utente.

## 2. Hook, impostazioni, skill, plugin

| Voce | Cos'è | Percorso | Livello | Azione |
|---|---|---|---|---|
| Impostazioni utente | Modello `sonnet`, effort per modello (Sonnet 5.5 = medium, Opus 5 = xhigh), skill spente (docx, pptx, xlsx, chrome-browser, ecc.), canale aggiornamenti, tema scuro. | `C:\Users\raffa\.claude\settings.json` | **Utente** | **Lasciare**: valgono già per ogni progetto, non serve copiarli. |
| Impostazioni repo | **Non esistono**: né `.claude\settings.json` né `settings.local.json` (verificato). Quindi **nessun hook configurato** né a livello repo né utente. | — | — | Niente da copiare. Il `.gitignore` prevede già `.claude/settings.local.json` (impostazioni per macchina). |
| Plugin Supabase | Strumenti per leggere/scrivere il database dal chat (versione 0.1.16, attivo). | `C:\Users\raffa\.claude\plugins\installed_plugins.json` | **Utente** | **Lasciare**: è già attivo per tutti i progetti. Va solo ricollegato al nuovo progetto Supabase (nuovo project ref). |
| Plugin Vercel | Installato (0.50.0) ma **disattivato** in `enabledPlugins`. | idem | **Utente** | **Lasciare** (attivalo a mano se ti serve). |
| Chrome DevTools | **Non trovato** tra plugin installati né in un `.mcp.json` (non esiste nel repo). Un handoff dice "chrome-devtools spento". Probabile collegamento configurato altrove/da riattivare. | da verificare (vedi A, passo 6) | — | **Da verificare** prima di dare per scontato che esista. |
| Skill `impeccable` | Pacchetto grande (~100 file, script inclusi) per critica e rifinitura dell'interfaccia (UI). | `C:\progetti\casazero\.claude\skills\impeccable\` | **Repo** | **Lasciare** all'inizio (peso alto, legato al design di CasaZero). Se il gestionale avrà UI curata, valuta di reinstallarlo dopo, da zero. |
| Skill sincronizzate | Skill dell'account (pdf, docx, ecc.), gestite dal programma. | `C:\Users\raffa\.claude\skills\synced\` | **Utente** | **Lasciare**. |
| Memoria di Claude | Appunti persistenti del progetto (4 file + indice `MEMORY.md`). | `C:\Users\raffa\.claude\projects\C--progetti-casazero\memory\` | **Utente** (per-progetto) | **Riscrivere** nel nuovo repo solo le 2 regole di metodo generali (vedi sezione Lezioni). Le altre 2 sono su inviti e unità non consegnate: **lasciare**. |

## 3. Subagent

| Voce | Cos'è | Percorso | Livello | Azione |
|---|---|---|---|---|
| `esploratore` | Cerca file/usi nel codice in sola lettura (strumenti: Read, Grep, Glob; modello economico `haiku`). Risponde sempre in formato FINDING / EVIDENCE / CONFIDENCE. 20 righe, generico. | `C:\progetti\casazero\.claude\agents\esploratore.md` | **Repo** | **Copiare** così com'è. Nel testo di `/fase0` resta il riferimento "RLS, migrazioni, storage" che va bene anche lì. |

## 4. CLAUDE.md — struttura e regole che funzionano

Percorso: `C:\progetti\casazero\CLAUDE.md` · Livello **Repo** · Azione: **adattare** (tenere lo scheletro, riscrivere il contenuto di dominio).

Struttura (nell'ordine):
1. **Premessa di 5 righe**: cos'è il prodotto, cliente pilota, "questo file = LEGGI, lo STATO è nell'ultimo handoff, leggilo a inizio sessione". → **Tenere il principio**, cambiare il contenuto.
2. **Stack**: tecnologie e ambiente (Windows/PowerShell, "il cron non gira in locale"). → **Adattare**.
3. **Nomenclatura ufficiale**: un solo vocabolario per i concetti, con le parole vietate. → **Riscrivere**: Stefano avrà il suo vocabolario; tieni l'abitudine di fissarlo subito. (Tutto ciò su N1/N2/N3, dual-write, `priority` è CasaZero-only: **lasciare**.)
4. **Invarianti (mai violare)**: poche regole non negoziabili, ognuna con il perché. → **Riscrivere** le tue; **lasciare** quelle su `completions`, promemoria, fascicolo, `attachments`, `admin_assignments`. Resta valido il *modello*: "dato legale = immutabile, nessun ruolo può cancellarlo".
5. **Metodo di lavoro (8 punti)**: → **Copiare quasi tutto**:
   1. Apri la sessione con `git log --oneline -10` + `git status --short`; se handoff e git divergono, vince git.
   2. FASE 0 read-only con STOP prima di ogni modifica.
   3. Prove, non descrizioni (file:riga o output di query).
   4. Discrepanze di conteggio: confronta prima l'ambito delle query, poi le definizioni.
   5. Un concern per commit; segnalare lo scope creep.
   6. Gate unico `npm run verify` con output completo prima di ogni commit.
   7. Messaggi di commit senza here-string PowerShell con virgolette doppie (riga singola o `git commit -F file`).
   8. Fine sessione: `/handoff`; CLAUDE.md non si modifica mai direttamente, le leggi nuove si PROPONGONO nell'handoff.
6. **Migrazioni e database**: cosa Claude può fare da solo (additive) e cosa richiede conferma (DROP, RLS più permissive), log in `docs/migrations.log`, verifiche PASS/FAIL. → **Adattare** (cambia nome del responsabile e project ref).
7. **Regole di codice ricorrenti**: bug già incontrati trasformati in regola (helper condivisi, mai annidare bottoni, qualificare `objects.name` nelle policy storage, mai scartare `error` di Supabase). → **Copiare le 3 generiche**: errori Supabase, policy storage, helper unico per valori ripetuti; **lasciare** le altre.
8. **Comandi** (dev/build/verify) e **account di test**. → **Riscrivere**.
9. **Wiki Knowledge Base**: puntatore a una cartella esterna `C:\progetti\CasaZeroVault\wiki` con ordine di lettura `hot.md` → `index.md` → sub-index. → **Riscrivere** solo se farai un vault anche per Stefano; altrimenti **lasciare**.

## 5. `npm run verify` — cosa fa, passo per passo

- Dichiarato in `C:\progetti\casazero\package.json` riga 13: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1`. (Repo. **Copiare**.)
- Lo script `C:\progetti\casazero\scripts\verify.ps1` (18 righe) fa, in ordine:
  1. `npx tsc --noEmit` — controlla i tipi TypeScript senza produrre file (errore = exit 1).
  2. `npm run lint --silent` — controlla lo stile del codice (errore = exit 1).
  3. `git status --short` — mostra solo cosa è cambiato (informativo).
  4. `git diff --staged --stat` — riassunto di ciò che sta per essere committato (informativo).
  Esce con codice 1 se tsc o lint falliscono, altrimenti 0. **Non lancia i test** `verify:*` né la build: quelli si chiamano a mano.
- Accanto ci sono **36 script `verify:*`** (`scripts/verify-*.mjs`, elencati in package.json righe 14-49), uno per regola/funzione pura, lanciati con `node --experimental-strip-types`. → **Riscrivere**: sono specifici di CasaZero. Tieni solo l'idea (un piccolo test per ogni funzione di logica pura) e il file `scripts/ts-resolve-hooks.mjs` se vorrai lo stesso trucco di esecuzione.
- **CI su GitHub**: `C:\progetti\casazero\.github\workflows\verify.yml` (Repo). Si attiva su push e PR verso `main`, usa Node da `.nvmrc`, fa `npm ci` e poi `./scripts/verify.ps1` con `pwsh` (su Ubuntu "powershell" non esiste). → **Copiare** così com'è.
- `.nvmrc` = `22.13.1`; `package.json` engines `^22.13.0`. → **Copiare**.

## 6. Convenzioni docs

- Cartella `C:\progetti\casazero\docs\handoffs\` (Repo): **128 file** accumulati. Due tipi:
  - `HANDOFF_<argomento>_<MM>_<GG>_<HH>_<MM>.md` (es. `HANDOFF_configura_per_voce_11_09_18_31.md`): fine sessione.
  - Note di lavoro libere (`e1a-fase0.md`, `...-piano.md`): diagnosi e piani.
- Struttura obbligatoria dell'handoff (da `.claude/commands/handoff.md`): Sommario · Lavoro completato (con spunte) · File toccati (Creati/Modificati/Letti) · Decisioni chiave · Stato attuale (Funziona / Non funziona) · Prossimi passi · Comandi da rilanciare · Domande aperte · **Leggi emerse** (regole candidate per CLAUDE.md, testo pronto da incollare). → **Copiare la struttura** (è il template).
- `docs\migrations.log` (3 KB): una riga per migrazione `data | file | esito (PASS/FAIL + verifiche)`. → **Copiare il formato**, non il contenuto.
- Altri docs: `catalogo-manutenzioni-v2.md`, `scenari-date-consegna.md`, `fase0-fase-b-status.md` → **lasciare** (dominio CasaZero).
- In radice: `PRODUCT.md` e `DESIGN.md` (richiesti dalla skill impeccable) → **lasciare**; scriverne di nuovi solo se userai quella skill.

## 7. Pattern riusabili (idee, non codice)

**Migrazioni** (`supabase\migrations\`, 53 file `001`…`054`, Repo): nome `NNN_descrizione_snake_case.sql`, numerazione continua senza buchi, uno scopo per file. Ogni file apre con un blocco di commento: cosa fa, perché, ordine di applicazione, decisioni, query di verifica a fondo. Devono essere **rieseguibili**: `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`, `IF NOT EXISTS`. Registro in `docs/migrations.log`. Nel repo vecchio le migrazioni 001-047 non sono nel log: **nel nuovo, registrare dalla 001**. Cartella `supabase\maintenance\` = script una-tantum di manutenzione dati (non migrazioni) → **riscrivere** l'idea, lasciare i file.

**Schema RLS** (esempio: `002_rls.sql`, righe 13-54): (1) poche funzioni helper `czero_*` (`czero_user_role`, `czero_user_builder_id`, `czero_can_access_residence`, `czero_can_access_unit`), tutte `SECURITY DEFINER` (girano con i permessi del proprietario, evitano la ricorsione delle policy) con `SET search_path = public` (blocca un attacco classico di dirottamento). (2) Tutte le policy chiamano gli helper, così la regola di accesso sta in un punto solo. (3) Il tenant è il `builder_id` sul profilo; super_admin vede solo il proprio builder. → **Riscrivere**: tieni lo schema "helper unici + policy che li chiamano", rinominando `czero_` e i ruoli.

**Test di isolamento tra tenant**: non esiste uno script dedicato che si lancia con `npm`. L'isolamento è provato **dentro la migrazione** (es. `054_czero_configure_voce.sql`: controlli di ruolo nella funzione, "meno righe del previsto = errore e rollback") e da una **simulazione RLS in transazione annullata** fatta a mano con ruoli finti (builder giusto, altro builder, admin, residente, anonimo → rifiutati `42501`), con l'esito incollato nel messaggio. Gli script `verify-*` testano logica pura, non il database. → **Riscrivere**: nel nuovo repo conviene un file `supabase\tests\isolamento.sql` fisso (simulazione con 2 tenant, deve dare sempre le stesse risposte), perché qui è stato fatto ogni volta a mano.

**Storage** (migrazioni 004, 014, 017, 022, 023): bucket **privati**; il primo segmento del percorso file è un uuid (id della riga a cui il file appartiene) e la policy controlla l'accesso a quella riga tramite l'helper `czero_storage_first_uuid`; **nessuna policy DELETE** per le prove legali (pulizia solo con service role, cioè con la chiave server che salta la RLS). **Regola critica**: nelle subquery delle policy su `storage.objects` scrivere sempre `objects.name`, mai `name` (si lega alla tabella sbagliata senza errore). → **Riscrivere** (idea e regola, non i file).

**Convenzioni di commit** (git log reale): un concern per commit; messaggio in italiano, **riga singola molto descrittiva** (cosa cambia, cosa NON cambia, es. "nessuna migrazione", "solo rimozione"); commit solo dopo `npm run verify` pulito **e dopo che Filippo scrive che la verifica a schermo è fatta** (memoria "Commit dopo verifica"); la riga finale `Co-Authored-By:` viene aggiunta dal programma; nessun here-string con virgolette doppie. → **Copiare** come regole; se i messaggi lunghi non ti piacciono, qui puoi cambiare.

**Ruoli e dati legali**: ruoli `super_admin` / `admin` / `client`; il fascicolo legale (`completions`) è append-only (INSERT solo per un ruolo, mai modifiche). → **Lasciare** il dettaglio, tenere il principio "il dato che fa fede non si può cancellare".

## 8. Lezioni imparate (cosa è andato storto → come evitarlo)

1. **Errori Supabase scartati** (`const { data } = ...` senza `error`): trovato 3 volte; un guasto tecnico appariva come "permessi insufficienti". → Regola dal giorno 1: destrutturare sempre `error`, loggarlo, distinguere "non trovato/non autorizzato" da "riprova".
2. **Policy storage con colonna non qualificata** (`name` invece di `objects.name`): sempre-vera o sempre-falsa senza errore, scoperta solo a runtime. → Qualificare sempre; mettere la regola nel CLAUDE.md iniziale.
3. **Policy DELETE troppo larghe sugli allegati**: l'uploader poteva cancellare la propria prova. → Per i dati legali nessuna policy DELETE, pulizia solo via service role.
4. **Mass-assignment** (B53: un payload intero passato come spread a un update). → Whitelist di colonne esplicita e scrittura via funzione database atomica (`czero_configure_voce`).
5. **Segreto assente = accesso aperto**: `Bearer ${process.env.X}` con X vuota produce `Bearer undefined` che passa. → Segreto mancante = errore 500 con log, mai 401.
6. **Redirect che perde parametri di Supabase Auth** (`code`, `error`) sulla home. → Il middleware li intercetta su ogni percorso.
7. **Link nelle email scelti a mano**: percorsi diversi per ruolo, rimandi persi senza errore. → Una sola funzione che sceglie il link dal ruolo.
8. **Valori calcolati in più punti** (contatore e lista, schermo e PDF) che divergono. → Una funzione unica fonte di verità.
9. **Numeri dei subagent usati come fatti**: conteggi e righe vanno riverificati dalla sessione principale. → Già scritto in `/fase0`.
10. **Richieste incollate già eseguite** (si ricommittava due volte). → Controllare `git log` e riportare l'hash esistente.
11. **Modali, colori, font fatti a mano** (6 overlay diversi, hex sparsi, grassetto sintetico). → Componenti UI condivisi e solo token di stile, decisi all'inizio.
12. **Debito intenzionale non datato** (dual-write su `priority` per sempre). → Se si accetta un debito, scrivere nel CLAUDE.md quando e come si chiude.
13. **128 handoff in una cartella piatta**: difficile trovare quello giusto. → Nel nuovo repo valutare `docs\handoffs\` con solo gli ultimi ~10 e `docs\handoffs\archivio\` per il resto.
14. **`.gitignore` con `.env*`**: nasconderebbe anche `.env.example`. → Aggiungere la riga `!.env.example` in fondo.
15. **Vercel scrive nel `.env.local` anche variabili di sistema** (`VERCEL_*`, `TURBO_*`, `NX_DAEMON`, incluso un token OIDC): non vanno copiate né mandate a nessuno.
16. **Migrazioni 001-047 senza riga di registro**: ricostruzione mai fatta. → Registro dalla prima migrazione.
17. **Cron mai in locale**: "Pianificata" in dev è normale → scriverlo subito nel CLAUDE.md se il gestionale avrà cron.
18. **SQL Editor di Supabase senza transazioni** (memoria): anteprime come statement singoli idempotenti, mai `BEGIN/COMMIT`. → **Copiare** come regola nella sezione Migrazioni.
19. **Possibile problema di codifica caratteri**: `.gitignore`, `migrations.log` e `.env.local` mostrano lettere accentate/trattini rovinati (`â€”`, `Ã¨`) quando letti da PowerShell 5.1. Probabilmente solo visualizzazione, ma da verificare. → Nel nuovo repo salvare i file in UTF-8 e scrivere in `.claude` le istruzioni di creare file con UTF-8.

## 9. File di base utili

| Voce | Percorso | Livello | Azione |
|---|---|---|---|
| `.gitignore` | `C:\progetti\casazero\.gitignore` | Repo | **Copiare** (ignora node_modules, .next, .env*, .vercel, tsbuildinfo, screenshots, `.claude/settings.local.json`, `.impeccable/`); **togliere** le righe `.impeccable/` e `.screenshots/` se non servono; **aggiungere** `!.env.example`; riscriverlo in UTF-8 pulito. |
| `.env.example` | **Non esiste** | Repo | **Riscrivere** (creare nuovo, vedi nomi sotto, valori vuoti). |
| `.nvmrc` | `...\casazero\.nvmrc` | Repo | **Copiare** (`22.13.1`). |
| `vercel.json` | `...\casazero\vercel.json` | Repo | **Adattare**: contiene solo un cron giornaliero `/api/cron/daily` alle 07:00; tenere solo se serve un cron. |
| Config Supabase | Cartella `supabase\` ha solo `migrations\`, `maintenance\` e 3 seed. **Nessun `config.toml`**: non si usa la Supabase CLI locale; le migrazioni si applicano da SQL Editor o dal plugin. Project ref CasaZero: nel CLAUDE.md. | Repo | **Riscrivere**: nuovo progetto Supabase = nuovo project ref; seed **lasciare** (dati demo). |
| `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts` | radice repo | Repo | **Copiare** (scheletro Next.js 15 + Tailwind v4) dopo aver creato l'app nuova; controllare `next.config.ts` per impostazioni specifiche di CasaZero. |
| `.vercel\` | radice repo | Repo (ignorata) | **Lasciare**: è il collegamento al progetto Vercel di CasaZero. Il nuovo se ne crea uno proprio. |
| `.github\workflows\verify.yml` | radice repo | Repo | **Copiare**. |

Nomi delle variabili d'ambiente usate da CasaZero (solo i nomi, dal `.env.local`), per scrivere il nuovo `.env.example`:
`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_APP_URL` · `CRON_SECRET` · `RESEND_API_KEY` · `ANTHROPIC_API_KEY` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET`.
Tenere solo quelle che servono al gestionale (probabilmente le prime tre + `NEXT_PUBLIC_APP_URL`). Le variabili `VERCEL_*`, `TURBO_*`, `NX_DAEMON` le mette Vercel: **non entrano nell'.env.example**.

---

## A. Passi uno per uno per trovare e copiare ogni file

Apri PowerShell. Tutti i comandi qui sotto **leggono soltanto** finché non dico "copia".

1. **Vai nel progetto.** Scrivi `cd C:\progetti\casazero`. Devi vedere il prompt cambiare in `PS C:\progetti\casazero>`. Se dice "percorso non trovato", il progetto è altrove: cerca con `Get-ChildItem C:\progetti -Directory`.
2. **Controlla che i comandi ci siano.** Scrivi `Get-ChildItem .claude\commands, .claude\agents`. Devi vedere `fase0.md`, `handoff.md`, `esploratore.md`. Se ne manca uno, esegui `git status --short` e chiedi alla control room: potrebbe essere stato cancellato.
3. **Crea una cartella d'appoggio fuori dai due repo.** `New-Item -ItemType Directory C:\progetti\export-stefano`. Devi vedere la cartella creata. Se esiste già, va bene.
4. **Copia i file "così come sono".** Scrivi (una riga per volta):
   - `Copy-Item .claude\commands\fase0.md C:\progetti\export-stefano\`
   - `Copy-Item .claude\agents\esploratore.md C:\progetti\export-stefano\`
   - `Copy-Item scripts\verify.ps1 C:\progetti\export-stefano\`
   - `Copy-Item .github\workflows\verify.yml C:\progetti\export-stefano\`
   - `Copy-Item .nvmrc C:\progetti\export-stefano\`
   Poi `Get-ChildItem C:\progetti\export-stefano`: devi vedere 5 file. Se ne manca uno, rifai quella riga e leggi l'errore rosso; di solito è un refuso nel percorso.
5. **Copia i file "da adattare"** (e poi modificali nel nuovo repo, non qui):
   - `Copy-Item .claude\commands\handoff.md C:\progetti\export-stefano\`
   - `Copy-Item CLAUDE.md C:\progetti\export-stefano\CLAUDE.da-adattare.md`
   - `Copy-Item .gitignore C:\progetti\export-stefano\gitignore.txt`
   - `Copy-Item vercel.json C:\progetti\export-stefano\`
   Devi vedere i file nella cartella. Il `.gitignore` è copiato con nome `gitignore.txt` perché i file che iniziano col punto sono nascosti.
6. **Controlla Chrome DevTools** (a livello utente). Scrivi `Get-Content C:\Users\raffa\.claude\plugins\installed_plugins.json`. Devi vedere solo `supabase` e `vercel`. Se ci fosse anche un plugin DevTools lo avresti letto qui; altrimenti non è un plugin: dentro Claude Code scrivi `/mcp` e guarda la lista dei collegamenti. Annota cosa vedi.
7. **Non copiare mai** `.env.local`. Per l'`.env.example`: nel nuovo repo crea un file di testo con i nomi della sezione 9, uno per riga, con `=` e nessun valore.
8. **Il resto è "riscrivere"**: non c'è nulla da copiare. Il nuovo repo parte da `npx create-next-app`, poi lì dentro metti i file della cartella d'appoggio.
9. **Prima di mandare qualcosa alla control room**: apri ogni file con il Blocco note e cerca la parola `key`, `secret`, `token`, `@gmail`. Se compare un valore reale, cancellalo. (I file elencati qui non ne contengono: l'ho verificato leggendoli, ma fallo comunque.)

## B. Cosa mandare alla control room (massimo 5 file, in ordine di importanza)

1. `C:\progetti\casazero\CLAUDE.md` — la fonte delle regole; senza questo non si può scrivere il CLAUDE.md del nuovo repo.
2. `C:\progetti\casazero\.claude\commands\handoff.md` — struttura del documento di fine sessione (da adattare).
3. `C:\progetti\casazero\.claude\commands\fase0.md` — il comando di diagnosi.
4. **Un unico file di testo a tua scelta**, es. `C:\progetti\export-stefano\pacchetto-base.txt`, creato incollando uno dopo l'altro (con una riga titolo prima di ciascuno): `.claude\agents\esploratore.md`, `scripts\verify.ps1`, `.github\workflows\verify.yml`, `.nvmrc`, `.gitignore`. Sono tutti brevi.
5. Questo documento: `C:\progetti\casazero\docs\handoffs\2026-11-11-export-per-nuovo-repo.md`.

Niente altro: non mandare `.env.local`, migrazioni, handoff vecchi, la cartella `impeccable`.

## C. Risposte esplicite

**I comandi stanno nel repo o a livello utente?** Nel **repo**: `.claude\commands\fase0.md` e `.claude\commands\handoff.md` (più il subagent `.claude\agents\esploratore.md`), tutti tracciati da git. A livello utente (`C:\Users\raffa\.claude`) **non c'è nessuna cartella `commands` né `agents`** e non ci sono hook. A livello utente ci sono solo le impostazioni generali, i plugin Supabase (attivo) e Vercel (spento) e le skill sincronizzate.

**Cosa NON si porta nel repo nuovo perché legato a CasaZero:**
- La nomenclatura Modalità/Tipo, la sigla N1/N2/N3, il dual-write su `priority`, `completions`, promemoria "mai scaduta", `admin_assignments`, bucket `attachments`: tutto il dominio manutenzioni/residenze.
- `docs\catalogo-manutenzioni-v2.md`, `scenari-date-consegna.md`, `fase0-fase-b-status.md`, i 128 handoff esistenti, `PRODUCT.md`, `DESIGN.md`.
- Le 53 migrazioni, i seed (`seed*.sql`, `seed_cavaccio_demo.sql`), `supabase\maintenance\*`, i 36 `verify-*.mjs` (si riscrivono sul nuovo dominio).
- La skill `impeccable` (UI) e `.impeccable/`.
- `.env.local` e `.vercel\` (segreti e collegamento al progetto Vercel di CasaZero); anche `vercel.json` (cron) se il gestionale non ne ha.
- In `/handoff`: i riferimenti a CasaZero, "Filippo", "M5", N1/N2/N3 (si riscrivono, non si copiano).
- Nel CLAUDE.md: Wiki `CasaZeroVault`, account di test, project ref `kuvekkseclhhcamojysj`, cliente pilota Furlan Costruzioni.

**Da verificare (non lo so con certezza):** dove sia collegato Chrome DevTools (non è un plugin installato, non c'è `.mcp.json`); e se i caratteri accentati rovinati nei file sono solo un problema di visualizzazione in PowerShell.

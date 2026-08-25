# Handoff — Sicurezza storage RLS (B0, pre-Fase B) · 20/07/2026 17:49

## Sommario
Prima di iniziare la Fase B (Pilastro Consegna), la FASE 0 diagnostica aveva trovato che le policy RLS sui due bucket Storage privati (`documents`, `attachments`) non erano scopate per tenant: qualsiasi utente autenticato di qualsiasi builder poteva leggere e scrivere qualunque file, protetto solo dall'oscurità del path. Questa sessione ha chiuso il rischio con due migrazioni (022, 023), trovato e corretto un bug di binding SQL introdotto dalla prima versione della 022, ripulito dati orfani, e fixato un difetto UX collaterale (download che apriva i PDF nel tab invece di scaricarli).

## Lavoro completato
- [x] FASE 0 Fase B completa (diagnosi read-only sui 6 punti del brief: wizard/RPC creazione residenza, gestione file esistente, schema dati, chiamate LLM, check Fase A, rischi) — nessun codice toccato in quella fase
- [x] B0 check preliminare: individuati e fatti eliminare (da Filippo) 4 file orfani nei bucket privati prima di scrivere qualunque policy (2 loghi builder in `documents`, 2 residui di test in `attachments`)
- [x] Migrazione `022_storage_documents_scoped_rls.sql` — RLS scoped-residenza sul bucket `documents` (SELECT via `czero_can_access_residence`; INSERT/DELETE simmetriche: super_admin del builder O admin assegnato)
- [x] Bug reale trovato e corretto nella 022: riferimento non qualificato `name` in una subquery su `residences` (che ha una colonna `name`) catturava il binding, rendendo il ramo super_admin sempre falso → tutti gli upload da dashboard fallivano con "new row violates row-level security policy". Fix: `objects.name` qualificato ovunque
- [x] Migrazione `023_storage_attachments_scoped_rls.sql` — RLS scoped-completion sul bucket `attachments` (SELECT/INSERT via accesso alla completion; **nessuna policy DELETE**, deviazione consapevole per allineamento all'invariante fascicolo-immutabile)
- [x] DELETE delle 5 righe demo orfane in `documents` (`storage_path LIKE 'demo/%'`, mai avute un file reale nel bucket) — eseguito da Filippo, verificato 0 righe residue
- [x] Fix UX: `/api/download` forzava `Content-Disposition: inline` — aggiunto `{ download: true }` a `createSignedUrl`, commit separato
- [x] Footer di verifica compilati con l'esito REALE (non pianificato) per entrambe le migrazioni, incluse le limitazioni d'ambiente incontrate (permission denied su `auth.users` dopo impersonazione; `storage.protect_delete()` di sistema che blocca il DELETE diretto su `storage.objects` indipendentemente da RLS)
- [x] Tutti i commit verificati con `npx tsc --noEmit` verde prima del commit, un concern per commit

## File toccati
### Creati
- `supabase/migrations/022_storage_documents_scoped_rls.sql` — RLS scoped-tenant sul bucket `documents`, con nota di correzione del bug di binding in testa al file e footer con l'esito reale della verifica
- `supabase/migrations/023_storage_attachments_scoped_rls.sql` — RLS scoped-completion sul bucket `attachments`, nessuna policy DELETE, footer con l'esito reale

### Modificati
- `src/app/api/download/route.ts:21` — `createSignedUrl(path, 3600)` → `createSignedUrl(path, 3600, { download: true })`, per forzare il download invece dell'apertura inline nel browser

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/new/actions.ts`, `supabase/migrations/012_create_residence_atomic.sql`, `013_add_unit_atomic.sql` — RPC atomiche di creazione residenza/unità (FASE 0 Fase B, punto 1)
- `src/app/(app)/documenti/actions.ts`, `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — le due superfici di upload esistenti su `documents`, entrambe col client scoped-utente (mai service role)
- `src/lib/maintenance-status.ts` — helper `isCountable`/`resolveCompletionMode`, per capire l'impatto di `template_id NOT NULL` su eventuali proposte fuori catalogo (Fase B5, non ancora avviata)
- `src/app/(app)/manutenzioni/actions.ts` (`completeN2`) — flusso reale di upload su `attachments`, path pattern `${completionId}/${ts}.${ext}`, nessun rollback dell'oggetto storage se l'INSERT su `attachments` fallisce dopo un upload riuscito (annotato, non corretto)
- `supabase/migrations/001_schema.sql`, `002_rls.sql`, `004_storage.sql`, `005_m3.sql`, `011_catalogo_v2_columns.sql` — schema completo, RLS base, bucket originari
- `next.config.ts` — `serverActions.bodySizeLimit: '5mb'`, in tensione col limite applicativo dichiarato di 50 MB per gli upload documenti (rischio annotato in FASE 0 Fase B, non ancora risolto)

## Decisioni chiave
- **DELETE su `attachments`: nessuna policy, nega tutto sempre** — deviazione dal piano iniziale ("stessa regola dell'INSERT"). Motivazione di Filippo: gli attachments sono la prova fotografica dei completamenti, e `completions` è il fascicolo legale immutabile per invariante di CLAUDE.md. La vecchia policy (`owner_id = auth.uid()`) permetteva al residente di cancellare la propria prova dopo averla allegata — immutabilità solo formale. Confermato in FASE 0 che nessun flusso applicativo cancella oggetti da quel bucket prima di applicare la modifica.
- **INSERT/SELECT su `attachments` non differenziate per ruolo** (a differenza di `documents`): `completeN2` è chiamabile anche dal residente, quindi lo scope replica la stessa condizione già usata dalle policy DB `completions`/`attachments` (accesso alla completion via unit o residence), non "solo admin/super_admin".
- **INSERT su `documents` estesa all'admin assegnato**, non solo super_admin: la premessa iniziale del brief B0 ("oggi l'upload è solo super_admin") era vera solo per la dashboard — nella PWA `(app)/documenti` l'admin può già caricare. B0 non doveva introdurre regressioni funzionali, quindi INSERT/DELETE coprono super_admin del builder O admin assegnato via `admin_assignments`.
- **Riferimenti a `name` in subquery: sempre qualificati `objects.name`**, anche quando la tabella interrogata non ha una colonna omonima (es. `completions` nella 023). Non è una verifica caso per caso: è la disciplina che previene la classe di bug trovata nella prima apply della 022.
- **Verifica onesta anche quando l'ambiente non la permette**: i probe SQL isolati (impersonazione via `set_config` + INSERT/DELETE diretti su `storage.objects`) non sono eseguibili nel SQL Editor per due limiti indipendenti dalle policy — permission denied su `auth.users` dopo l'impersonazione, e il trigger di sistema `storage.protect_delete()` che blocca qualunque DELETE diretto su `storage.objects`. In entrambi i casi il footer registra il motivo esatto invece di far finta che il probe sia stato eseguito; lo smoke funzionale reale dall'app ha sostituito il probe come prova più forte (autenticazione vera, non impersonata).

## Stato attuale
### Funziona
- Upload/download su `documents` per super_admin, admin assegnato, residente (in lettura) — verificato con smoke reale: upload PDF veri di Residenza Cavaccio da super_admin OK, download che scarica invece di aprirsi nel tab OK
- Upload/lettura su `attachments` per il residente — verificato con smoke reale: completamento con foto allegata, upload OK, allegato visibile nel fascicolo
- Entrambe le migrazioni verificate live con query dirette (non solo report di Filippo): esattamente le policy attese su ciascun bucket, nessuna lasca residua, `objects.name` qualificato nel testo salvato
- 0 righe demo residue in `documents`, nessuna riga non-demo toccata dalla pulizia
- `npx tsc --noEmit` verde su tutti i commit di questa sessione

### Non funziona / da verificare
- **Upload admin dalla PWA (`filippoloro02`) non testato**: bloccato da un bug pre-esistente e indipendente — le card residenze nella dashboard admin non sono cliccabili. Segnalato a backlog, non una regressione di questa sessione.
- **Orfano preesistente non toccato**: `45196dac-.../proprieta/1781300312305_Certeficato_enegertico.pdf` nel bucket `documents` — mai referenziato da una riga `documents`, presente già nell'inventario del check preliminare di questa sessione (prima di qualsiasi modifica). Fuori scope B0.
- **`completeN2` non gestisce l'errore dell'INSERT su `attachments`** dopo un upload storage riuscito (`src/app/(app)/manutenzioni/actions.ts:53-60`): se quell'INSERT fallisse, l'oggetto resterebbe orfano in storage senza errore visibile né log. Annotato, non corretto in questa sessione — fuori scope B0 (era un problema di gestione errori applicativa, non di RLS).
- Working tree sporco da diverse sessioni, invariato: `CLAUDE.md` modificato (sezione Wiki Knowledge Base), `docs/spec.md` cancellato, non tracciati `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py`. Non toccato in questa sessione, resta rumore permanente in `git status`.

## Prossimi passi
1. Riprendere la FASE 0 di Fase B (Pilastro Consegna) aggiornandola: il "rischio 1" di quella diagnosi (RLS storage non scopate) è ora chiuso — toglierlo dai rischi aperti prima di procedere a B1.
2. Decidere l'architettura di upload per B3 (categorizzazione AI multi-PDF): il limite `serverActions.bodySizeLimit: '5mb'` in `next.config.ts` è incompatibile con upload multipli di PDF di consegna reali — probabile necessità di upload client-direct con signed URL, pattern non ancora usato nel progetto.
3. Prendere la decisione architetturale su `maintenance_items.template_id NOT NULL` prima di scrivere B5 (proposte oltre catalogo): nullable vs. template ad-hoc con colonna di scoping — tocca l'helper `isCountable`/`resolveCompletionMode` usato ovunque, va decisa esplicitamente prima del codice.
4. Backlog minore da questa sessione: bug pre-esistente "card residenze dashboard admin non cliccabili" (blocca il check upload-admin); gestione errore mancante in `completeN2` sull'INSERT `attachments`; orfano `Certeficato_enegertico.pdf` da eliminare o ricollegare a mano.
5. Working tree sporco da pulire (invariato da 5+ handoff): committare, gitignorare o scartare `CLAUDE.md`/`docs/spec.md`/i file non tracciati elencati sopra.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Vale la pena aggiungere un test/probe SQL alternativo per il DELETE su `storage.objects` (dato che `storage.protect_delete()` lo blocca comunque a monte), o la doppia protezione documentata nel footer della 023 è sufficiente come garanzia permanente?
- L'admin deve poter caricare documenti anche dalla dashboard (`admin/residences/[id]/documenti`), oggi ristretta a `requireRole(['super_admin'], ...)`? È un vincolo di prodotto o un gap da colmare quando arriva B6 (vista per condominio all'admin)?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice ricorrenti (bug class note)**: Nelle policy RLS su `storage.objects` che usano una subquery su un'altra tabella (es. `residences`, `completions`), ogni riferimento a colonne di `storage.objects` — `name`, `owner_id`, ecc. — va **sempre** qualificato esplicitamente (`objects.name`), anche quando la tabella nella subquery non ha una colonna omonima. Un riferimento non qualificato può legarsi silenziosamente alla colonna della tabella più interna (nessun errore di parsing), rendendo il ramo della policy sempre-falso o sempre-vero senza alcun sintomo in fase di apply — si scopre solo a runtime, con errori RLS o falsi negativi sull'autorizzazione.

- **Sezione Invarianti (mai violare)**: L'immutabilità del fascicolo (`completions`) si estende agli allegati che ne sono prova (`attachments`): nessun ruolo, nemmeno l'uploader, può cancellare un file allegato a un completamento una volta caricato. Il bucket storage `attachments` non ha policy DELETE per nessun ruolo (RLS nega di default); un eventuale cleanup futuro va fatto solo via service role, mai riaprendo una policy DELETE per utenti autenticati.

- **Sezione Metodo di lavoro**: Quando un probe di verifica pianificato non è eseguibile per un limite dell'ambiente (permessi del SQL Editor, protezioni di sistema come `storage.protect_delete()`), il footer di verifica deve riportare ONESTAMENTE il motivo esatto e cosa lo ha sostituito (es. smoke funzionale reale dall'app), mai lasciare o inventare un esito positivo non verificato. Un footer con un esito non confermato è un difetto grave quanto il bug che la verifica dovrebbe intercettare.

---

**Promemoria per Filippo**: ci sono **3 leggi candidate** per CLAUDE.md in questo handoff (bug class sul qualificare `objects.name` nelle policy storage, invariante di immutabilità estesa agli attachments, disciplina di onestà nei footer di verifica quando un probe non è eseguibile). Vuoi promuoverle?

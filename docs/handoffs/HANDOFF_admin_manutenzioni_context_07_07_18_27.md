# Handoff — Contesto vista admin manutenzioni (filtri, residenza, builder, logo) · 07/07/2026 18:27

## Sommario
Sessione a quattro concern sequenziali sulla vista `/admin/manutenzioni`: prima resi cliccabili i tre contatori come filtro via `searchParams`, poi aggiunto contesto sopra i contatori (card "Residenza che segui" e card contatti impresa costruttrice), infine una FASE 0 di verifica su un presunto bug (2 residenze mostrate invece di 4, rivelatosi un mix-up tra account di test, non un bug) ha portato a scoprire e risolvere un bug sistemico preesistente: il logo builder viveva in un bucket Storage privato con un `getPublicUrl()` che produceva un URL non funzionante, rotto sia nella nuova card sia nell'header shell.

## Lavoro completato
- [x] COMMIT `bfd72c4` — contatori Scadute/In corso/Pianificate cliccabili (`<Link href="?filter=...">`), toggle se già attivi, sezioni filtrate lato server via `searchParams` (Next.js 15, Promise awaited)
- [x] COMMIT `f807ce4` — card "Residenza che segui/Residenze che segui" sopra i contatori: itera su tutte le `admin_assignments` dell'admin (niente `.single()`), foto/indirizzo/conteggio unità, fallback "nessuna immagine" se `photo_url` NULL
- [x] COMMIT `78f48d8` — card contatti impresa costruttrice sotto la card residenza: logo, nome, `contact_email`/`contact_phone` come righe `mailto:`/`tel:` solo se non NULL; builder derivato dalla residenza primaria (prima per `created_at`), non da query builder-wide
- [x] Migrazione `016_builders_admin_select_policy.sql` — policy SELECT su `builders` per admin via `admin_assignments`, **applicata da Filippo**, versionata nel repo come documentazione (non da rieseguire)
- [x] FASE 0 read-only — verificato che "solo 2 residenze mostrate invece di 4" NON è un bug: `filippoloro02` ha realmente solo 2 assegnazioni nel DB (Cavaccio, Teolo); Dublin e Arcella appartengono a `filippoloro02+adminB@gmail.com`, un account di test diverso
- [x] FASE 0 read-only — diagnosticata la causa del logo Furlan rotto: `builders.logo_url` salvato con `getPublicUrl()` su bucket `documents` (`public=false`), URL sempre invalido; stessa causa condivisa con l'header shell (`whitelabel.ts` + `dashboard/layout.tsx`)
- [x] Migrazione `017_builder_logos_bucket.sql` — nuovo bucket pubblico dedicato `builder-logos` (5MB, jpeg/png/webp), policy SELECT pubblica + INSERT/UPDATE `super_admin` + DELETE proprietario, ricalcata su `014`/`015` (residence-photos); **applicata da Filippo**, verificata nel DB dopo l'applicazione
- [x] COMMIT `0f2801c` — `settings/actions.ts` aggiornato per caricare il logo su `builder-logos` invece di `documents`, con cache-buster `?v=${Date.now()}` sullo stesso pattern di `updateResidencePhoto`
- [x] `tsc --noEmit` e `npm run build` verdi su tutti e 4 i commit

## File toccati
### Creati
- `supabase/migrations/016_builders_admin_select_policy.sql` — policy SELECT su `builders` per admin (via `admin_assignments` → `residences`), versiona una policy già applicata a mano
- `supabase/migrations/017_builder_logos_bucket.sql` — bucket pubblico `builder-logos` + 4 policy storage, versiona una migrazione già applicata a mano

### Modificati
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — aggiunta `searchParams` alla signature (Promise, Next 15); contatori diventati `<Link>` con stato attivo (`ring-2 ring-brand-dark`); sezioni Scadute/In corso/Pianificate renderizzate condizionalmente in base al filtro; aggiunta query `admin_assignments` → `residences` per la card "Residenza/e che segui" con conteggio unità; aggiunta query `builders` per la card contatti (dipende dalla migrazione 016)
- `src/app/(dashboard)/admin/settings/actions.ts` — `updateBuilderSettings`: upload logo spostato da bucket `documents` a `builder-logos`, aggiunto cache-buster sull'URL salvato in `logo_url`

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_sblocco_fascicolo_07_07_17_32.md` — stato di partenza sessione
- `src/lib/maintenance-status.ts` — fonte di verità stato live (`isOverdueLive`/`isInCorso`), non toccata
- `src/app/(dashboard)/admin/residences/page.tsx` — pattern di riferimento per conteggio unità (`.select('id', { count: 'exact', head: true })`) e card lista residenze
- `src/app/(app)/fascicolo/page.tsx` — pattern "residenza primaria" (`ORDER BY created_at ascending` + primo elemento), riusato per scegliere il builder da mostrare
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx`, `src/app/(dashboard)/admin/residences/[id]/actions.ts` — pattern upload/cache-buster su bucket pubblico, riusato per il fix del logo
- `src/app/(dashboard)/admin/residences/[id]/fornitori/FornitoriManager.tsx` — pattern riga cliccabile `tel:`/`mailto:` con icona, riusato per la card contatti builder
- `src/lib/whitelabel.ts`, `src/app/(dashboard)/layout.tsx` — secondo consumatore di `builders.logo_url`, confermato colpito dalla stessa causa del bug logo
- `supabase/migrations/014_residence_photos_bucket.sql`, `015_residence_photos_update_policy.sql` — pattern ricalcato esattamente per la migrazione 017
- Query dirette via Supabase MCP: `pg_policies` su `builders`/`residences`/`admin_assignments`/`units`, `pg_proc` su `czero_user_builder_id`/`czero_can_access_residence`/`czero_can_access_unit`, `storage.buckets`, `auth.users` (per mappare account email → profile id)

## Decisioni chiave
- **Filtro contatori via `searchParams`, non client component**: la pagina resta un server component puro (nessun `useState`), il filtro passa dall'URL — coerente col vincolo esplicito del prompt e con lo stesso pattern già usato in `residences/[id]/units/page.tsx`.
- **Card residenza itera su TUTTE le `admin_assignments`, mai `.single()`**: un admin può seguire più residenze (confermato: `filippoloro02` ne segue 2). Scartata l'opzione di mostrare solo la "residenza primaria" perché la card è pensata come contesto operativo, non solo branding.
- **Builder per la card contatti preso dalla residenza primaria, non da tutte**: a differenza della card residenza (che itera), la card contatti è unica per costruttore — si assume che le residenze di un admin condividano lo stesso builder (vero nei dati attuali, tutte e 4 le residenze demo appartengono a Furlan srl). Non gestito il caso teorico di un admin con residenze di builder diversi.
- **Migrazione 016 (policy `builders` per admin) diagnosticata analiticamente prima di scrivere codice morto**: invece di scrivere la query e scoprire a runtime che torna vuota, la FASE 0 ha letto le policy esistenti (`id = czero_user_builder_id()`, sempre NULL per un admin) e i dati reali (tutti i profili admin hanno `builder_id IS NULL`), concludendo con certezza che la SELECT sarebbe tornata vuota. Evitato il giro morto scrivi-testa-scopri-fallisce.
- **Bug "2 residenze invece di 4" chiuso come falso allarme, non come fix**: la FASE 0 ha dimostrato con query dirette su `admin_assignments` che `filippoloro02` ha realmente 2 sole assegnazioni; le altre 2 (Dublin, Arcella) appartengono a `filippoloro02+adminB@gmail.com`. Nessuna riga di codice cambiata per questo punto — l'unica azione è stata la verifica.
- **Bucket dedicato `builder-logos` invece di rendere pubblico `documents` o usare signed URL**: decisione presa esplicitamente da Filippo nel prompt (vietate entrambe le alternative). `documents` contiene documenti dei condomini e deve restare privato; i signed URL avrebbero introdotto scadenza/complessità non necessaria per un asset di branding pubblico per natura.
- **Nessuna migrazione dati per il vecchio logo**: il file esistente in `documents/<builder_id>/logo.jpeg` resta dov'è (innocuo, non referenziato da nessun URL valido). Filippo ricaricherà il logo Furlan dalla tab Impostazioni dopo il deploy — non serve uno script di migrazione per un solo file in un progetto pilota.

## Stato attuale
### Funziona
- Filtro contatori verificato per tsc/build; comportamento toggle e sezioni condizionali coerenti col codice (non testato in browser reale in questa sessione)
- Card "Residenza che segui" verificata con query dirette sul DB: `filippoloro02` → Cavaccio (15 unità, foto) + Teolo (10 unità, nessuna foto, fallback esercitato)
- Card contatti builder verificata con query dirette: Furlan srl → `contact_email`/`contact_phone` popolati, righe `mailto:`/`tel:` renderizzate
- Policy RLS `builders` per admin — verificata via lettura diretta di `pg_policies` dopo l'applicazione di Filippo
- Bucket `builder-logos` — verificato via query su `storage.buckets` e `pg_policies`: `public=true`, 4 policy attive (SELECT pubblica, INSERT/UPDATE super_admin, DELETE proprietario)
- `npx tsc --noEmit` e `npm run build` verdi su tutti e 4 i commit della sessione

### Non funziona / da verificare
- **Mai testato in browser reale**: nessuno dei quattro commit è stato aperto in un browser in questa sessione — solo `tsc`/`build`/query dirette sul DB. Da fare prima della prossima demo, in particolare il click sui contatori (toggle) e il caricamento delle immagini (foto residenza + logo).
- **Logo Furlan ancora rotto finché non viene ricaricato**: il fix cambia solo il bucket di destinazione dei *futuri* upload; `builders.logo_url` in DB punta ancora al vecchio URL rotto su `documents`. La card contatti e l'header shell mostreranno "nessun logo" (fallback, non crash) finché Filippo non ricarica il file dalla tab Impostazioni.
- Il `border-l-4` su `ItemCard` (bug class "side-stripe border" segnalata ripetutamente dall'hook `/impeccable` in questa sessione) resta backlog non deciso, ereditato dall'handoff precedente.
- Discrepanza minore in CLAUDE.md: l'alias demo admin è documentato come `pippoloro02+adminB/C@gmail.com`, ma le email reali in `auth.users` sono `filippoloro02+adminB@gmail.com` / `filippoloro02+adminC@gmail.com` (prefisso diverso). Emersa durante la FASE 0 sul falso bug delle 4 residenze, non corretta (fuori scope, file di sola lettura in sessione).

## Prossimi passi
1. Test manuale in browser: login `filippoloro02`, verificare click sui 3 contatori (toggle filtro), verificare rendering card residenza (foto Cavaccio, fallback Teolo) e card contatti Furlan
2. Ricaricare il logo Furlan dalla tab Impostazioni (`super_admin`, `pippoloro02`) per popolare `builders.logo_url` col nuovo bucket `builder-logos` — solo dopo, l'header shell e la card contatti mostreranno il logo invece del fallback
3. Decidere se correggere la discrepanza `pippoloro02+adminB/C` vs `filippoloro02+adminB/C` in CLAUDE.md (probabile refuso storico, basso rischio ma confonde durante il debug)
4. Decidere sul `border-l-4` (`ItemCard`, backlog ereditato da più handoff) — confermarlo come pattern di sistema o sostituirlo
5. Valutare se l'assunzione "un admin ha un solo builder" nella card contatti va resa esplicita/validata quando si aggiungeranno altri builder oltre Furlan (oggi non testabile, un solo builder nel DB)

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
- L'header shell (`whitelabel.ts`) e la card contatti condividono lo stesso `logo_url`: dopo il re-upload di Filippo, vale la pena un giro di verifica visiva su entrambe le superfici insieme, o si considerano indipendenti?
- La card contatti builder assume un solo builder per admin (preso dalla residenza primaria): se in futuro un admin gestisce residenze di builder diversi, la card mostrerebbe solo il primo. Va bene come limite noto o serve un design esplicito (una card per builder, come per le residenze)?
- Vale la pena aggiungere un test/verifica automatica che confronti `auth.users.email` con gli alias documentati in CLAUDE.md, per evitare che discrepanze come `pippoloro02` vs `filippoloro02` restino silenziose?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Invarianti"**: Un bucket Storage privato (`documents`, `attachments`) non va MAI reso pubblico e non va MAI letto con `getPublicUrl()` per asset che devono essere visibili senza autenticazione — `getPublicUrl()` costruisce comunque un URL nel formato `/object/public/...` anche su bucket privati, silenziosamente non funzionante (nessun errore a build time né a upload time, si rompe solo al render dell'`<img>`). Per branding o asset pubblici per natura (logo builder, foto residenza), usare un bucket dedicato con `public=true` (pattern in `supabase/migrations/014_residence_photos_bucket.sql` e `017_builder_logos_bucket.sql`), mai un signed URL né un bucket privato "temporaneamente" pubblico.

- **Sezione "Metodo di lavoro"**: Prima di scrivere una query che dipende da una policy RLS non ancora verificata per quel ruolo, leggere `pg_policies` (via Supabase MCP) e confrontarla con i dati reali (es. `profiles.builder_id` per un admin) PRIMA di scrivere il codice che la usa. Se l'analisi mostra con certezza che la query tornerà vuota, fermarsi e proporre la migrazione in anteprima invece di scrivere codice che si scoprirà rotto solo a runtime — evita il giro "scrivi, testa, scopri che fallisce, poi fixa la policy".

- **Sezione "Metodo di lavoro"**: Quando un utente segnala un conteggio o una lista "sbagliata" tra dati attesi e dati mostrati (es. "dovrebbero essere 4, ne vedo 2"), la FASE 0 deve verificare per prima cosa l'identità dell'account/profilo usato per il confronto (query `auth.users` per mappare email → id), non solo la query applicativa: in questa sessione la causa non era un bug di codice ma un mix-up tra due account di test (`filippoloro02` vs `filippoloro02+adminB`) con dati realmente diversi nel DB.

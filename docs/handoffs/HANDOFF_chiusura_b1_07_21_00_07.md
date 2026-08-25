# Handoff — Chiusura B1 (upload client-direct + riconciliazione orfani) · 21/07/2026 00:07

## Sommario
Sessione di continuazione diretta della precedente (bridge pulizia/igiene): confermato che il commit 4 di B1 (refactor upload dashboard a task client-direct indipendenti) era già stato fatto con lo smoke test descritto da Filippo, poi scritto e committato il commit 5 (route di riconciliazione orfani bucket↔tabella `documents`), che chiude B1. Nessun codice applicativo modificato oltre alla nuova route; annotato un backlog reale trovato durante la verifica.

## Lavoro completato
- [x] Verificato che il commit 4 (`1985198`, refactor `DocumentiClient` a N task client-direct) corrispondesse esattamente allo smoke test descritto da Filippo (batch di 4 file: 2 PDF ok, 1 tipo non ammesso fallito da solo, 1 PDF >5MB caricato via client-direct, dopo reload 3 file in lista col fallito assente) — nessuna azione necessaria, già fatto
- [x] Diagnosi FASE 0 (read-only) del design della route di riconciliazione orfani, presentata a Filippo e approvata prima di scrivere codice
- [x] Creata e committata `src/app/api/reconcile-documents/route.ts` (commit 5, `4991f54`) — chiude B1
- [x] `npx tsc --noEmit` verde prima del commit
- [x] Confermato che il backlog "PWA `MAX_SIZE`/mime inline" citato da Filippo è reale, non solo ipotizzato: verificato leggendo `src/app/(app)/documenti/actions.ts:35`

## File toccati
### Creati
- `src/app/api/reconcile-documents/route.ts` — `GET`, gate `super_admin` scoped al `builder_id` del profilo; lista ricorsivamente il bucket `documents` per ogni residenza del builder, confronta i path trovati con `documents.storage_path`, ritorna JSON con `orphans`/`orphanCount`; nessuna cancellazione

### Modificati
Nessuno in questa sessione oltre al file creato sopra.

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_bridge_pulizia_igiene_07_20_18_45.md` — per capire dove si era fermata la sessione precedente
- `docs/fase0-fase-b-status.md` — stato vivo dei rischi aperti B1-B6
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — verifica commit 2/4, trovato il riferimento a "riconciliazione bucket↔tabella... commit successivo del piano B1" a riga 130
- `supabase/migrations/024_documents_ai_classification_columns.sql` — chiarire cosa fosse davvero il "prossimo commit del piano B1" citato nei commenti (righe 19-25): risultava già confluito nel commit 4
- `src/app/(app)/documenti/actions.ts` — confermato `file.size > 52428800` hardcoded a riga 35, nessun controllo MIME lato server (a differenza della dashboard)
- `src/lib/document-upload.ts` — costanti condivise `ALLOWED_DOCUMENT_MIME`/`MAX_DOCUMENT_SIZE`, create nel commit 4
- `src/lib/auth.ts` — `requireRole` (riga 37) usa `redirect()`, non adatto a una route che deve rispondere JSON
- `src/app/api/report/route.ts`, `src/app/api/download/route.ts`, `src/app/api/cron/daily/route.ts` — pattern esistenti di auth/scoping nelle route API, usati come riferimento diretto per la nuova route
- `src/lib/supabase/admin.ts` — `createServiceClient()`, usato dalla nuova route
- `supabase/migrations/001_schema.sql` — schema `residences`/`documents`, per lo scoping `builder_id → residence_id`

## Decisioni chiave
- **Route API invece di script standalone**: nessuna convenzione esistente nel progetto per script Node standalone (niente `tsx`/`ts-node` tra le devDependencies), mentre esiste già il pattern di route API admin-gated con `createServiceClient()`. Scelto `GET /api/reconcile-documents` invece di introdurre nuova infrastruttura di progetto per un solo caso d'uso.
- **Solo report, nessuna cancellazione**: coerente con la cautela già applicata al bucket `attachments` (nessuna policy DELETE per nessun ruolo). L'eventuale pulizia di un orfano resta una decisione manuale di chi legge il report, dalla dashboard Supabase Storage — non automatizzata qui.
- **Scope solo bucket→tabella, non il contrario**: `confirmDocument` (commit 2) verifica già che il file esista in storage prima di scrivere la riga `documents`, quindi "riga DB senza file" non può prodursi da questo flusso. Aggiungere quella direzione sarebbe stato scope creep non richiesto.
- **Scoping per `builder_id`, non globale**: la route filtra le residenze al `builder_id` del profilo `super_admin` richiedente, stesso pattern già usato in `src/app/api/report/route.ts`, per non esporre dati di altri tenant nel report.
- **Auth manuale invece di `requireRole`**: `requireRole` fa `redirect()`, pensato per pagine/Server Component. Replicato invece il pattern manuale (`getUser` → `createServiceClient` → check ruolo → `NextResponse.json` con status) già usato in `report/route.ts` e `download/route.ts`.
- **Numerazione commit B1 chiarita**: il "commit 3" del piano non è mai esistito come commit a sé. L'unico riferimento a un lavoro futuro con quel nome (helper tassonomia `doc_type`/mapping in `src/lib/`, citato in `024_documents_ai_classification_columns.sql:19-25`) era già confluito nel commit 4 come `src/lib/document-upload.ts`, con scope più ristretto (solo MIME/size, non ancora tassonomia AI). B1 si chiude quindi con i commit 1/2/4/5.

## Stato attuale
### Funziona
- B1 chiuso: upload client-direct via signed URL (bypassa `bodySizeLimit: 5mb` di `next.config.ts`), smoke test confermato da Filippo su batch misto
- Route di riconciliazione orfani disponibile su richiesta manuale (`GET /api/reconcile-documents`, richiede sessione `super_admin`)
- `git status` pulito, `npx tsc --noEmit` verde, 5 commit di B1 tutti verificati prima del commit

### Non funziona / da verificare
- La route `/api/reconcile-documents` non è stata ancora eseguita a runtime da Filippo in questa sessione — solo type-check, nessuno smoke reale. Da provare come `super_admin` autenticato prima di fidarsene in produzione
- Backlog non risolto: `src/app/(app)/documenti/actions.ts:35` ha ancora `52428800` hardcoded invece di importare `MAX_DOCUMENT_SIZE` da `src/lib/document-upload.ts:13`, e non ha nessun controllo MIME lato server — micro-commit separato, ancora da fare
- Le colonne di classificazione AI aggiunte nel commit 1 (`doc_type`, `classification_status`, `classification_confidence`, `extracted_metadata`, `reviewed_by`, `reviewed_at`) restano inerti: nessun file nel codice le referenzia
- Gli item "Non funziona" degli handoff precedenti (B0, bridge pulizia) restano invariati, non riaperti qui

## Prossimi passi
1. Smoke reale della route `/api/reconcile-documents` come `super_admin` autenticato, prima di considerarla affidabile
2. Micro-commit separato: migrare `src/app/(app)/documenti/actions.ts` a importare `MAX_DOCUMENT_SIZE`/`ALLOWED_DOCUMENT_MIME` da `src/lib/document-upload.ts` invece della costante inline, aggiungendo anche il controllo MIME lato server oggi assente nella PWA
3. Decidere lo scope esatto di B2 e avviarlo (Filippo ha scelto di chiudere prima questo handoff)
4. Quando si arriva a B3: wiring reale della classificazione AI sulle colonne aggiunte nel commit 1, oggi inerti
5. Decisione architetturale su `maintenance_items.template_id NOT NULL` prima di B5 (resta aperta da handoff precedenti)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Non esiste un documento di piano scritto per B1-B6 oltre ai riferimenti sparsi in `docs/fase0-fase-b-status.md` e nei commenti del codice: utile scriverlo esplicitamente a inizio B2 per evitare la stessa ambiguità di numerazione vista in B1 (il "commit 3" mai esistito come commit a sé)
- La route di riconciliazione resta pensata per essere chiamata da un browser autenticato `super_admin` (non da un job/cron con secret come `daily`): confermare che questo resti l'uso previsto, o se debba diventare un bottone in UI invece di un URL da visitare a mano

## Leggi emerse (candidate per CLAUDE.md)
Nessuna. Il criterio "route API admin-gated con service client invece di script standalone, per un'operazione manuale one-off" è la prima volta che si presenta nel progetto — un solo caso non è ancora un pattern consolidato da promuovere come legge; meglio aspettare un secondo caso analogo prima di scriverlo in CLAUDE.md.

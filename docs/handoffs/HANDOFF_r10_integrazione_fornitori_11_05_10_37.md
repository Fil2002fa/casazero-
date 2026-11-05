# Handoff — R10 integrazione fornitori (commit 7a-7c) · 05/11/2026 10:37

## Sommario
CasaZero (Next.js 15 App Router + Supabase, milestone attiva M5), R10: correzione manuale dei campi estratti dai documenti. In questa sessione è stato chiuso il commit 7 del piano, l'integrazione con la proposta fornitore delle dichiarazioni di conformità, diviso in tre commit separati (7a, 7b, 7c): la proposta usa l'impresa installatrice effettiva (correzione > verbale AI), i valori digitati a mano nel form diventano correzioni sul documento, e un avviso in DocCard segnala quando l'impresa del documento non corrisponde più al fornitore collegato. Tutto è provato dal vivo su TEST wizard A, pushato con CI verde, e i dati di prova sono stati rimossi. Resta solo il commit 6 (migrazione 049 e registro attività) più il backlog.

**Git ha vinto sull'handoff precedente:** `HANDOFF_r10_correzioni_manuali_11_02_19_23.md` diceva "commit 4-7 non iniziati", ma i commit 4 (`bac30a1`) e 5 (`4df30c6`) erano già in git dalla sera del 2/11. Quel file è stato eliminato e sostituito da questo; il piano è in `docs/handoffs/r10-piano.md`.

## Lavoro completato
- [x] Sezione "Commit 7 diviso (5/11)" e "Stato 5/11" in `docs/handoffs/r10-piano.md`
- [x] **7a** `ed2981b` — la proposta fornitore usa l'installatore effettivo (pannello e server action, un solo helper)
- [x] **7b** `96318d7` — i valori manuali diventano override sul documento, scritti prima di fornitore e collegamento; helper unico per l'upsert
- [x] **7c** `22f4634` — avviso di disallineamento impresa/fornitore in DocCard, solo super_admin, con link «Gestisci i collegamenti»
- [x] Prove dal vivo di 7a, 7b e 7c su f949ac0f (vedi "Stato attuale")
- [x] Pulizia dei dati di prova: DELETE del fornitore `816455aa-1909-4e32-8534-bfed11dbe2c5`, "Ripristina valore AI" sulle due correzioni, SELECT finale a 0
- [x] Push `4df30c6..22f4634` su `origin/main`; CI `verify` verde: run 42003487377 (success, 1m7s). La run 41503927643 (push di `4df30c6`, 2/11) risulta anch'essa success
- [x] Server sulla 3000 fermato (porta libera, verificato con `Get-NetTCPConnection`)
- [ ] **Commit 6** — migrazione 049 (CHECK di `activity_events` con `documento_corretto`), etichetta, `logActivityEvent`: non iniziato
- [ ] Pulsante «Collega {impresa effettiva} al posto di {fornitore collegato}» sull'avviso: deciso di metterlo in backlog

## File toccati
### Creati
- `docs/handoffs/HANDOFF_r10_integrazione_fornitori_11_05_10_37.md` — questo handoff.

### Modificati
- `src/lib/document-overrides.ts` — nuovi `resolveProposalInstaller` (effettivo → `resolveInstallerInput`, con `nameMissing`; fonte unica di pannello e server action) e `manualInstallerOverrides` (decide le scritture di override dai valori manuali: nome, P.IVA, P.IVA null solo se c'è una P.IVA effettiva; errori di validazione senza scritture).
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `confirmSupplierProposal` legge `document_field_overrides` col client utente (`error` destrutturato e loggato), usa l'installatore effettivo, scrive gli override col service client dopo il controllo `expected` e prima di fornitore e collegamento; ogni uscita con errore dopo gli override passa da `fail()` (rinfresca la pagina e dice che l'impresa è già salvata). Nuovo helper non esportato `upsertDocumentFieldOverride`, usato anche da `saveDocumentFieldOverride` (refactor senza cambio di output). Import di `resolveInstallerInput` tolto.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — `SupplierProposalSection` usa `resolveProposalInstaller` (niente più `extracted_metadata` diretto, `nameMissing` dall'effettivo); `DocCard` calcola `installerSupplierMismatches` da `supplierContext` e rende un blocco ambra con `installerMismatchText` e `<Link href="/admin/fornitori">Gestisci i collegamenti</Link>`; import di `next/link`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — la select di `supplier_installations` aggiunge `source_document_id`.
- `src/lib/document-classification.ts` — `installerMatchesSupplier` (P.IVA normalizzate se entrambe, altrimenti `normalizeCompanyName`; nessun avviso se manca il nome o se una chiave di nome è nulla); `SupplierInstallationRef` ha il campo opzionale `source_document_id`.
- `src/lib/document-rows.ts` — `installerSupplierMismatches(doc, installations, suppliers)` (solo collegamenti con `source_document_id = doc.id`; restituisce sistema leggibile, nome e P.IVA di fornitore e impresa) e `installerMismatchText`.
- `scripts/verify-document-overrides.mjs` — da 97 a 155 casi: sezioni 14 (proposta con impresa effettiva), 15 (valori manuali → override, incluso il caso P.IVA vuota) e 16 (avviso e testo).
- `scripts/verify-supplier-match.mjs` — da 52 a 70 casi: 18 su `installerMatchesSupplier`.
- `docs/handoffs/r10-piano.md` — sezioni "Commit 7 diviso (5/11)" e "Stato 5/11".

### Letti (solo quelli rilevanti per capire il contesto)
- `src/components/FornitoriManager.tsx` — la gestione dei collegamenti sta solo nello scope builder; lo scope residenza è in sola lettura.
- `src/app/(dashboard)/admin/fornitori/actions.ts` — `addSupplierInstallation`, `removeSupplierInstallation`, `updateSupplierAnagrafica`.
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` e `page.tsx` — `createSupplier`, `deleteSupplier`, lettura dei collegamenti.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` e `ItemConfigForm.tsx` — `maintenance_items.supplier_id` è una scelta manuale per voce, non derivata dai collegamenti.
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — conteggio fornitori (due fonti unite).
- DB (sola SELECT): `pg_constraint`, `pg_policies`, `information_schema` per FK, CHECK, policy e trigger di `suppliers` e `supplier_installations`.

## Decisioni chiave
- **Commit 7 diviso in tre**: 7a lettura dell'installatore effettivo, 7b scrittura degli override dai valori manuali, 7c avviso. Il 7a sta da solo perché il pannello e il server devono leggere la stessa impresa, o un documento corretto darebbe "La proposta è cambiata" tra i due commit. Alternativa scartata: un solo commit 7.
- **Un solo helper per l'impresa effettiva** (`resolveProposalInstaller`), usato da pannello e `confirmSupplierProposal`. Alternativa scartata: ricalcolare nei due posti, che è la classe di bug "esito letto ≠ esito ricalcolato".
- **Override scritti prima del collegamento**. "Collegamento prima, correzione dopo" è il flusso dell'utente, non l'ordine delle scritture: se il collegamento fallisce, la correzione resta (è un dato del documento) e `fail()` lo dice. Non transazionale, come il resto dell'action.
- **P.IVA manuale vuota → override null solo se oggi c'è una P.IVA effettiva** (correzione o verbale), altrimenti nessuna scrittura. Nome e P.IVA formano una coppia: a nome vuoto la proposta ignora la P.IVA del verbale, e il documento non deve continuare a mostrare in riga ed Excel la P.IVA di un'altra impresa.
- **Scrittura degli override col service client dentro `confirmSupplierProposal`** senza rifare `authorizeDocumentActor`: l'accesso al documento è già provato dalla lettura sotto RLS del super_admin del builder, e l'action è riservata al super_admin. Alternativa scartata: ripetere `authorizeDocumentActor` (query in più, nessuna garanzia in più).
- **`installerMatchesSupplier`**: con P.IVA da entrambe le parti decide la P.IVA (come `buildSupplierProposal`), altrimenti `normalizeCompanyName`. Una chiave di nome nulla ("S.r.l." da sola) o un nome mancante → nessun avviso: meglio un avviso mancato su un caso indistinguibile che rumore.
- **Testo dell'avviso senza attribuire la causa**: «Il fornitore collegato per {sistema} è {nome} (P.IVA {piva}), mentre questo documento indica {nome impresa} (P.IVA {piva impresa}).» L'avviso scatta anche quando cambia l'anagrafica del fornitore (`updateSupplierAnagrafica`), quindi "ora/non più" sarebbe falso. «senza P.IVA» se manca.
- **Link a `/admin/fornitori`, nessun pulsante di sostituzione**. La pagina Fornitori della residenza non permette di scollegare; scollegare e aggiungere esistono solo nella pagina builder, in due passaggi. Il pulsante «al posto di» è in backlog (stima media): estendere `confirmSupplierProposal` con `replacesInstallationId` validato lato server, INSERT del nuovo collegamento e DELETE del vecchio per ultimo, vecchio fornitore mai cancellato, `maintenance_items.supplier_id` non toccato (decidere se avvisare con un conteggio).
- **Avviso visibile solo al super_admin senza toccare la RLS**: `supplierContext` è null per l'admin (`page.tsx`, `builderId` solo per `super_admin`). Provato solo da codice (vedi "Non funziona / da verificare").

## Stato attuale
### Funziona
- `npm run verify` pulito (resta solo il warning preesistente in `src/app/api/reconcile-documents/route.ts:12`); `npm run verify:overrides` ✓ 155 casi; `npm run verify:match` ✓ 70 casi.
- CI su `main`: run 42003487377 success dopo il push di `22f4634`.
- Dal vivo su TEST wizard A (`8e309f07-c274-43af-b7a5-7af53fed9a51`), documento f949ac0f (`f949ac0f-ecaf-40ec-94d9-ca5faf13dc41`, DiCo elettrico):
  - 7a: salvataggio di nome e P.IVA da "Correggi dati" (P.IVA di 10 cifre → errore "11 cifre" che sparisce alla correzione); dopo il ricarico la proposta mostra l'impresa corretta senza form manuale; "Crea fornitore e collega" scrive fornitore e collegamento `elettrico` con `source = documento`.
  - 7b: baseline a 0; il form manuale compare; con 10 cifre il pulsante resta disabilitato e non si scrive nulla; con nome e P.IVA validi vengono scritte 2 righe in `document_field_overrides`, il fornitore con gli stessi valori e il collegamento; la riga mostra "Installatore: …" e "Dati corretti a mano". Controllato anche il refactor dell'upsert (salva e ripristina di un campo non correlato).
  - 7c: nessun avviso a P.IVA coincidenti; cambiando la P.IVA del documento compare l'avviso col testo esatto e il link; il collegamento resta; rimessa la P.IVA, l'avviso sparisce. Screenshot in `.screenshots/r10-commit7-avviso.png` (cartella ignorata da git).
  - Console senza errori (solo info React DevTools e un avviso a11y su campi senza `name`) e log del server pulito.
- DB dopo la pulizia: 0 override su f949ac0f, 0 collegamenti su TEST wizard A, nessun fornitore "Impianti Prova" né le P.IVA di prova in tutto il DB, Elettrica Euganea S.r.l. (`45c46a52-35f0-4eba-a240-ddb3c978f26e`) e Termotecnica Colli S.r.l. (`1c1a3c89-aa14-435b-8674-ad64f587f7c6`) intatte, 8 fornitori totali come a inizio sessione.

### Non funziona / da verificare
- **Ordine delle scritture del 7b non provato dai timestamp**: `set_at` lo scrive Node con l'orologio della macchina (almeno 6,4 s avanti rispetto al DB), `created_at` lo scrive il DB. Corretto per lo sfasamento, la ragione sociale precede il fornitore; per la P.IVA i timestamp non bastano. L'ordine è garantito dal codice (`await` degli override prima dell'INSERT del fornitore), non da una prova dal vivo.
- **Vista admin dell'avviso non provata dal vivo**: il gate sul ruolo è solo nel codice (`supplierContext` null per l'admin). Nessun login come admin in sessione.
- **Rami di errore non provati**: fallimento della scrittura di un override (anche a metà, con una sola riga scritta), ramo server con P.IVA di 10 cifre (il client lo blocca, coperto solo dallo script), fallimento del collegamento dopo gli override (`fail()`).
- **Excel e PWA residente** con l'installatore corretto a mano non riverificati in questa sessione (la riga a schermo sì); usano lo stesso loader.
- **`page.tsx` scarta `error`** nella select di `supplier_installations` (e dei fornitori) di `documenti/page.tsx`: `{ data: rawInstallations }` senza `error`. Preesistente, segnalato e non assorbito: viola la regola "mai scartare `error`" di CLAUDE.md, da correggere in un commit a parte.
- Le scritture di override non sono ancora registrate in `activity_events` (commit 6), né quelle di "Correggi dati" né quelle di `confirmSupplierProposal`.

## Prossimi passi
1. **Commit 6**: migrazione 049 (come da piano; l'ultima in `supabase/migrations/` è `048_document_field_overrides.sql`, ricontrollare prima di numerarla) che allarga il CHECK di `activity_events` con `documento_corretto` (DROP/ADD nella stessa migrazione, con tutti i 9 tipi esistenti; ripetere la SELECT che nessuna riga lo violi). Mostrare il SQL prima, riga in `docs/migrations.log`, aggiornare l'union `ActivityEventType` in `src/types/database.ts`, l'etichetta in /attivita e chiamare `logActivityEvent` in `saveDocumentFieldOverride`, `clearDocumentFieldOverride` **e** `confirmSupplierProposal` (override scritti da lì). Verifica: `pg_get_constraintdef`, una correzione, pagina /attivita.
2. **Correggere la lettura senza `error`** in `documenti/page.tsx` (select dei fornitori e dei collegamenti): commit separato, con messaggio all'utente che distingua "nessun dato" da "errore, riprova".
3. **Decidere sul pulsante «al posto di»** (backlog): se farlo, prima FASE 0 sul come trattare `maintenance_items.supplier_id` del vecchio fornitore (lasciarlo, con un conteggio nella conferma, o proporre il cambio) e sul caso `gia_collegato`.
4. **R10b**: rendere correggibili anche i documenti senza estrazione corrente (decisione del 2/11 ancora aperta).
5. Provare dal vivo, quando serve un login admin, che l'avviso non compaia per `filippoloro02`.
6. Ricostruire `docs/migrations.log` per le migrazioni 001-047 (lavoro separato, R8d).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra separata). Per fermarlo davvero non basta
# chiudere il task: verificare la porta e fermare il PID figlio di Next.
npm run dev
# PowerShell: Get-NetTCPConnection -LocalPort 3000 -State Listen

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify

# Verifiche delle funzioni pure (Node 22.x: usare sempre gli script npm, mai node nudo)
npm run verify:overrides   # 155 casi
npm run verify:match       # 70 casi
npm run verify:export
npm run verify:extraction

# CI
gh run list --limit 1
```

Note operative della sessione: `take_screenshot` non sovrascrive un file esistente (rimuoverlo prima); dopo ogni refresh della pagina gli uid dello snapshot del browser cambiano; dopo un click su un'azione server aspettare che il pulsante torni normale prima di fare la SELECT di verifica (una SELECT immediata può leggere lo stato precedente).

## Domande aperte
- **Pulsante «al posto di»**: farlo o tenere solo il link? Se sì, cosa fare delle voci del piano (`maintenance_items.supplier_id`) che puntano al vecchio fornitore.
- **R10b**: sintetizzare una riga di estrazione dalle sole correzioni o forzare prima l'estrazione.
- **Numerazione del commit 6**: il piano prevede la 049 e l'ultima in `supabase/migrations/` è la 048; `list_migrations` del server MCP mostra però solo alcune migrazioni (le altre sono state applicate dal SQL Editor), quindi controllare anche lo storico reale prima di numerare.
- **Branch locale `fix/sicurezza-accesso`**: esiste ancora e non è chiaro se sia già integrato in `main`. Non toccato.
- **Guard DB sul write-once dei verbali AI**: backlog P2, fuori scope R10.

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: Quando una superficie mostra un esito e un'altra lo ricalcola prima di scrivere (pannello e server action), gli INPUT dell'esito, non solo la funzione di decisione, passano da un helper condiviso. Per l'impresa installatrice di una DiCo la fonte è `resolveProposalInstaller` in `src/lib/document-overrides.ts` (correzione > verbale): nessuna superficie legge `extracted_metadata.ragione_sociale_installatore` o `partita_iva_installatore` per decidere chi è l'impresa. Se i due lati leggono input diversi, l'utente vede "La proposta è cambiata" per un documento corretto.
- **Regole di codice**: Un avviso di disallineamento dice COSA è diverso (i due valori affiancati) e mai la causa, quando più cause portano allo stesso stato. L'avviso impresa/fornitore di DocCard scatta sia per una correzione del documento sia per una modifica dell'anagrafica del fornitore: niente "ora", "non più" o "è cambiato".
- **Metodo di lavoro**: Non provare l'ordine di due scritture confrontando timestamp prodotti da orologi diversi (`set_at` scritto da Node, `created_at` scritto dal DB: sfasamento misurato di almeno 6,4 s). Misurare prima lo sfasamento, oppure provare l'ordine dal codice (sequenza di `await`) e dichiarare nel rapporto cosa è provato e cosa no.
- **Metodo di lavoro**: Nelle prove dal vivo, dopo l'azione che scrive aspettare che l'interfaccia segnali il completamento prima della SELECT di verifica: una SELECT lanciata subito dopo il click ha letto due volte lo stato precedente (1 override invece di 0, 0 righe invece di 1).
- **Metodo di lavoro**: Il DELETE dei dati di prova si mostra prima e si esegue solo dopo un ok esplicito, con `WHERE` su id e attributi di riconoscimento (nome, P.IVA, residenza) e `RETURNING`. Prima si controllano in sola lettura le FK verso la tabella (cascata e no), le righe collegate in altre residenze e le voci che la referenziano; dopo si lancia una SELECT finale che mostra anche i dati preesistenti intatti.

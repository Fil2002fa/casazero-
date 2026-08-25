# Handoff — Chiusura FASE B3 (Categorizzazione AI documenti) · 22/07/2026 16:51

## Sommario
B3 chiude il flusso di classificazione AI dei documenti di consegna: upload multiplo PDF → chiamata LLM (Sonnet 5, structured output) che assegna un `doc_type` con confidenza e lo instrada a una coda di revisione umana quando la confidenza è bassa o il file non è un PDF. Implementata in 6 commit sequenziali (uno per concern, `tsc --noEmit` verde e diff approvato prima di ciascuno), preceduti da una FASE 0 di diagnosi read-only e da tre indagini read-only intermedie nate da anomalie emerse durante gli smoke. Smoke finale tutto verde su 5 PDF realistici + casi limite; budget API chiuso con numeri reali. Cambiamento infrastrutturale rilevante avvenuto in parallelo: il progetto è ora deployato su Vercel con auto-deploy su `main`.

## Lavoro completato
- [x] FASE 0 diagnosi read-only B3 (aggancio flusso, lettura storage, stato `classification_status`, curation `doc_type`, coda revisione, errori/retry, stima costi, RLS scritture, micro-commit preliminare) — presentata e approvata
- [x] Commit 1 (`fcc940c`): micro-fix PWA upload — `MAX_DOCUMENT_SIZE` condiviso + check MIME server-side con `ALLOWED_DOCUMENT_MIME`
- [x] Commit 2 (`27051ca`): costante `doc_type` (8 valori) + mapping `doc_type→category` + etichette IT + soglia confidenza, in `src/lib/document-classification.ts`
- [x] Commit 3 (`6654b38`): migrazione `025` — 5° stato `da_revisionare` su `classification_status`. **Applicata da Filippo e verificata**, footer ESITO REALE compilato con l'output delle 4 query
- [x] Commit 4 (`7873d4d`): route `/api/classify-document` (Sonnet 5, structured output, prompt caching sul prefix di sistema, thinking disabilitato, `maxRetries` SDK = 1, `maxDuration = 120`) + loop batch client-side sequenziale nella pagina documenti dashboard
- [x] Commit 4b (`e4c044b`): guard magic bytes `%PDF` prima della chiamata API — file non-PDF → `da_revisionare` a costo zero (fix nato dallo smoke)
- [x] Commit 5 (`47787c2`): UI coda revisione + conferma umana — badge stato su ogni card, chip "Da rivedere", pannello con select di correzione, `confirmClassification` che scrive `reviewed_by`/`reviewed_at` server-side
- [x] `/impeccable audit` sul commit 5 (17/20 Good, nessun P0/P1) + fix P2 `aria-label` applicato prima del commit
- [x] Smoke finale di Filippo: 5/5 PDF classificati correttamente, caso non-PDF gestito, conferma umana verificata a DB
- [x] Budget API chiuso con numeri reali dal campo `usage`

## File toccati
### Creati
- `src/lib/document-classification.ts` — fonte unica tassonomia classificazione: tipo `DocType` (8 valori), `DOC_TYPES`, `DOC_TYPE_LABELS` (IT), `DOC_TYPE_TO_CATEGORY` (mapping informativo, `altro→null`), `CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8`, tipo `ClassificationStatus` (5 stati)
- `src/app/api/classify-document/route.ts` — POST, un documento per invocazione, service role + scoping builder (pattern di `reconcile-documents`/`fascicolo-pdf`), download PDF → base64 → Anthropic → transizione di stato request-scoped. `runtime='nodejs'`, `maxDuration=120`. Guard size 32MB e guard magic bytes `%PDF`
- `supabase/migrations/025_documents_classification_status_review.sql` — drop+ricrea CHECK `classification_status` con 5 valori; footer ESITO REALE compilato

### Modificati
- `src/app/(app)/documenti/actions.ts` — `uploadDocument`: `52428800` → `MAX_DOCUMENT_SIZE`, aggiunto check `ALLOWED_DOCUMENT_MIME`
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — `.select()` estesa con `classification_status`, poi `doc_type, classification_confidence, extracted_metadata`
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — nuova server action `confirmClassification`: valida `doc_type`, scrive `doc_type`+`completata`+`reviewed_by=auth.uid()`+`reviewed_at=now()` via client scoped-utente (RLS), gestisce riga filtrata da RLS
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — `DocRow` esteso; `handleClassify` (loop sequenziale, mai `Promise.all`, progress "N di M"); bottone "Classifica documenti (N)"; chip filtro "Da rivedere"; `classificationBadgeInfo` (helper fonte unica label+colore); `ClassificationBadge`; `ReviewPanel` (proposta AI in sola lettura + select correzione + conferma)
- `package.json` / `package-lock.json` — dipendenza `@anthropic-ai/sdk` `^0.112.4`

### Letti (rilevanti per il contesto)
- `docs/handoffs/HANDOFF_b2_wizard_documenti_07_21_01_47.md` — stato B2 chiuso, backlog ereditato
- `supabase/migrations/024_documents_ai_classification_columns.sql` — colonne inerti + legge "categoria dal DB/path congelato, mai riscritta"
- `supabase/migrations/022_storage_documents_scoped_rls.sql` / `002_rls.sql` — policy scrittura `documents` (super_admin del builder; nessuna per residente)
- `src/lib/supabase/admin.ts`, `src/lib/notifications.ts` — pattern service role e lettura `process.env` (per `ANTHROPIC_API_KEY`)
- `src/middleware.ts`, `src/app/(app)/layout.tsx`, `src/lib/auth.ts` — diagnosi read-only irraggiungibilità upload PWA
- `DESIGN.md` — Regola delle Due Generazioni (colori) per la scelta del token badge

## Decisioni chiave
- **5° stato via migrazione, non riuso di `fallita`**: `da_revisionare` (bassa confidenza / file non classificabile automaticamente → decisione umana) e `fallita` (errore tecnico ritentabile) hanno workflow e UI diversi; schiacciarli in uno solo li avrebbe resi indistinguibili. Migrazione `025`, additiva.
- **Modello `claude-sonnet-5`** (non `claude-sonnet-4-6` come nella lettera del prompt): è l'ID Sonnet corrente; 4.6 è la generazione precedente. Segnalato in sessione.
- **`maxRetries` SDK = 1 invece di retry manuale**: l'SDK Anthropic fa già un retry con backoff su 429/5xx; passare `{ maxRetries: 1 }` dà la garanzia richiesta ("un retry singolo, poi `fallita`") senza duplicare logica.
- **Loop batch client-side sequenziale**: un documento per invocazione HTTP (`for...of`, mai `Promise.all`), disaccoppiato da `confirmDocument`; un fallimento non ferma il batch. Evita di legare la latenza LLM al percorso critico dell'upload e rispetta i limiti di durata Vercel.
- **Guard magic bytes `%PDF`**: la route hardcoda `media_type: 'application/pdf'` ma `ALLOWED_DOCUMENT_MIME` ammette immagini/Word; senza guard un file non-PDF andrebbe in `fallita` irrecuperabile bruciando costo API a ogni retry. Verifica dei bytes reali, non del MIME dichiarato.
- **`reviewed_by`/`reviewed_at` solo server-side**: `confirmClassification` è l'unico punto che li scrive, con `auth.uid()`+`now()`, mai da valori passati dal client (decisione #7: l'AI propone, l'umano decide).
- **Token badge `status-inprogress` per "Da rivedere"** (riuso confermato da Filippo): la Regola delle Due Generazioni (DESIGN.md) vieta `semantic-*` ai componenti nuovi; `status-inprogress` è l'unica ambra di 2ª generazione disponibile senza introdurre un token nuovo (che sarebbe scope creep + update DESIGN.md).

## Stato attuale
### Funziona
- B3 chiuso: 6 commit (`fcc940c`, `27051ca`, `6654b38`, `7873d4d`, `e4c044b`, `47787c2`), `tsc --noEmit` verde su ciascuno, `npm run build` verde, working tree pulito
- Migrazione `025` applicata e verificata a runtime (4 query nel footer)
- Smoke finale: 5/5 PDF realistici con `doc_type` corretto — `dich_conformita_dm37` 0.98 · `ape` 0.99 · `manuale` 0.98 · `garanzia` 0.97 · `altro` 0.98. Due casi critici superati: un volantino non è stato forzato in categoria edilizia; la garanzia non si è confusa
- Caso non-PDF (`.jpg`) → `da_revisionare` via guard magic bytes, **zero costo API**
- Conferma umana: correzione `doc_type` da select → `reviewed_by`/`reviewed_at` popolati server-side, status resta `completata`. Verificato a DB
- **Budget API chiuso con numeri reali**: ~2.900 token input per PDF di 1 pagina, output poche centinaia → ~$0,01 a documento/pagina con Sonnet 5. Un documento reale da 20 pagine ≈ $0,10–0,15, dentro la stima FASE 0

### Non funziona / da verificare
- **Soglia confidence 0.8 mai esercitata**: in tutti i test le confidence sono uscite 0.97–0.99, quindi il ramo `da_revisionare` per bassa confidenza non è mai scattato. Da osservare su documenti reali (scansionati, sporchi, ambigui) prima di considerare la soglia tarata
- **Upload PWA irraggiungibile da ogni ruolo** (ereditato, non un bug B3): `src/app/(app)/layout.tsx:12` rediretta admin/super_admin fuori dalla shell `(app)`, mentre il residente ha `canUpload=false` in `documenti/page.tsx`. La superficie `UploadDocumentForm`→`uploadDocument` non è testabile da UI. Verificato con prove in sessione
- **Refuso UI "documentoi"** nella pagina documenti — non toccato in B3

## Prossimi passi
1. **Pulizia Cavaccio prima della demo-film**: rimuovere i detriti di test (`test-grande`, `Resume`, `Residenze_super_admin`, i 5 PDF finti, il `.jpg`) dal bucket e dalla tabella `documents`
2. **Micro-commit refuso**: "documentoi" → "documenti" nella pagina documenti
3. **Micro-commit filtro per `doc_type`**: oggi i chip filtrano solo per `category`; le etichette `doc_type` non sono navigabili
4. **Osservare la soglia 0.8 su documenti reali** difettosi/ambigui per validare che `da_revisionare` scatti quando deve
5. **Decisione di prodotto post-B3**: upload PWA — dare accesso admin alla shell `(app)` oppure smontare `UploadDocumentForm`/il branch `canUpload`
6. **Pass tipografico P3** (in un commit dedicato, tocca anche il badge categoria pre-esistente): badge `text-[10px]` → 12px (DESIGN.md micro) · target touch del toggle "Rivedi classificazione" < 44px

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (verifica reale del bfcache e delle route API)
npm run build && npm start
```

## Domande aperte
- **Branch/deploy**: il branch locale è `master`, ma l'auto-deploy Vercel è su `main` (`origin/main`); il locale è avanti di 14 commit rispetto a `origin/main`. Da chiarire come/quando questi commit finiscono su `main` (merge/push) dato che ogni push su `main` va online da solo — `main` va tenuto sempre in stato mostrabile
- Haiku vs Sonnet: la decisione FASE 0 era "Sonnet ora, Haiku rivalutabile coi dati della coda revisione". Con confidence sempre 0.97–0.99 e costo ~$0,01/pagina, la rivalutazione Haiku resta aperta ma non urgente
- Cleanup orfani storage (file senza riga `documents`, e ora eventuali righe `da_revisionare` per skip): `/api/reconcile-documents` resta lo strumento diagnostico, la pulizia è manuale

## Cambiamento di stato infrastrutturale (nuovo in questa sessione)
Il progetto è ora collegato a **Vercel** (piano Hobby, Fluid Compute attivo): dominio `casazero.vercel.app`. **Ogni push su `main` fa un deploy automatico in produzione.** Env configurate su Vercel: Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`. Supabase Auth URL Configuration aggiornata: Site URL = dominio Vercel; redirect list contiene sia Vercel sia localhost. **Conseguenza operativa nuova: `main` va tenuto sempre in stato mostrabile, perché va online da solo.**

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `doc_type è informativo: la classificazione AI non riscrive MAI documents.category né il path storage. La categoria resta quella dell'upload originale, congelata nel path; la fonte di verità per la categoria è sempre la colonna documents.category. doc_type e il mapping doc_type→category vivono in un'unica costante TS (src/lib/document-classification.ts). Questa estende al flusso di classificazione AI la legge già stabilita dalla migrazione 024.`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `classification_status ha 5 stati con semantica distinta e non sovrapponibile: non_classificato · in_corso · completata · da_revisionare · fallita. da_revisionare = classificato ma richiede decisione umana (bassa confidenza o file non classificabile automaticamente); fallita = errore tecnico ritentabile (timeout, schema non conforme, API down). Non schiacciarli mai in uno solo: hanno workflow e UI diversi.`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `Mai la parola "fallita" (né linguaggio di scadenza) nella UI di classificazione, coerente con l'invariante promemoria: da_revisionare → "Da rivedere", fallita → "Errore, riprova". Il fascicolo è un documento istituzionale, non deve esporre linguaggio di fallimento tecnico all'utente.`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `Prima di una chiamata LLM costosa su un file, validare i bytes reali (magic bytes, es. %PDF per un PDF), non fidarsi del MIME dichiarato all'upload. Il bucket documents ammette anche immagini/Word (ALLOWED_DOCUMENT_MIME): un file non-PDF inviato con media_type application/pdf produce un 400 dall'API a ogni tentativo, bruciando costo e lasciando uno stato di errore irrecuperabile. Il file non-PDF va instradato a revisione manuale senza chiamare l'API.`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `reviewed_by/reviewed_at si scrivono SOLO server-side dal flusso di conferma umana della classificazione (auth.uid() + now()), mai da valori passati dal client. La server action confirmClassification è l'unico punto che li scrive. L'AI propone, l'umano decide.`

- **Sezione CLAUDE.md di destinazione: Metodo di lavoro / Comandi**:
  `Il progetto è deployato su Vercel (Hobby, Fluid Compute) con auto-deploy: ogni push su main va online da solo su casazero.vercel.app. main va tenuto sempre in stato mostrabile. Le env di produzione (incluse ANTHROPIC_API_KEY e SUPABASE_SERVICE_ROLE_KEY) sono su Vercel, mai committate. Route con chiamate LLM/PDF: runtime='nodejs' + maxDuration esplicito (es. 120).`

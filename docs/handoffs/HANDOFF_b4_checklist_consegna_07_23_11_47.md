# Handoff — B4 Rilevamento documenti mancanti (commit 1-3 + bugfix) · 23/07/2026 11:47

## Sommario
B4 costruisce il rilevamento deterministico dei documenti di consegna mancanti (atteso − presente − non applicabile), senza AI: l'AI ha già fatto il suo lavoro in B3. In questa sessione, dopo una FASE 0 di diagnosi read-only approvata, sono stati chiusi i commit 1 (allargamento tassonomia `doc_type`), 2 (colonna `sistema` come verità confermata + relativo bugfix in ReviewPanel) e 3 (tabelle checklist + seed dello strato BASE). Restano il commit 4 (helper di calcolo + mappa derivata) e il commit 5 (UI).

## Lavoro completato
- [x] FASE 0 diagnosi read-only B4 (tassonomia, `extracted_metadata`, aggancio scope, piano manutenzioni, stati documento, gap tassonomia, precedenti) — presentata e approvata
- [x] **Commit 1** (`4f569e6`, B4 C1): 10 nuovi `doc_type` in `src/lib/document-classification.ts` (union + array + labels + mapping categoria) + distinzione libretto/manuale nel prompt della route AI
- [x] **Commit 2** (`bce4e26`, B4 C2): migrazione `026` colonna `documents.sistema` (verità confermata) + scrittura in `route.ts` + `confirmClassification` accetta `sistema` + controllo `sistema` in ReviewPanel
- [x] **Bugfix Commit 2** (`1471bea`, B4 C2): ReviewPanel distingue verbale AI (`extracted_metadata`) da verità confermata (colonna). Risolti BUG 1 (blocco "Proposta AI" mostrava la correzione umana) e BUG 2 (correzione del `doc_type` azzerava un `sistema` confermato)
- [x] **Commit 3** (`e2ec8c1`, B4 C3): migrazione `027` — tabelle `document_checklist_template` + `residence_checklist_exception`, RLS, seed strato BASE (11 righe), `NOTIFY pgrst`
- [x] Migrazioni `026` e `027` **applicate da Filippo e verificate** (footer ESITO REALE compilato con output reale)
- [x] Test schema-cache PostgREST superato: ri-classificazione dei documenti Cavaccio → `sistema` popolato (garanzia|termico, dich_conformita_dm37|elettrico, manuale|vmc)
- [x] `/impeccable audit` sul controllo `sistema` di ReviewPanel (18/20) + polish (etichette visibili `<label htmlFor>`)

## File toccati
### Creati
- `supabase/migrations/026_documents_sistema_column.sql` — colonna `documents.sistema` TEXT nullable, no CHECK; backfill da `extracted_metadata->>'sistema'`; footer ESITO REALE. **Applicata.**
- `supabase/migrations/027_document_checklist.sql` — `document_checklist_template` (BASE versionato, unico di sistema) + `residence_checklist_exception` (eccezioni per residenza, `UNIQUE NULLS NOT DISTINCT`), RLS coerente con 002, seed 11 righe, `NOTIFY pgrst`, footer ESITO REALE. **Applicata.**

### Modificati
- `src/lib/document-classification.ts` — +10 `DocType` (libretto_impianto, as_built, planimetria_catastale, piano_manutenzione_opera, cert_linee_vita, regolamento_condominiale, tabelle_millesimali, polizza_decennale, elenco_fornitori, schede_materiali) su union/`DOC_TYPES`/`DOC_TYPE_LABELS`/`DOC_TYPE_TO_CATEGORY`. Fonte unica: nessun consumer da toccare (verificato)
- `src/app/api/classify-document/route.ts` — distinzione libretto/manuale nel prompt (C1) + `sistema: parsed.sistema` nell'UPDATE di successo (C2). **Corretta: dimostrato in FASE 0 che il difetto `sistema` NULL era schema-cache, non codice**
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `confirmClassification` accetta `sistema: Sistema | null`, lo valida su `SISTEMI`, lo scrive in colonna; non tocca `extracted_metadata`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — controllo `sistema` in ReviewPanel; tipo `ClassificationMetadata` esteso con `doc_type`/`confidence`; `DocRow` + colonna `sistema`; blocco "Proposta AI" legge solo il verbale; select di modifica precompilati dalla colonna con fallback al verbale
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — `.select()` estesa con `sistema` (plumbing per portare la verità confermata al componente)

### Letti (rilevanti per il contesto)
- `docs/handoffs/HANDOFF_b3_classificazione_ai_07_22_16_51.md` — stato B3 chiuso, ereditato
- `docs/catalogo-manutenzioni-v2.md` — 19 voci attive, base per la futura mappa derivata (commit 4)
- `supabase/migrations/001_schema.sql`, `002_rls.sql`, `011_catalogo_v2_columns.sql`, `024_documents_ai_classification_columns.sql` — schema `documents`/`maintenance_*`, helper RLS (`czero_user_role`, `czero_user_builder_id`, `czero_can_access_residence`), pattern policy

## Decisioni chiave
- **`sistema` come colonna dedicata (Opzione B), non merge in `extracted_metadata`**: la verità confermata dell'impianto vive in `documents.sistema` (normalizzata, su cui B4 farà il match); `extracted_metadata` resta il verbale immutabile della proposta AI. Dopo una correzione umana i due possono divergere ed è corretto che divergano. Scartata l'Opzione A (merge nel jsonb) perché mescolava proposta e verità confermata.
- **Il difetto `sistema` NULL NON era in route.ts**: FASE 0 ha provato che la colonna e `extracted_metadata` attingono dallo stesso `parsed`, quindi il codice non può scrivere l'una e non l'altra in un UPDATE atomico. Causa reale: PostgREST scartava silenziosamente la colonna assente dalla sua schema-cache (migrazione applicata pochi minuti prima). Nessun fix di codice; risolto con `NOTIFY pgrst, 'reload schema'` + ri-classificazione.
- **ReviewPanel: verbale vs verità confermata** (bugfix): il blocco "Proposta AI" legge SEMPRE E SOLO `extracted_metadata`; i select di modifica leggono la colonna (verità confermata) con fallback al verbale. Regola incisa come commento nel componente per non riaprirla.
- **Scope della checklist a 4 valori, 3 usati in v1**: `condominium` / `residence` / `dossier_admin` attivi; `unit` nello schema ma non usato (risoluzione per-unità rimandata a B4.5, con APE e planimetria catastale). `residence_checklist_exception.unit_id` resta ma in v1 è sempre NULL.
- **`UNIQUE NULLS NOT DISTINCT`** sulla tabella eccezioni: con `unit_id` NULL (caso v1) una UNIQUE standard ammetterebbe duplicati (NULL≠NULL). PG 17.6 supporta NULLS NOT DISTINCT, che tratta i NULL come uguali e blocca i duplicati.
- **Chiave canonica `expectation_key`** = `scope:doc_type:coalesce(sistema,'')`: usata dal commit 4 per fondere BASE e DERIVATO (contano una volta sola) e come join verso le eccezioni. Documentata nell'header della 027.
- **RLS nel file della migrazione della tabella**: una tabella nuova senza RLS è un buco dal momento della creazione. Template leggibile da ogni autenticato; eccezioni gestite (ALL) dal super_admin del builder proprietario. Modellate su `002_rls.sql`.

## Stato attuale
### Funziona
- Commit 1-3 + bugfix su `master`, tutti pushati su `origin/main` TRANNE il commit 3 (`e2ec8c1`, vedi sotto). `tsc --noEmit` verde su ciascuno
- Migrazioni `026` e `027` applicate e verificate a runtime (footer reali)
- Tassonomia `doc_type` a 18 valori, propagata automaticamente a prompt AI, schema structured output, chip filtro, select di correzione (tutti leggono `DOC_TYPES`/`DOC_TYPE_LABELS`)
- Colonna `documents.sistema` scritta dalla route AI (cache ricaricata) e impostabile/correggibile da ReviewPanel senza perdere il valore confermato
- Tabelle checklist + 11 righe di seed BASE in DB con RLS attiva

### Non funziona / da verificare
- **Commit 3 (`e2ec8c1`) NON è pushato su `origin/main`**: la 027 è già applicata in DB, il push del file non ha impatto funzionale (nessun codice), ma `main` è indietro di 1 commit. Da pushare quando si vuole allineare
- **Nessun calcolo/UI di completezza ancora**: commit 4 (helper) e 5 (UI) non iniziati. Le tabelle esistono ma niente le legge
- **2 documenti skip/non-PDF Cavaccio** restano con `sistema=NULL`: non passano dall'AI, vanno sistemati a mano da ReviewPanel (comportamento voluto)
- **`unit_id` reale sui documenti**: 15/18 documenti caricati come condominio anche quando riguardano un'unità → completezza per-unità inaffidabile (motivo per cui `unit`/APE/planimetria sono rimandati a B4.5)

## Prossimi passi
1. **Push del commit 3** su `main` per allineare (o consolidarlo col push del commit 4)
2. **Commit 4 — helper di calcolo + mappa derivata**: `src/lib/document-checklist.ts`, `computeResidenceChecklist(residenceId)` server-side, fonte unica per contatore E lista (bug class nota). Legge `document_checklist_template` (BASE) + deriva le attese dagli impianti presenti (voci di piano `activation_status='inclusa'`, join a `maintenance_templates` via `template_id` UUID — l'unico identificatore stabile, non il titolo). Match presente per scope (condominium→unit_id NULL, residence→qualunque, dossier_admin→come condominium) leggendo `documents.sistema` (mai `extracted_metadata`). Anti-dup via `expectation_key`. Sottrae le eccezioni `not_applicable`
3. **Commit 5 — UI**: superficie costruttore che mostra atteso/presente/mancante, raggruppata per scope (con blocco `dossier_admin` separato), con azione "segna non applicabile" + campo "atteso da"
4. **Definire la mappa `template_id → attese documentali`** (input al commit 4): es. pompa di calore `fc529672…` → {libretto_impianto, dich_conformita_dm37} sistema termico; FV `7296f859…` → {dich_conformita_dm37} fotovoltaico; linee vita `1fd67a1e…` → {cert_linee_vita}. Solo dai 19 del catalogo; proposte B5 fuori catalogo non generano attese in v1
5. **Decidere "presente" = `completata` o solo `reviewed_by IS NOT NULL`**: tensione nota (B3 auto-conferma alta confidenza senza umano). Da chiudere prima o durante il commit 4

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

Test schema-cache già superato; se servisse ripeterlo su Cavaccio (`45196dac-bd81-4368-9452-1c066652e464`): `NOTIFY pgrst, 'reload schema';` → reset con guardia `reviewed_by IS NULL AND classification_status IN ('completata','fallita')` → bottone "Classifica documenti (N)" → verifica `SELECT doc_type, sistema, count(*)`.

## Domande aperte
- **"Presente" nel match B4**: `classification_status='completata'` (include l'auto-AI) o solo `reviewed_by IS NOT NULL` (solo confermati da umano)? Decisione di prodotto ancora aperta
- **Granularità per-unità (B4.5)**: quando si aggancia il vero `unit_id` all'upload, così `unit`/APE/planimetria diventano affidabili
- **Push cadence su `main`**: ogni push deploya in produzione (Vercel); tenere `main` sempre mostrabile. Commit 3 in attesa di push

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `Ogni migrazione che aggiunge una colonna o una tabella deve chiudersi con NOTIFY pgrst, 'reload schema'; prima che giri codice che vi scrive. PostgREST scarta SILENZIOSAMENTE le colonne non presenti nella sua schema-cache: nessun errore, dato perso, stato apparentemente riuscito (extracted_metadata scritta, colonna nuova NULL). Sintomo tipico: la colonna resta NULL mentre altre colonne dello stesso UPDATE passano. Non è un bug del codice applicativo: prima di indagare il codice, sospettare la schema-cache.`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `documents.sistema è la verità confermata dell'impianto (colonna normalizzata, la legge il match B4); extracted_metadata.sistema/doc_type sono il VERBALE immutabile della proposta AI. Dopo una correzione umana i due divergono ed è corretto. Nella UI di revisione (ReviewPanel): il blocco "Proposta AI" legge SEMPRE E SOLO extracted_metadata (mai la colonna, altrimenti attribuisce all'AI la correzione umana); i select di modifica leggono la colonna (verità confermata) con fallback al verbale solo quando la colonna è NULL (precompilare dal verbale sovrascriverebbe una correzione umana al submit).`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `Vincoli UNIQUE su colonne nullable: in Postgres NULL≠NULL, quindi UNIQUE (a, b, nullable_col) NON impedisce duplicati quando nullable_col è NULL. Se il caso a regime ha quella colonna NULL, usare UNIQUE NULLS NOT DISTINCT (PG15+, il DB è 17.6) o un indice parziale, altrimenti l'anti-duplicazione è illusoria.`

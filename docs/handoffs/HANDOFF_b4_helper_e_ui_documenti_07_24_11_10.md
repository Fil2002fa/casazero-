# Handoff — B4 helper checklist + ciclo fix UI dashboard documenti · 24/07/2026 11:10

## Sommario
Chiuso il commit 4 di B4 (`computeResidenceChecklist`, l'helper server-side che calcola la checklist di consegna in modo deterministico), verificato a fondo con ricostruzione SQL indipendente. Poi un ciclo di 4 fix UI + polish sulla dashboard documenti (badge impianto, CTA conferma, azione rivedi, filtro tipo a tendina con rimozione del filtro categoria). Tutto verificato (`tsc` verde, audit 18/20), committato e pushato su `main`. Resta il commit 5 di B4 (la UI che consuma l'helper) — è il prossimo pezzo grosso.

## Lavoro completato
- [x] **B4 C4** (`fa71727`): `src/lib/document-checklist.ts` — `computeResidenceChecklist(supabase, residenceId)`, unico helper server-side. BASE (template) + DERIVATO (mappa `template_id`→attese) + merge anti-dup per `expectation_key` + eccezioni + match documenti + `counts` con reduce sullo stesso array. Verifica di chiusura: ricostruzione SQL indipendente su Cavaccio (19 attese, 6 satisfied) coincidente con l'helper; casi anti-dup confermati (elettrico `both`; VMC "2 non 4" su Arcella)
- [x] **chore** (`29b59c7`): tracciato `supabase/maintenance/reconcile_documents_storage.sql` (era untracked da inizio sessione — script diagnostico read-only B1, roba da tenere)
- [x] **FASE 0** diagnosi UI dashboard documenti (7 punti) — presentata e approvata
- [x] **Fix A** (`89222b7`): badge card legge SOLO `doc.sistema` (colonna confermata), niente fallback al verbale (era codice morto + faceva riapparire proposte AI rifiutate). Verificato con query: 0 documenti auto-confermati con colonna NULL e verbale valorizzato
- [x] **Fix B** (`54bee5f`): "Conferma classificazione" resa CTA primaria (`py-2.5`, `shadow-sm`, `active:scale`)
- [x] **Fix C** (`82494bb`): "Rivedi classificazione" da link testuale a bottone secondario con chevron rotante, `h-9`
- [x] **Fix D** (`ccb7162`): filtro tipo documento da riga di chip a `<select>` nativo compatto sulla riga della ricerca, larghezza fissa `w-[200px] truncate` (no layout-shift); rimosso il filtro categoria dalla dashboard (asse ridondante); "Da rivedere" ricollocato come controllo dedicato accanto alla ricerca; rimosso il componente orfano `CategoryChip`
- [x] **Polish** (`9751b24`): `aria-label="Azzera filtri"` sul reset ✕ + `focus-visible:ring` su "Da rivedere" e ✕ (rilievi P2/P3 dell'audit)
- [x] `/impeccable audit` sulla zona filtri: 18/20, P2/P3 risolti
- [x] Tutti i commit pushati su `main` (produzione Vercel), `origin/main` allineato

## File toccati
### Creati
- `src/lib/document-checklist.ts` — helper checklist B4 (tipi `ChecklistExpectation`/`ChecklistResult`, `DERIVED_MAP` su UUID, `computeResidenceChecklist`)

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — badge card (`classificationBadgeInfo` legge `doc.sistema`); CTA conferma; bottone rivedi (import `ChevronDown`); filtro tipo → `<select>` + rimozione filtro/stato categoria (`catFilter`) e componente `CategoryChip`; "Da rivedere" come controllo dedicato; polish a11y
- `supabase/maintenance/reconcile_documents_storage.sql` — solo tracciato (contenuto invariato)

### Letti (rilevanti)
- `supabase/migrations/027_document_checklist.sql`, `002_rls.sql`, `022_storage_documents_scoped_rls.sql`, `001_schema.sql` — schema/RLS checklist e documents
- `src/lib/maintenance-status.ts` (`isCountable`, `LIVE_STATUS_FIELDS`), `src/app/(app)/manutenzioni/page.tsx` — forma canonica lettura piano attivo
- `src/lib/document-classification.ts`, `src/app/api/classify-document/route.ts`, `src/app/(app)/documenti/page.tsx` — tassonomia, scrittura colonne, uso di `category` nella PWA residente

## Decisioni chiave
- **Helper checklist: client come parametro, non service client interno**: `computeResidenceChecklist(supabase, residenceId)`; le pagine passano il client user-scoped (RLS fa lo scoping). `counts` derivati dallo stesso array `expectations` con reduce (bug class contatore/lista).
- **Mappa derivata su `template_id` UUID, mai sui titoli**: in FASE 0 solo 2/7 titoli attesi combaciavano col DB (i titoli sono descrizioni editabili). La mappa hardcoda gli UUID; una guardia mette un warning se un UUID sparisce dal catalogo attivo.
- **Badge card = colonna, non verbale (Fix A)**: query provata che i documenti auto-confermati hanno sempre la colonna scritta dalla route; il fallback al verbale era codice morto e dannoso (riesumava una proposta AI rifiutata quando l'umano sceglie "Nessun impianto"). Il display legge le colonne, coerente con la regola B4 C2 estesa dalla ReviewPanel a ogni superficie.
- **`category` rimossa solo dai filtri dashboard, non dal modello (FASE 0 dedicata)**: `documents.category` è NOT NULL, è un segmento di `storage_path`, ed è l'asse di navigazione della PWA residente (`(app)/documenti` raggruppa/filtra per category). Non rimuovibile dall'upload; ridondante solo nella dashboard, dove `doc_type` è l'asse più ricco. `DOC_TYPE_TO_CATEGORY` è codice morto (zero import), lasciata in piedi come concern separato.
- **Tendina larghezza fissa (Fix D)**: un `<select>` nativo a larghezza-contenuto in una riga flex fa oscillare la ricerca `flex-1` a ogni selezione. Fissato `w-[200px] truncate`.
- **Riuso `<select>` nativo per la tendina**: nella dashboard non esiste un componente dropdown custom; i select nativi (modale upload, `ItemConfigForm`) sono il pattern esistente, riusato con `appearance-none` + `ChevronDown`.

## Stato attuale
### Funziona
- B4 commit 1-4 chiusi e su `main`; migrazioni 026/027 applicate e verificate
- `computeResidenceChecklist` verificato contro ricostruzione SQL indipendente (Cavaccio 19/6; anti-dup su Arcella)
- Dashboard documenti: badge impianto visibile, CTA conferma primaria, azione rivedi riconoscibile, filtro tipo a tendina stabile, "Da rivedere" e reset funzionanti con a11y (aria-label, focus-visible, aria-pressed)
- Modale upload e badge categoria sulla card: invariati e funzionanti; PWA residente non toccata

### Non funziona / da verificare
- **Nessuna UI consuma ancora `computeResidenceChecklist`**: il commit 5 (superficie checklist) non è iniziato
- **Target touch ~36px** su vari controlli della pagina documenti (<44px): pass dedicato da fare sull'intera pagina, fuori dai cicli fatti
- **`DOC_TYPE_TO_CATEGORY`** resta codice morto (zero import): rimozione come micro-commit separato

## Prossimi passi
1. **Commit 5 di B4 — UI checklist di consegna** (il pezzo grosso): superficie costruttore che consuma `computeResidenceChecklist`, mostra atteso/presente/mancante raggruppato per scope (con blocco `dossier_admin` separato), con azione "segna non applicabile" + campo "atteso da" (scrive `residence_checklist_exception`). Decidere dove vive (tab nella scheda residenza? pagina dedicata?)
2. **Definire/rifinire la mappa `template_id → attese`** se emergono impianti non coperti durante la UI
3. Micro-commit: rimozione `DOC_TYPE_TO_CATEGORY` (dead code)
4. Pass target touch 44px sull'intera pagina documenti (P3 backlog ereditato da B3)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```
Verifica helper checklist (se serve ripeterla, script usa-e-getta poi cancellato): `npx tsx` di uno script che importa `computeResidenceChecklist`, client service da `.env.local`, residenza Cavaccio `45196dac-bd81-4368-9452-1c066652e464`.

## Domande aperte
- **Superficie del commit 5**: dove vive la checklist nella UI dashboard (tab scheda residenza vs pagina dedicata)?
- **"Presente" resta `classification_status='completata'`** (include auto-AI): confermato in C4, ma da rivalutare quando la UI mostrerà la provenienza (`reviewed_by`) — un costruttore potrebbe volere solo i confermati da umano per certe categorie
- **PWA residente `(app)/documenti`**: intoccata per ora; se in futuro si tocca `category`, va deciso prima il destino di quella vista

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `Ogni superficie di DISPLAY (badge card, liste, PDF, non solo i form di revisione) legge le COLONNE confermate documents.doc_type / documents.sistema, MAI extracted_metadata. extracted_metadata è il verbale immutabile della proposta AI: mostrarlo come dato corrente attribuirebbe all'AI una correzione umana, o riesumerebbe una proposta che l'umano ha rifiutato. Un fallback ?? extracted_metadata su una superficie di display è codice morto (la route scrive già la colonna in auto-conferma) e dannoso.`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `Un controllo nativo a larghezza-contenuto (es. <select>) dentro una riga flex con un fratello flex-1 fa oscillare la larghezza del fratello a ogni cambio di selezione. Vincolare la larghezza del controllo (w-[Npx] + truncate), non lasciarla al contenuto, o la riga "balla".`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)**:
  `documents.category ha un ruolo funzionale reale, non è descrittivo: è NOT NULL, è un segmento di storage_path (${residenceId}/${category}/...), ed è l'asse di navigazione della PWA residente ((app)/documenti raggruppa e filtra per category). NON è rimuovibile dall'upload né dal modello; è ridondante solo nei FILTRI dashboard, dove doc_type è l'asse più ricco. category e doc_type sono indipendenti: DOC_TYPE_TO_CATEGORY non deriva nulla a runtime (zero import).`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `La mappa derivata della checklist B4 (template_id → attese documentali) si aggancia agli UUID dei template di manutenzione, MAI ai titoli: i titoli sono descrizioni editabili (in FASE 0 solo 2/7 combaciavano col testo atteso). Una guardia deve emettere un warning, mai un errore, se un UUID della mappa sparisce dai template attivi del catalogo.`

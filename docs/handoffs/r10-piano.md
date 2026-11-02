# R10: piano approvato (correzione manuale dei campi estratti)

> FASE 0 del 1/11 sera, approvata da Filippo lo stesso giorno. Ricostruito dall'output di Claude Code: alcune righe erano tagliate dal terminale, i punti completati a mano sono segnati con (ricostruito).

## Riscontri

- **R1. I verbali AI sono due.** `documents.extracted_metadata` = solo esito della classificazione (doc_type, sistema, confidence, motivazione, unita_riferimento; per la DiCo anche ragione_sociale_installatore e partita_iva_installatore). Scritto in `src/app/api/classify-document/route.ts:310-326`. I campi estratti stanno nella tabella 1:1 `document_extractions` (migrazione 040): document_date, ambito, unita_riferimento, valid_until, fields jsonb. Scritta solo da `src/app/api/extract-document/route.ts`.
- **R2. Campi per categoria** (`src/lib/document-extraction.ts:104-108`, FIELD_KEYS):
  - tutti tranne `altro`: data documento, ambito, unità di riferimento (colonne di document_extractions);
  - DiCo: + ragione sociale e P.IVA installatore (in extracted_metadata);
  - garanzia: + inizio, durata_anni, oggetto, rilasciata_da (fields);
  - ape: + classe_energetica, valida_fino_al (fields);
  - polizza_decennale: + compagnia, numero_polizza, decorrenza, durata_anni, evento_decorrenza, scadenza (fields) (ricostruito dalla lista del CHECK);
  - agibilità, libretti, manuale, collaudo e altri: solo i campi comuni.
  - `valid_until` NON è estratto dall'AI: lo calcola `computeValidUntil` (`document-extraction.ts:179`). Non si rende modificabile, si ricalcola dai campi uniti.
- **R3. Uso a valle.** Helper unico `documentFacts` (`src/lib/document-rows.ts:128`): riga dashboard (extractionFacts), testo di ricerca, validitySubject, export Excel (`src/lib/document-export.ts:60`), PWA residente (`src/lib/resident-document-facts.ts:20`). Lo aggirano: `DeadlinesSection` (`DocumentiClient.tsx` ~1054, legge `extraction.valid_until` e `fields` direttamente). Leciti perché mostrano la proposta AI: `ReviewPanel` (:1442-1489), `SupplierProposalSection` (:1568), `confirmSupplierProposal` lato server (`actions.ts:548-577`). Non usano i documenti: checklist (solo doc_type e sistema), fascicolo PDF (solo completions), scadenze/cron, fornitori.
- **R4. Il write-once è solo una convenzione.** Nessun trigger su documents (solo `document_extractions_updated_at`), policy `documents` FOR ALL per admin/super_admin, grant UPDATE ad authenticated. `document_extractions` viene riscritta con upsert a ogni riclassificazione (`extract-document/route.ts:272-274`). Quindi le correzioni non possono stare in nessuna delle due tabelle AI.
- **R5. R3 oggi.** `confirmSupplierProposal({ documentId, expected, manual?: { ragioneSociale, partitaIva } })` + `resolveInstallerInput` (`document-classification.ts:208-224`): nome obbligatorio, P.IVA 11 cifre, manuali usati solo a verbale vuoto. Finiscono solo in `suppliers.name`/`vat_number`: dopo il collegamento la DiCo mostra "Installatore" vuoto in riga, Excel e PWA (`document-rows.ts:131-132`). Riusabili: `normalizeVatNumber`, `normalizeIsoDate`, normalizzazione interi positivi.
- **R6. UI.** Nessuna pagina/modale di dettaglio. Il dettaglio è la `DocCard` in `/admin/residences/[id]/documenti`; "Rivedi classificazione" apre `ReviewPanel` inline (`DocumentiClient.tsx:1348-1424`). Unico modale: upload.
- **R7. Ruoli e registro.** Upload/classificazione/estrazione: admin e super_admin; residente 403 (`src/lib/document-access.ts:40-100`). Registro = `activity_events` con CHECK su 9 tipi; scrittura con `logActivityEvent` (`src/lib/activity-log.ts:74`) via service client.
- **R8. Dati di prova:** f949ac0f ("test-r3", TEST wizard A). Verbale AI: `altro`, installatore e P.IVA null; colonna doc_type corretta a mano a DiCo/elettrico; estrazione DiCo completata con tutti i campi null; nessun fornitore collegato.
- **R9.** `docs/migrations.log` mancava.

## Decisioni

- **D3. Tabella per campo** `document_field_overrides` (migrazione 048): chiave (document_id, for_doc_type, field_key), value text null (null = "il documento non lo riporta", scelto a mano), set_by, set_at. RLS: SELECT delegata a documents (stesso schema della 040), nessuna scrittura da authenticated/anon, scritture solo via service role dalla server action. È stato corrente: togliere una correzione = DELETE; lo storico sta in activity_events.
- **D4. Lettura:** un solo merge dentro `currentExtraction`/`documentFacts`. Valore mostrato = manuale se attuale (stesso for_doc_type), altrimenti AI. Nuovo helper puro: valori uniti + mappa di provenienza (ai/manuale per campo). `valid_until` ricalcolato con `computeValidUntil` sui campi uniti. Riga, Excel e PWA si aggiornano senza modifiche; DeadlinesSection va portata sull'helper.
- **D5. UI inline nella DocCard:** toggle "Correggi dati" accanto a "Rivedi classificazione", pannello con i soli campi ammessi per il tipo. Ogni campo mostra il valore AI come riferimento; se corretto: "Modificato a mano · Nome, data" e "Ripristina valore AI". In riga etichetta discreta "Dati corretti a mano" se c'è almeno una correzione attuale. Documenti `altro` o senza tipo non modificabili. Componente unico.
- **D6. Riclassificazione:** le correzioni restano nel DB legate a for_doc_type; se il tipo cambia smettono di applicarsi e tornano attive se si torna al tipo. Prima di confermare un cambio di tipo, ReviewPanel avvisa "N correzioni manuali non si applicheranno più" (ricostruito). Né la riclassificazione AI né l'estrazione le toccano.
- **D7. Chi modifica:** admin e super_admin (stesso perimetro di `authorizeDocumentActor`). Residente no. Nuovo evento `documento_corretto` nel registro.

## Risposte di Filippo (1/11)

1. **R3:** sì, commit 7 separato. In `confirmSupplierProposal` i valori manuali diventano anche override sul documento (stessa validazione) e la proposta usa l'installatore effettivo (override > AI). Ok al cambio di semantica "manuali solo a verbale vuoto".
2. **PWA residente:** valori corretti, nessuna etichetta.
3. **Approvati** la policy SELECT della 048 e il DROP/ADD del CHECK nella 049: nella stessa migrazione, con tutti i 9 tipi esistenti + `documento_corretto`; dopo, SELECT che nessuna riga di activity_events viola il nuovo CHECK.
4. **Guard DB sul write-once:** fuori scope, va in backlog P2.
- **migrations.log:** creato nel commit 1 con intestazione e riga 048; ricostruzione 001-047 a parte (R8d).

## Commit

1. **Migrazione 048** `document_field_overrides` + tipi in `src/types/database.ts` + `docs/migrations.log`. Verifica: SELECT su pg_policies, role_table_grants, pg_constraint per la tabella; npm run verify.
2. **DeadlinesSection** passa da `currentExtraction`/`documentFacts`. Refactor puro, nessun cambio di output. Verifica: npm run verify, `node scripts/verify-document-export.mjs`, blocco Scadenze a schermo invariato.
3. **Merge** in `src/lib/document-overrides.ts`: whitelist campi per tipo, normalizzazione (funzioni di R3), `effectiveExtraction` con provenienza, loader che legge anche gli override. Senza dati non cambia nulla di visibile. Verifica: npm run verify + nuovo `node scripts/verify-document-overrides.mjs` (manuale > AI, override non attuale ignorato, valid_until ricalcolato, value null).
4. **Server action** `saveDocumentFieldOverride` e `clearDocumentFieldOverride`: admin e super_admin, scope sulla residenza, scrittura via service role, chiave ammessa solo per il doc_type corrente, `error` sempre gestito. Verifica: npm run verify, poi su f949ac0f SELECT sulla nuova tabella dopo un salvataggio.
5. **UI** "Correggi dati" (componente unico), etichetta "modificato a mano", "Ripristina valore AI", avviso di riclassificazione in ReviewPanel. Verifica: npm run verify, su f949ac0f inserire installatore e P.IVA e controllare riga, Excel e PWA.
6. **Migrazione 049:** CHECK di activity_events allargato con `documento_corretto`, etichetta, `logActivityEvent` nella action. Verifica: `pg_get_constraintdef`, una correzione, pagina /attivita.
7. **Integrazione R3** (risposta 1).

## Sessioni

- Sessione 1 (Opus): commit 1-3.
- Sessione 2 (Sonnet): commit 4, 5, 7.
- Sessione 3 (Sonnet): commit 6.
- Per ogni commit: diff + npm run verify completo, ok di Filippo, commit, hash. Dati di prova solo su TEST wizard A (f949ac0f).

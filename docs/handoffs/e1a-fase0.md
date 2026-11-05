# E1a FASE 0 — Excel dati documenti + quadro documenti per unità

Data: 2026-11-05. Diagnosi read-only (codice + SELECT sul DB). Nessuna modifica al codice.
Esplorazione del codice delegata a un subagent; i punti che reggono il piano sono stati
riverificati a mano (marcati **[verificato]**).

## Vincoli dichiarati prima di iniziare

- **Ampiezza**: un solo file Excel con 4 schede, un solo download. Il quadro unità × documenti
  sta nella pagina Documenti INTERA della residenza, non in una variante ridotta.
- **Struttura**: un componente condiviso per super_admin e admin; si ramifica solo sulle prop
  che differiscono davvero (oggi: la visibilità dei fornitori). Niente JSX duplicato per ruolo.
- **Nessuna migrazione prevista.** Solo dati già presenti.
- Scritture di questa sessione: solo questo file.

## 1. L'Excel documenti oggi

| Aspetto | Stato | Prova |
|---|---|---|
| Libreria | `write-excel-file` 4.1.1 (non exceljs). Supporta più schede: `writeXlsxFile(sheets: Sheet[], options)` con `Sheet = { data } + SheetOptions` | `package.json:34`; `node_modules/write-excel-file/node/index.d.ts:40-43`; `types/Sheet.d.ts:4-6` **[verificato]** |
| Route | `GET /api/documenti-xlsx?residenceId=`, runtime nodejs, `force-dynamic`, nessun `maxDuration` | `src/app/api/documenti-xlsx/route.ts:12-13,43` **[verificato]** |
| Scheda | una sola, "Documenti", 12 colonne, header grassetto, riga bloccata | `route.ts:70-77`; `src/lib/document-export.ts:20-33` **[verificato]** |
| Colonne | Titolo, Tipo, Ambito, Unità, Data documento, Scadenza o validità, Installatore, Partita IVA, Compagnia, Numero polizza, Classe energetica, Oggetto coperto | `document-export.ts:20-33` |
| Righe | una per documento, anche non classificati; ordine: residenza, poi unità in ordine naturale | `document-export.ts:83-101` |
| Chi scarica | `super_admin` (solo se `residence.builder_id === profile.builder_id`), `admin` (solo con riga in `admin_assignments`); residente 403 | `src/lib/document-access.ts:134-188` (agente, alta) |
| Autorizzazione | gate con service client (`route.ts:61`), dati letti con client di SESSIONE (RLS come seconda barriera) (`route.ts:64-67`) | **[verificato]** |
| Entrata UI | link `<a download>` nell'header di `/admin/residences/[id]/documenti`, solo se `docs.length > 0` | `documenti/page.tsx:162-172` |
| Nome file | `documenti-<slug>.xlsx`, senza data | `route.ts:79` |

**Riuso per le 4 schede**: schema route (auth + `authorizeResidenceActor` + loader), `toSheetCell`
(`route.ts:21-28`, date in UTC `dd/mm/yyyy`), `fileSlug`, tipo `ExportCell`, modulo puro
`document-export.ts` con `verify:export` (`package.json:15`). **Non riusabile così com'è**:
`toSheetCell` e `fileSlug` sono locali alla route e vanno estratti in un modulo condiviso;
non esistono helper di styling (solo `fontWeight: 'bold'`).

## 2. Le 4 schede: sorgenti e colonne proposte

Una sola route, un solo loader per residenza, 4 moduli puri (uno per scheda) testabili senza DB.

### Scheda 1 — Riepilogo unità (una riga per unità)

| Colonna | Fonte | Esiste? |
|---|---|---|
| Unità | `units.label` via `formatUnitLabel` | sì |
| Piano | `units.floor` | sì |
| Consegna | `units.delivery_date` (null → "Non consegnata", helper `unitNotDelivered`, `src/lib/unit-utils.ts`) | sì |
| Residente | `unit_members` con `ended_at IS NULL`, primario → `profiles.full_name`; senza account → "Nessun account" via `unitHasNoActiveAccount` | sì (query in `admin/residences/[id]/page.tsx:270-274`) |
| Documenti assegnati | conteggio `documents.unit_id` | calcolabile |
| Documenti da verificare | conteggio per stato documento (vedi §3) | calcolabile |
| Voci di manutenzione attive | conteggio items inclusi | calcolabile |
| Scadute / Prossima scadenza | `resolveLiveStatus`, `isOverdueLive` (`src/lib/maintenance-status.ts`), mai dal campo `status`, escluse le promemoria | calcolabile |
| Dati chiave documenti attesi (es. APE: classe, valida fino al) | stessa logica del quadro (§4) | calcolabile |

**Manca**: la colonna "scala" non esiste nello schema (`units` ha solo `id, residence_id, label,
floor, created_at, delivery_date`); "proprietario" non esiste, c'è solo l'account attivo primario.
Le colonne sopra non le includono.

### Scheda 2 — Scadenze (una riga per voce di manutenzione)

Fonte: select di `admin/residences/[id]/manutenzioni/page.tsx:38-49` (item + `maintenance_templates` +
`units` + `suppliers`). Solo voci con `activation_status = 'inclusa'` e template attivo (`isCountable`);
archiviate ed escluse restano fuori (Piano ≠ fascicolo).

Colonne: Unità o "Parti comuni" · Manutenzione (`maintenance_templates.title`) · Categoria ·
Modalità (`resolveCompletionMode`) · Tipo (`resolveObligationType`) · Frequenza (`formatFrequency`,
pluralizzazione via helper) · Prossima scadenza · Stato (da `resolveLiveStatus`) · Fornitore.

- **Invariante promemoria**: per `completion_mode = 'promemoria'` lo Stato è sempre
  "Consigliata · ogni X mesi", niente "Scaduta", e la colonna Prossima scadenza resta vuota
  (decisione D3).
- "In attesa di consegna" quando `next_due_date` è null (`isAwaitingDelivery`).
- **Manca**: etichette leggibili per `obligation_type` e `completion_mode` da usare nel foglio:
  vanno cercate/centralizzate (oggi nella UI, non verificato dove).
- Fornitore: visibile solo al super_admin (`manutenzioni/page.tsx:80-84`); per l'admin la colonna
  non compare.

### Scheda 3 — Fornitori (una riga per fornitore)

Fonte: `suppliers` (builder-wide da 039: `name, phone, email, vat_number, categories`) +
`supplier_installations` (`sistema`, `source` manuale|documento, `source_document_id`), query in
`admin/residences/[id]/fornitori/page.tsx:48-53`. Per la lista di una residenza vale l'unione di
`suppliers.residence_id` e `supplier_installations` (commento in `manutenzioni/page.tsx:55-58`).

Colonne: Nome · Partita IVA · Telefono · Email · Sistemi collegati in questa residenza · Origine
(Documento / Manuale) · Documenti collegati. **RLS solo super_admin** (038/039): per l'admin la
scheda non va emessa (non va lasciata vuota, sarebbe indistinguibile da "nessun fornitore").

### Scheda 4 — Documenti (una riga per documento)

Le 12 colonne attuali + 4 nuove, tutte da dati esistenti:

| Colonna nuova | Fonte |
|---|---|
| File | `documents.file_name` |
| Stato classificazione | `documents.classification_status` (etichette) |
| Origine del dato | regola in §3 |
| Campi corretti a mano | `fieldProvenance` (`document-overrides.ts:360`) → etichette (`FIELD_LABELS`, `:108`) |

Opzionale (D4): Confidenza classificazione (`documents.classification_confidence`, NUMERIC 0..1, esiste).

## 3. "Origine del dato": cosa si può dire e cosa no

- **Per campo AI vs manuale: SÌ.** `fieldProvenance(docType, overrides)` restituisce per ogni
  chiave `{source:'ai'}` o `{source:'manuale', setBy, setAt}` (`src/lib/document-overrides.ts:360`
  **[verificato]**); chi/quando in `document_field_overrides` (`set_by`, `set_at`, 048). Oggi non è
  usata fuori dal pannello "Correggi dati" e dal badge sulla card.
- **Confidenza per campo: NO.** `document_extractions` non ha colonne confidence/needs_review
  (040:58-71). La confidenza esiste solo per la classificazione, per documento
  (`documents.classification_confidence` + `extracted_metadata.confidence`, soglia 0.8,
  `classify-document/route.ts:297`).
- **Conseguenza chiara: il "da verificare" PER CAMPO va rimandato a E1b** (richiede che l'estrazione
  produca e salvi una confidenza per campo: cambio di schema AI e quasi certamente migrazione).
- **Cosa si può fare in E1a (a livello di DOCUMENTO)**, valori della colonna "Origine del dato",
  in ordine di precedenza:
  1. **Da verificare**: `classification_status` ∈ {da_revisionare, fallita, non_classificato, in_corso}.
  2. **Non estratto**: classificato, tipo estraibile, ma senza estrazione corrente o estrazione `saltata`.
  3. **Corretto a mano**: almeno un override corrente (`hasCorrections`); i campi nella colonna "Campi corretti a mano".
  4. **AI**: estrazione `completata`, nessun override.
  5. **—** per i tipi non estraibili (`altro`).
- Dati reali al 5/11 **[verificato]**: `document_field_overrides` è vuota (0 righe in tutto il DB):
  oggi "Corretto a mano" non comparirebbe mai. Estrazioni: 24 completate, 2 saltate. Documenti
  `completata` senza estrazione, escluso `altro`: 2 (1 APE, 1 polizza decennale).

## 4. Quadro unità × documenti attesi

**Esiste già la checklist, ma solo a livello residenza e non per unità.** Nel codice e negli
handoff si chiama **B4** (non R1): `computeResidenceChecklist`
(`src/lib/document-checklist.ts:185-399`). Scope `unit` presente nello schema ma ignorato:
`document-checklist.ts:390` `if (exp.scope === 'unit') continue // non usato in v1` **[verificato]**.
Le 11 attese BASE (027) sono tutte a livello condominio / dossier_admin / residence; APE e
planimetria catastale non sono attese da nessuna parte. L'handoff B4 rimanda la risoluzione
per unità a "B4.5" perché `unit_id` sui documenti è inaffidabile
(`HANDOFF_b4_checklist_consegna_07_23_11_47.md:37,54,76`).

**Come si calcola oggi presente/mancante**: presente = esiste un documento con
`classification_status = 'completata'` con `doc_type` uguale, `unit_id` nullo per gli scope
condominio/dossier, sistema compatibile (`document-checklist.ts:355-369` **[verificato]**).

**Prova che il problema di B4 è reale** **[verificato]** (SELECT, 40 documenti in tutto):
- solo 8 documenti hanno `unit_id` valorizzato, 4 dei quali `altro`;
- i 3 documenti con `ambito = 'unita'` (APE, DiCo, elenco fornitori, tutti Cavaccio) hanno
  `unit_id` NULL e l'unità solo come testo libero in `unita_riferimento`: "interno 3", "Unità 1";
- `documents.unit_id` si imposta solo all'upload (`actions.ts:274`); non c'è azione per riassegnarlo.

**Proposta** (decisione D1/D2):
- Il quadro si basa solo su `documents.unit_id`; non si fa matching sul testo libero di
  `unita_riferimento` (fragile, "interno 3" ≠ label dell'unità). I documenti che citano un'unità ma
  non sono assegnati si contano a parte in una riga di avviso ("N documenti citano un'unità ma non
  sono assegnati"), senza correggerli (la riassegnazione è un altro concern).
- Tipi attesi per unità, **da confermare**: APE e planimetria catastale (come da B4) più, a scelta,
  dichiarazione di conformità impianti. Definiti come costante in un modulo puro condiviso (nessuna
  migrazione); lo scope `unit` di `document_checklist_template` non si usa in E1a.
- Stato per cella: **Presente** (doc `completata` di quel tipo con quell'`unit_id`) · **Da verificare**
  (documento assegnato all'unità ma non classificato o da_revisionare, senza match confermato) ·
  **Mancante**.
- Dati chiave per riga, da `documentFacts` (`document-rows.ts:231-286`): APE → classe energetica +
  valida fino al; planimetria → data documento; DiCo → impresa installatrice + data.
- Calcolo puro su `docs`/`units` già caricati dalla pagina: nessuna query in più. Un helper unico
  alimenta quadro e scheda 1 (regola "helper condivisi").

## 5. Flusso con builder vuoto ("TEST prova Nicola")

Stato reale **[verificato]**: il builder ha **0 residenze** e 1 profilo. Il primo passo è quindi
creare una residenza (wizard `admin/residences/new`), non caricare documenti.

| Passo | Funziona | Fragile / confuso | Prova | Conf. |
|---|---|---|---|---|
| Upload | signed URL dal browser, max 50 MB, MIME PDF/immagini/Word | MIME controllato sul dichiarato dal browser, non sul contenuto | `document-upload.ts:4-13`; `DocumentiClient.tsx:104-155` | alta |
| Classificazione | `classify-document`, soglia 0.8, solo PDF | **tutta la pipeline gira nel browser**: chiudere la scheda a metà ferma il batch, nessun cron | `DocumentiClient.tsx:380-432`; `vercel.json` (solo cron daily) | alta |
| Estrazione | `extract-document`, bottone "Estrai dati (N)" come rete di sicurezza | documento rimasto `in_corso` dopo un kill non rientra in nessun bottone (dedotto, non provato; oggi nessuno `in_corso` nel DB) | `DocumentiClient.tsx:712-747` | media |
| Errori | route AI rispondono 503 se manca `ANTHROPIC_API_KEY`, banner neutro | `classify-document` non destruttura `error` su letture e update critici (`route.ts:137-157,199,213,223,317-326,343,350`): se l'update finale fallisce risponde 200 e il documento resta `in_corso` | agente, alta | alta |
| Pagina vuota | messaggio "Nessun documento caricato" + "Carica documenti" | un errore tecnico di `loadResidenceDocumentRows` diventa lista vuota senza segnale, cioè lo stesso messaggio dello stato vuoto (`page.tsx:43-47`); `residence` senza `error` → `notFound()` (`page.tsx:35-41`) | agente, alta | alta |
| Batch | contatore "N documenti non classificati — riprova" | la causa del fallimento non è mostrata, solo `console.error` | `DocumentiClient.tsx:753-764` | alta |
| Correzione | "Correggi dati" solo con estrazione corrente, evento `documento_corretto` | cambiare `doc_type` rende non applicabili le correzioni esistenti (restano a DB) | `actions.ts:930-1054` | alta |
| Vista | card con fatti estratti, blocco Scadenze, checklist | un admin vede la checklist ma non può escludere voci; il fornitore solo il super_admin | `actions.ts:79-96` | alta |
| Download | Excel solo se `docs.length > 0` | vedi §1: nome senza data, una sola scheda, nessuna origine del dato | `page.tsx:162-172` | alta |
| Seed | nessun `builder_id` hardcoded | la checklist derivata dipende dagli UUID del catalogo globale (`DERIVED_MAP`, `document-checklist.ts:113-163`): con catalogo diverso solo un warning | agente, alta | alta |

Non verificato: comportamento effettivo dell'app (nessuna esecuzione), compatibilità di
`maxDuration = 120` col piano Vercel.

## 6. Piano commit (un concern per commit)

Ogni commit chiude con `npm run verify` (output completo incollato) più la prova indicata.
Stime in ore di lavoro (Sonnet), esclusa la verifica manuale di Filippo.

1. **Estrazione helper export condivisi**: `toSheetCell`, `fileSlug`, tipo `ExportCell` in
   `src/lib/xlsx-helpers.ts`; la route attuale li importa. Comportamento invariato.
   Tocca `documenti-xlsx/route.ts`, `document-export.ts`, nuovo `xlsx-helpers.ts`.
   Prova: `npm run verify:export` identico a prima + scarico l'Excel attuale prima/dopo e confronto le celle. ~1 h.
2. **Scheda Documenti estesa** (origine del dato, stato, campi corretti, file): `document-export.ts`
   (+ test in `scripts/verify-document-export.mjs`). Prova: `npm run verify:export` con casi per
   ogni valore di origine (AI, corretto, da verificare, non estratto, —). ~2 h.
3. **Helper documenti attesi per unità** (modulo puro, costante tipi attesi, stati, dati chiave):
   nuovo `src/lib/unit-documents.ts` + script `verify:unitdocs`. Prova: script con casi
   presente/mancante/da verificare/unit_id orfano. ~2 h.
4. **Schede Riepilogo unità + Scadenze + Fornitori**: moduli puri e query della route (items, membri,
   fornitori), passaggio a `writeXlsxFile(sheets[])`, nome file con data. Se questo commit risulta
   troppo largo si divide in 4a (Riepilogo+Scadenze) e 4b (Fornitori). Tocca la route e nuovi
   `unit-export.ts`, `deadline-export.ts`, `supplier-export.ts`. Prova: script verify per ogni scheda
   (inclusa l'invariante promemoria: nessun "Scaduta" e data vuota) + download e apertura del file
   su Cavaccio. ~4 h.
5. **Quadro unità × documenti in pagina**: nuovo componente condiviso `UnitDocumentMatrix.tsx` in
   cima a `documenti/page.tsx` / `DocumentiClient.tsx` (già 1865 righe: componente separato, non
   altro JSX nel file grande). Prova: `npm run verify` + verifica a vista su Cavaccio con admin e
   super_admin. ~3 h.
6. **(Opzionale, fuori E1a se non approvato) pulizie del flusso builder nuovo**: `error` destrutturato
   in `page.tsx` documenti e `classify-document`, distinzione "vuoto" vs "errore tecnico". Un concern
   a sé, segnalato come scope creep se assorbito altrove. ~2 h.

Totale 1-5: circa 12 h.

## 7. Rischi

- **Performance**: Cavaccio, la residenza più grande, ha 15 unità, 27 documenti e 252 voci
  (177 incluse) **[verificato]**; il calcolo in memoria è trivial. Il documento loader non ha
  `.limit`; il tetto PostgREST di default è 1000 righe per richiesta: una residenza con circa 50 unità e
  19 voci a testa (circa 950) sfiora il tetto e lo supera con una crescita ulteriore. `max_rows` non è
  configurato nel repo (non verificato sul progetto). Va gestito (paginazione con `range` o conteggio
  di controllo) prima di una residenza grande. La route non ha `maxDuration`.
- **Permessi**: stesso gate `authorizeResidenceActor` e dati con client di sessione (RLS). La
  scheda Fornitori e la colonna fornitore delle Scadenze solo per super_admin, decisione per ruolo
  esplicita, non lasciata alla RLS (che darebbe un foglio vuoto indistinguibile da "nessun fornitore").
  Le email degli utenti (`auth.users`) non entrano nell'export; l'email del fornitore sì, ma solo nella scheda riservata al super_admin. Nessun export a livello builder: la route richiede `residenceId`.
- **Migrazioni**: nessuna necessaria per E1a. Solo se si sceglie di mettere i tipi attesi per unità
  in tabella (`document_checklist_template` scope `unit`) o per la confidenza per campo (E1b).
- **Qualità dei dati**: `unit_id` poco popolato (8 su 40) rende il quadro magro finché non esiste
  la riassegnazione (B4.5): il quadro mostrerebbe molte unità "Mancante" per tipi che esistono ma
  non sono assegnati. Va dichiarato in pagina.
- **Invarianti**: `completions` non toccata; nessuna scrittura; promemoria mai "scaduta" nel foglio
  Scadenze (garantito da `resolveLiveStatus`, testato nel commit 4).

## Decisioni richieste a Filippo

- **D1** Tipi attesi per unità: APE + planimetria catastale (come B4), con o senza dichiarazione di conformità?
- **D2** Quadro solo su `documents.unit_id` (consigliato) e avviso per i documenti con unità citata ma non assegnata. Va bene?
- **D3** Promemoria nel foglio Scadenze: data "Prossima scadenza" vuota (consigliato, coerente con l'invariante) o mostrata?
- **D4** Includere la colonna "Confidenza classificazione" nella scheda Documenti?
- **D5** Per l'admin: scheda Fornitori omessa e colonna fornitore assente (consigliato)?
- **D6** Il commit 6 (pulizia errori del flusso) è dentro E1a o a parte?

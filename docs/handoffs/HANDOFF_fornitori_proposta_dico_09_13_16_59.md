# Handoff — Fornitori: proposta dalle DiCo · 13/09/2026 16:59

## Sommario
La sessione ha chiuso il pezzo (e) del blocco fornitori v2: la proposta di un fornitore a partire da una dichiarazione di conformità (DiCo) classificata. Il super_admin ora la vede nel pannello di revisione documenti e la conferma. La conferma collega il fornitore all'impianto della residenza e registra la partita IVA in anagrafica secondo regole precise. Il server ricalcola sempre l'esito e rifiuta se non coincide con quanto mostrato all'utente. In apertura è entrato anche un commit piccolo di pulizia sulla pagina fornitori. Albero di lavoro pulito a fine sessione, a parte due handoff precedenti non tracciati.

## Lavoro completato
- [x] Apertura sessione: git log/status. Il commit 1 di (e), cioè l'helper di match `normalizeCompanyName` + `buildSupplierProposal` + `scripts/verify-supplier-match.mjs`, era **già in git** (`4f26aee`). Verificato nel contenuto, non rifatto.
- [x] `b97f4b0` — rimosse le etichette `categories` dalle card della pagina fornitori di residenza. Tolta solo la resa a schermo: la colonna resta in DB come sorgente storica del backfill della 039.
- [x] `c599f0d` — commit 2 di (e): `documenti/page.tsx` legge l'anagrafica fornitori builder-wide e i collegamenti della sola residenza, solo per super_admin con `builder_id`. Tre prop nuove su `DocumentiClient`.
- [x] `ccb1a01` — commit 3 di (e): sezione "Impresa installatrice" in sola lettura nel `ReviewPanel`, con i cinque esiti. Ogni esito dichiara per esteso fornitore, sistema e residenza.
- [x] `712592e` — commit 4 di (e): server action `confirmSupplierProposal` + bottoni "Collega fornitore" / "Crea fornitore e collega". `friendlyError` estratta in `src/lib/supplier-errors.ts`.
- [x] `405ea3b` — commit 5 di (e): scrittura della P.IVA in anagrafica; helper puro `supplierVatNumberToWrite`; commento del commit 4 corretto; limiti di recupero resi casi eseguibili.
- [x] Prove a schermo superate (conferma di Filippo) per i commit 3 e 4, e per i cinque punti rimasti aperti nell'handoff precedente: dropdown "Installato da", contatore porta residenza, tile ambra rimossa, form "Modifica anagrafica" con label, voce sidebar.
- [ ] Prove a schermo del commit 5 — **non ancora eseguite**.

## File toccati
### Creati
- `src/lib/supplier-errors.ts` — `friendlySupplierError(message)` e `isVatUniqueViolation(message)`. Traducono in italiano le violazioni di `idx_suppliers_builder_vat` e `supplier_installations_unici`. Il riconoscimento avviene per nome del vincolo nel messaggio, perché PostgREST dà 23505 per entrambe. Vive in `lib` perché un file `'use server'` può esportare solo funzioni async.
- `docs/handoffs/HANDOFF_fornitori_proposta_dico_09_13_16_59.md` — questo documento.

### Modificati
- `src/components/FornitoriManager.tsx` — rimossi il blocco JSX delle `categories`, il campo `categories` dal tipo `Supplier` e l'icona `Tag`.
- `src/app/(dashboard)/admin/residences/[id]/fornitori/page.tsx` — `categories` tolta dalle due select, dal tipo `SupplierRow` e dal map.
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — due query (`suppliers` su `builder_id`, `supplier_installations` su `residence_id`), eseguite solo se `role === 'super_admin'` e `builder_id` non null. Passa `canLinkSuppliers`, `suppliers`, `supplierInstallations`, `residenceName`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — tipo `SupplierContext` (booleano e liste fusi in un solo valore, `null` per l'admin), passato `DocumentiClient → DocCard → ReviewPanel`. Componenti nuovi `SupplierProposalSection` (calcolo dell'esito, stato, bottone), `SupplierProposalBody` (frasi per esito) ed `EsecutoreIn`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — helper di autorizzazione `getAuthorizedSupplierLinker` (super_admin + `builderId`). Tipo `SupplierProposalExpectation` (`kind`, `sistema`, `supplierId`, `vatNumber`), `installationInsertError` (42501 → messaggio WITH CHECK) e `confirmSupplierProposal`.
- `src/app/(dashboard)/admin/fornitori/actions.ts` — la `friendlyError` locale è sostituita dall'import di `friendlySupplierError`: tre call site, messaggi identici.
- `src/lib/document-classification.ts` — aggiunta `supplierVatNumberToWrite(proposal)`.
- `scripts/verify-supplier-match.mjs` — da 31 a 42 casi: 8 su `supplierVatNumberToWrite` e 3 sul recupero dopo un fallimento parziale, di cui 2 marcati `LIMITE`.

### Letti (solo quelli rilevanti per capire il contesto)
- `supabase/migrations/039_suppliers_anagrafica_costruttore.sql` — schema di `supplier_installations` (`source`, `source_document_id`, CHECK `manuale_senza_documento`, UNIQUE della tripla), WITH CHECK della policy, `idx_suppliers_builder_vat` parziale.
- `supabase/migrations/002_rls.sql:417-425` — policy `suppliers: super_admin gestisce`: FOR ALL con sola USING, quindi il WITH CHECK coincide con la USING. Confermata unica definizione (038 la lascia come sola policy).
- `src/app/api/classify-document/route.ts:290-320` — il classificatore scrive direttamente le colonne `documents.doc_type`/`sistema` e normalizza la P.IVA a sole cifre prima di scrivere `extracted_metadata`.
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — `createSupplier`, modello del commento sul tradeoff non transazionale.
- `src/lib/auth.ts`, `src/types/database.ts:44-46` — `requireRole` restituisce `Profile` con `builder_id: string | null`.
- `docs/handoffs/HANDOFF_fornitori_v2_09_12_18_03.md` — handoff precedente del blocco.

## Decisioni chiave
- **Il server ricalcola e rifiuta se l'esito è cambiato.** Il client invia solo `documentId` + `expected` (kind, sistema, fornitore, P.IVA da scrivere). La action rilegge documento, anagrafica e collegamenti, ricalcola con la stessa `buildSupplierProposal` e, se l'esito differisce, restituisce "La proposta è cambiata… ricarica". Alternativa scartata: ricalcolare e scrivere comunque. La scrittura resterebbe corretta, ma potrebbe riguardare un fornitore diverso da quello nella frase letta.
- **Gate legato al `builder_id`, non al solo ruolo** (`documenti/page.tsx`). Un super_admin senza `builder_id` avrebbe ricevuto liste vuote e un "nessun match" falso, che spinge a creare doppioni. Alternativa scartata: `profile.builder_id!`, come in `admin/fornitori/page.tsx:27`.
- **Sistema null non nasconde la sezione.** Il gate chiesto includeva `doc.sistema !== null`, ma anche l'esito "sistema non classificato". Risolto così: ruolo + DiCo + ragione sociale decidono se la sezione esiste; col sistema null la sezione mostra "correggi prima la classificazione".
- **La proposta legge le colonne `documents.doc_type`/`sistema`, non i select del pannello.** Cambiare un select senza confermare non aggiorna la proposta, di proposito: descrive la classificazione salvata, quella che la server action riverifica.
- **P.IVA prima, collegamento dopo.** Su "simile per nome" l'UPDATE della P.IVA precede l'INSERT del collegamento. Così una collisione su `idx_suppliers_builder_vat` (P.IVA del documento già di un altro fornitore, quindi match per nome sbagliato) aborta tutto prima che esista un collegamento al fornitore sbagliato.
- **Mai sovrascrivere una P.IVA esistente.** `supplierVatNumberToWrite` scrive solo se `supplier.vat_number === null`, e l'UPDATE filtra anche `.is('vat_number', null)` contro le scritture concorrenti: zero righe aggiornate → "proposta cambiata". Se il fornitore trovato per nome ha già un'altra P.IVA, il pannello lo segnala in ambra come indizio contro il match.
- **Estrazione di `friendlyError` in `src/lib/supplier-errors.ts`** (scope creep dichiarato nel commit 4). Serviva per rispettare la regola dell'helper condiviso: un file `'use server'` non può esportarla.
- **Revalidate della sola pagina documenti** in `confirmSupplierProposal`, come richiesto. Le pagine fornitori non vengono rivalidate dalla action.

## Stato attuale
### Funziona
- Commit 3 e 4 provati a schermo da Filippo: esiti resi, gate admin, "Crea fornitore e collega", "Collega fornitore", rifiuto con due schede aperte.
- `npm run verify` (tsc + lint) pulito su tutti e sei i commit. Resta solo la warning pre-esistente `src/app/api/reconcile-documents/route.ts:12` (`req` non usato), estranea.
- `npm run verify:match`: 42 casi, 0 falliti.

### Non funziona / da verificare
- **Commit 5 non provato a schermo.** Da verificare:
  - "simile per nome" con P.IVA nel documento e fornitore senza P.IVA: dopo la conferma la P.IVA compare in anagrafica;
  - fornitore con P.IVA diversa: avviso ambra e nessuna modifica;
  - "nessun match" con P.IVA: il fornitore nasce con la P.IVA.
- **Ramo di collisione su `idx_suppliers_builder_vat`: difesa in profondità, non provabile a schermo.** Si raggiunge solo con una scrittura concorrente nei millisecondi tra ricalcolo e UPDATE. Il ricalcolo rilegge l'anagrafica, e se la P.IVA fosse già di un altro fornitore l'esito sarebbe "per P.IVA": la richiesta si fermerebbe prima, su "proposta cambiata". Anche una prova con due schede finisce su "proposta cambiata", non sul messaggio di collisione.
- **Limiti dichiarati del recupero dopo un fallimento parziale** di `confirmSupplierProposal` (fornitore creato, collegamento fallito). Valgono **solo per documenti senza P.IVA leggibile**; con P.IVA il recupero è garantito dal commit 5, perché il fornitore creato si ritrova per P.IVA. Entrambi sono casi eseguibili marcati `LIMITE` in `scripts/verify-supplier-match.mjs`:
  1. **Omonimi già in anagrafica:** la proposta ricaricata indica il primo omonimo per id, non per forza il fornitore appena creato.
  2. **Ragione sociale di sole forme societarie** (es. "S.r.l."): `normalizeCompanyName` restituisce null, l'esito resta `nessun_match` e ritentare crea un doppione.
- **Commento del commit 4 che prometteva troppo** ("ricaricando, la proposta trova quel fornitore per nome… non produce un doppione"): **corretto dentro il commit 5** (`405ea3b`). Ora distingue il caso con P.IVA (garantito) da quello senza, con i due limiti.
- **Formati misti di `suppliers.vat_number`.** La pagina builder salva la P.IVA grezza (solo trim); `confirmSupplierProposal` la salva normalizzata a cifre. `idx_suppliers_builder_vat` è sulla stringa grezza, quindi non impedisce "IT 01234567891" e "01234567891" su due fornitori diversi. Il match JS normalizza entrambi i lati e non ne è influenzato, ma l'indice non protegge da quel doppione.
- `docs/handoffs/HANDOFF_fornitori_v2_09_12_18_03.md` e `HANDOFF_verifica_registro_attivita_09_11_15_58.md` sono ancora non tracciati. `main` è 22 commit avanti rispetto a `origin/main`, nessun push fatto.

## Prossimi passi
1. Provare a schermo il commit 5 come `pippoloro02` sui tre casi elencati sopra, controllando la P.IVA risultante in `/admin/fornitori`.
2. Decidere se normalizzare `vat_number` anche nella pagina builder (`createSupplierForBuilder`/`updateSupplierAnagrafica` in `src/app/(dashboard)/admin/fornitori/actions.ts`) con `normalizeVatNumber`, così che l'indice unico protegga davvero. I dati esistenti andrebbero migrati: FASE 0 prima.
3. Decidere se `confirmSupplierProposal` debba rivalidare anche `/admin/fornitori` e `/admin/residences/[id]/fornitori`.
4. Riprendere i punti aperti dell'handoff precedente: cancellazione fornitore a livello builder con avviso sul cascade di `supplier_installations`, e destino di `suppliers.categories`, ormai non più resa a schermo.
5. Committare o archiviare i due handoff non tracciati, e fare il push di `main` quando Filippo lo decide.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify

# Casi del match fornitore dalle DiCo (42 casi, inclusi i due LIMITE)
npm run verify:match

# Allineamento SISTEMI ↔ CHECK della 039
npm run verify:sistemi
```

## Domande aperte
- I due limiti del recupero senza P.IVA vanno risolti o restano accettati? Una soluzione possibile: la action restituisce l'id del fornitore creato anche in caso di fallimento parziale e il ritentativo lo usa; oppure si blocca "Crea" su ragioni sociali con chiave di nome nulla.
- `vat_number` va normalizzato ovunque (vedi Prossimi passi §2)? Oggi coesistono due formati.
- La policy `suppliers: super_admin gestisce` (`002_rls.sql:417-425`) usa riferimenti non qualificati (`id`, `residence_id`, `builder_id`) nella subquery su `residences`. Dopo la 039 anche `suppliers` ha `builder_id`. Per le regole di scoping di Postgres il `builder_id` non qualificato si lega a `residences.builder_id`, cioè il comportamento voluto, ma è esattamente la bug class registrata in CLAUDE.md. Va riscritta qualificata con una migrazione? Non verificato con un probe.

## Leggi emerse (candidate per CLAUDE.md)

- **Regole di codice ricorrenti**: Una server action che conferma una proposta mostrata al client non si fida del client e non si limita a ricalcolare: riceve dal client l'esito che l'utente ha LETTO (tipo, entità, valori che verranno scritti), ricalcola server-side con la stessa funzione pura della UI e rifiuta con "la proposta è cambiata, ricarica" se i due non coincidono. Ricalcolare e scrivere comunque produce una scrittura corretta ma diversa da quella che l'utente ha confermato.

- **Regole di codice ricorrenti**: Nelle scritture multi-step non transazionali (supabase-js su REST), ordinare i passi in modo che quello che può dimostrare sbagliata l'intera operazione (es. collisione su un indice unico che smentisce un match) venga PRIMA della scrittura che la rende visibile o difficile da annullare (es. il collegamento). Il commento dell'action dichiara l'ordine con "non invertire" e lo stato incompleto possibile se fallisce un passo successivo.

- **Metodo di lavoro**: Un limite dichiarato di una funzione pura (caso in cui il comportamento è noto e accettato ma non desiderato) va registrato come caso eseguibile nello script di verifica, con il prefisso `LIMITE` nell'etichetta, non solo in un commento. Se un cambiamento futuro lo risolve, lo script fallisce e costringe ad aggiornare insieme caso, commento e handoff.

- **Regole di codice ricorrenti**: Gli helper sincroni condivisi fra file `'use server'` (es. mappature di messaggi d'errore) vivono in `src/lib/`, mai esportati da un file `'use server'`, che può esportare solo funzioni async. Duplicarli per aggirare il vincolo viola la regola dell'helper condiviso.

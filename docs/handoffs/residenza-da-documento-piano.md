# Residenza da documento: piano (FASE 0 approvata)

Stato: **solo diagnosi e piano, nulla implementato, nessuna migrazione, nessun commit.**
Base: HEAD `6974257` (07/11/2026). Implementazione da lunedì, dopo la chiusura di E1b.
L'altra sessione aveva codice non committato in `admin/residences/[id]/documenti/`
(`DocumentTabs.tsx`, `DocumentiClient.tsx`, `CommonDocumentsList.tsx`): questo piano non
tocca nessuno di quei file.

## Obiettivo

Da "Nuova residenza" il super_admin carica un PDF (capitolato, agibilità, relazione tecnica,
APE). La residenza viene proposta come bozza già compilata: nome, indirizzo, numero e nomi
delle unità con la scala nell'etichetta, le 19 dotazioni. L'umano la rivede, corregge e la
crea con un clic. Fino a quel clic niente arriva a DB, residenti, email, inviti o cron.

## Decisioni di Filippo (07/11)

1. **Bozza nel browser, non salvata.** Avviso `beforeunload` se si chiude la pagina con
   modifiche non salvate. La tabella `residence_drafts` è V2.
2. **Scale dentro l'etichetta dell'unità** ("Scala A – Int. 3"). Nessuna colonna nuova.
3. **Fix di `new/actions.ts:14`** (lettura di `profiles` che scarta `error`) in un commit
   separato subito dopo il commit 1. `new/actions.ts:89` (messaggio grezzo della RPC
   mostrato all'utente) va nel backlog P2.
4. **Le residenze `TEST draft ...` restano nel DB**, solo nel builder `TEST prova Nicola`,
   mai in Furlan. Vedi "Builder delle prove".
5. **`pdfjs-dist` sì**: versione esatta, import dinamico solo nella pagina nuova, provata
   anche con `npm run build`.
6. **Revisione a pagina intera, non ridotta.** Nessun JSX copiato dal wizard: si estraggono
   componenti condivisi che ricevono i valori iniziali, e si ramifica solo sulle prop che
   differiscono davvero (confidenza e citazione per campo).
7. **Bottone "Segna le rimanenti come No"** con il conteggio delle dotazioni non risolte
   visibile accanto. Peso del bottone: vedi "Dotazioni dopo la creazione".

## Vincoli dichiarati

- Nessuna riga in `residences` (né in tabelle collegate) prima del clic "Crea residenza".
- Una sola strada di scrittura: la stessa `createResidence` → RPC
  `czero_create_residence_with_units`. Nessun secondo percorso.
- `completions`: nessun percorso nuovo la legge o la scrive.
- Il wizard manuale si comporta esattamente come oggi.
- Prove mai su Cavaccio.

## Riscontri

### 1. Dove nasce oggi una residenza

- Il link "Nuova residenza" (`admin/residences/page.tsx:65`) porta a
  `admin/residences/new/page.tsx`: un componente client a 3 passi, accessibile solo al
  super_admin (`new/layout.tsx:8` `await requireRole(['super_admin'], '/admin/manutenzioni')`).
  **Quindi chi crea la residenza è il super_admin, non l'admin.**
- **Passo 1.** Nome*, Indirizzo*, Classe energetica, Data consegna* (`page.tsx:324-328`).
  Con "Edificio esistente" compaiono `units_delivery_date` (`:373`) e le 12 date per
  categoria `date_<Categoria>` (`:404`, `WIZARD_CATEGORIES` a `:17-28`).
- **Passo 2.** Le 19 dotazioni da `RESIDENCE_FEATURES` (`src/lib/residence-features.ts:49`),
  campo `feature_<key>` (`:185-187`), tutte false di default (`page.tsx:47`).
- **Passo 3.** Le unità: etichetta e piano, massimo 200 (`page.tsx:31`), nomi unici senza
  distinzione di maiuscole (`:58-78`).
- **Server action** `createResidence(formData)` in `new/actions.ts`:
  - `:20-21` gate super_admin e `builder_id` presi dal profilo di chi crea.
  - `:28` obbligatori solo nome, indirizzo e data di consegna.
  - `:71-73` invia sempre tutte le 19 dotazioni come vero/falso, iterando la costante e mai
    il FormData.
  - `:77` chiama `admin.rpc('czero_create_residence_with_units', …)` con il service client.
  - `:92` redirect a `/admin/residences/<id>/documenti?onboarding=1`.
- **RPC** (migrazione 044, `SECURITY DEFINER`, eseguibile solo da service_role, 044:219-222),
  in una sola transazione. Ordine degli INSERT: `residences` → `residence_category_dates` →
  `residence_features` (`source` fisso a `'wizard'`) → `units` → `maintenance_items`
  condominiali → `maintenance_items` di unità. Definizione letta con `pg_get_functiondef`.
  Nessun trigger su `residences`.
- **Generazione delle voci di manutenzione.** 35 template attivi, 21 condizionali su
  19 `condition_key`. Una voce condizionale nasce solo se esiste una riga in
  `residence_features` con quella chiave e `present = true` (044:157-169). Le voci nascono
  con stato già calcolato (`CASE … WHEN due.d < CURRENT_DATE THEN 'scaduta'`).
- **Generarle alla creazione o all'attivazione:** all'attivazione. Il cron legge
  `maintenance_items` con il service role senza guardare la residenza
  (`api/cron/daily/route.ts:63-71`). Una bozza con voci verrebbe elaborata e notificata.
  Con la bozza nel browser, creazione e attivazione coincidono: l'esclusione dal cron è
  garantita dalla struttura.

### 2. Stato bozza/attiva

- Oggi non esiste. `residences` ha solo `id, builder_id, name, address, energy_class,
  photo_url, delivery_date, created_at` (letto da `information_schema.columns`).
- **Opzione scartata (colonna di stato su `residences`).** La migrazione sarebbe additiva, ma
  le bozze andrebbero escluse da:
  - la policy SELECT `residences: lettura se si ha accesso` (`czero_can_access_residence`);
  - 24 file con `.from('residences')`;
  - il cron (servirebbe una join);
  - le notifiche (`notification-recipients.ts:114`);
  - gli inviti (`welcome/[token]/page.tsx:46`);
  - report (`api/report/route.ts:120`), fascicolo PDF (`document-access.ts:154`),
    `documenti-xlsx`, `reconcile-documents`;
  - le liste admin e fornitori;
  - `(app)/documenti/page.tsx:31-35`, che per il super_admin prende la prima residenza con
    `limit(1)` e potrebbe pescare una bozza.

  C'è anche il problema della pulizia: `completions` e `activity_events` hanno una FK verso
  `residences` senza CASCADE, e su `residences` non esiste una policy DELETE.
- **Scelta: bozza nel browser** (decisione 1). Zero migrazioni, zero superfici da escludere.
- **V2: `residence_drafts`.** Migrazione additiva, RLS attiva, nessuna policy,
  `REVOKE INSERT, UPDATE, DELETE` per `authenticated` sul modello di `residence_features`
  (030:100). Accesso solo dal service role nelle server action: l'accesso non si allarga.

### 3. Pipeline AI: cosa si riusa

- **Si riusa:**
  - il modello `claude-sonnet-5` (`classify-document/route.ts:251`, `extract-document/route.ts:38`);
  - l'output strutturato con `output_config.format: { type: 'json_schema', schema }`
    (`classify route.ts:261-263`);
  - `cache_control: ephemeral` sul system prompt, `maxRetries: 1`, timeout di 90 secondi (`:280`);
  - `runtime = 'nodejs'` e `maxDuration = 120` (`classify :21-22`, `extract :31-32`);
  - il controllo `ANTHROPIC_API_KEY` vuota → 503 (`classify :207`);
  - il log `[ai-usage]` nella forma di `extract route.ts:343-350`, con
    `route: 'residence-draft'` e il numero di caratteri inviati.
- **Controllo d'accesso:** sul modello di extract (`authorizeDocumentActor`, che legge `error`
  e distingue 500 da 403/404, `document-access.ts:53-58`), **non** di classify, che scarta
  `error` (`classify route.ts:139-146`, già nel piano `docs/handoffs/fix-classify-piano.md`).
- **Va scritto da zero:** lo schema `{ valore, confidenza, citazione }` per campo con le
  dotazioni a tre stati, il prompt, la validazione e la route. Validazione con type guard
  scritte a mano, come nel resto del codice: `zod` non è installato (solo dipendenza
  opzionale dell'SDK, `package-lock.json:62`). Oggi né lo schema di classificazione
  (`classify :40-65`) né quello di estrazione (`extract :90-98`) hanno citazione o
  confidenza per campo.
- **Debito:** `isServiceUnavailableError` esiste in due copie identiche e non esportate
  (`classify :105`, `extract :189`). Spostarla in un modulo condiviso è un commit a parte,
  dopo il fix di classify, per non accavallarsi con quella sessione. Nella route nuova si
  importa dal modulo condiviso appena esiste; fino ad allora va segnalata come terza copia.
- **Estrazione del testo:** nessuna libreria presente. `pdf-parse`, `pdfjs-dist` e `unpdf`
  mancano da `node_modules` e da `package.json`; oggi il PDF viaggia intero in base64
  (`classify route.ts:245`, `:269-270`). Si aggiunge `pdfjs-dist` (decisione 5) con
  estrazione **nel browser**; al server arriva solo il testo. Così:
  - nessun file su storage, quindi nessun file orfano;
  - nessun limite di 4,5 MB sul corpo della richiesta Vercel;
  - nessun problema di policy storage: il path deve cominciare con l'uuid della residenza
    (`czero_storage_first_uuid`), che prima della creazione non esiste.

### 4. Mappa campi → documenti

Nel codice ci sono 18 `doc_type` (`document-classification.ts:29-48`) e 14 `SISTEMI`
(`:199-214`): le "14 categorie" della richiesta sono i SISTEMI. "Relazione tecnica" non è
un `doc_type`.

| Campo del wizard | Estraibile da | Note |
|---|---|---|
| Nome | capitolato, relazione tecnica | confidenza media, spesso è il titolo |
| Indirizzo | agibilità, APE, capitolato | alta |
| Classe energetica | APE | l'estrazione APE ha già `classe_energetica` (`document-extraction.ts:102-106`); con APE per unità le classi possono essere più di una |
| Numero ed etichette delle unità, piano | capitolato, relazione tecnica, agibilità (subalterni) | |
| Scala | stessi documenti | dentro l'etichetta (decisione 2) |
| 19 dotazioni | capitolato, relazione tecnica; APE per generatore, fotovoltaico e ACS | il silenzio del documento non vale mai "no" |
| **Mai estraibili, a mano** | — | data di consegna (la data dell'agibilità al massimo come suggerimento a bassa confidenza), "Edificio esistente", data di consegna delle unità, le 12 date per categoria |

**Tre stati delle dotazioni.** Con `p_features` presente, una chiave assente equivale a "no"
sul piano: la voce condizionale non nasce (044:157-169). In revisione, "non risulta nel
documento" resta quindi vuoto e **blocca la creazione** finché l'umano non risponde sì o no.
Al DB arrivano sempre 19 risposte, come oggi.

### 5. Controlli di coerenza

In un modulo puro con il suo script `verify:`, eseguito nel client durante la revisione e
ripetuto sul server alla creazione. L'autorità restano `parseUnits` e i controlli già
presenti in `createResidence`.

- Unità elencate diverse dal numero dichiarato ("n. 15 alloggi" ma 12 righe).
- Etichette duplicate.
- Campi obbligatori mancanti: nome, indirizzo, data di consegna; dotazioni non risolte.
- Indirizzo già usato in un'altra residenza dello stesso builder: avviso, non blocco, perché
  nel DB ci sono già duplicati veri ("Residenza Arcella" due volte, l'indirizzo di Dublin tre
  volte).
- Dotazioni contraddittorie, per esempio `acs_centralizzata` sì con `centrale_termica` no,
  oppure `canna_fumaria_collettiva` senza generatore. Solo avvisi.
- (V2) Valori diversi tra documenti diversi sullo stesso campo.

### 6. Rischi

- **`completions`:** nessun percorso nuovo la tocca.
- **Cron:** non gira in locale. Con la bozza nel browser, prima della creazione non esiste
  nessuna voce.
- **File orfani:** zero, perché il testo viene estratto nel browser e il PDF non va su storage.
- **PDF scansionati:** non hanno testo. Va mostrato "nessun testo leggibile, usa il wizard".
- **Prompt injection dal testo del PDF:** contenuta da schema vincolato e revisione umana.
- **Costo AI:** una chiamata per residenza. Stima indicativa: circa 2.000 token di system
  prompt più il testo (un capitolato di 40 pagine fa circa 25-30.000 token), e 2-4.000 token
  in uscita per via delle citazioni. Il costo reale si legge dal log `[ai-usage]` della prima
  prova. Tetto sui caratteri inviati.
- **Bug class fuori scope:** `new/actions.ts:14` (decisione 3, commit 1b) e `:89` (P2).

## Dotazioni dopo la creazione (domanda di Filippo, 07/11)

**Non sono modificabili da nessuna parte, e nulla rigenera le voci.**

- Nel codice `residence_features` compare solo nei commenti di `src/lib/residence-features.ts`.
  `RESIDENCE_FEATURES` è usata solo da `new/page.tsx` e `new/actions.ts`: nessuna pagina,
  action o route modifica le dotazioni dopo la creazione (grep su `src`).
- Lato DB, `authenticated` non ha INSERT, UPDATE o DELETE su `residence_features`
  (030:100 `REVOKE INSERT, UPDATE, DELETE ON public.residence_features FROM authenticated`).
  Scrivono solo la RPC di creazione (044) e, in lettura, `czero_add_unit_with_items` (047),
  che usa le dotazioni per le unità aggiunte dopo.
- Sulle voci, l'unico cambiamento successivo è `activation_status` (`inclusa`, `esclusa`,
  `archiviata`, migrazione 011:26), per esempio
  `admin/residences/[id]/fornitori/actions.ts:245`. Funziona solo su voci che esistono già:
  una voce non generata per un "No" non c'è, quindi non si può includere.

**Conseguenza per il bottone del punto 7:** un "No" sbagliato toglie le voci in modo
permanente, sia dalla residenza sia dalle unità aggiunte dopo con "Aggiungi". Oggi si
recupera solo via SQL con il service role. Proposta per l'interfaccia: "Segna le rimanenti
come No" chiede conferma e mostra l'elenco delle dotazioni interessate e il numero di voci
di manutenzione che non verranno generate. Il conteggio si può calcolare nel client dai
template condizionali, letti con una SELECT dalla pagina server.

## Builder delle prove

Il builder della nuova residenza è quello del profilo di chi crea
(`new/actions.ts:21`, `p_builder_id: profile.builder_id` a `:78`).

| Account | Ruolo | Builder |
|---|---|---|
| `pippoloro02@gmail.com` | super_admin | **Furlan srl** (`9923adbe-cfb4-47d3-b939-747bb30bcfe2`) |
| `casazero.prova@gmail.com` | super_admin | **TEST prova Nicola** (`c71e9e4e-b90e-479b-85d7-cb352b798b5e`) |

**Le prove con `pippoloro02` finirebbero in Furlan.** Per rispettare la decisione 4, le
prove di creazione vanno fatte con `casazero.prova@gmail.com`.

Attenzione anche a un altro punto: **TEST wizard A è in Furlan srl**, non in TEST prova
Nicola (che contiene solo Residenza Prova), e Cavaccio è in "Archivio pre-demo". Come
gemello di confronto e per l'avviso sull'indirizzo doppio, dentro TEST prova Nicola c'è
quindi solo **Residenza Prova**: l'avviso confronta solo residenze dello stesso builder.

## Piano di prova

**Claude Code da solo:**
- `npm run verify` e gli script `verify:` sui moduli puri.
- `npm run build` dopo l'aggiunta di `pdfjs-dist`.
- Un PDF di prova generato con `@react-pdf/renderer`, già presente.
- Una chiamata alla route senza login, che deve rispondere 401.
- SELECT dopo la creazione: unità, 19 righe di dotazioni, numero di voci per scope, builder
  uguale a `c71e9e4e-…`, confronto con Residenza Prova.

**Serve Filippo:**
- PDF veri o di prova realistici.
- La prova dal vivo con `casazero.prova@gmail.com`.
- La conferma che nessuna `TEST draft …` sia finita in Furlan (la SELECT la fa Claude Code,
  la verifica visiva Filippo).

## Piano dei commit (versione minima: 1 PDF, nessuna migrazione)

| # | Commit | Prova |
|---|---|---|
| 1 | Separare validazione e preparazione dell'input di `createResidence` in un modulo condiviso (`src/lib/residence-input.ts`): l'action su FormData diventa un adattatore, comportamento identico | `npm run verify` + `npm run verify:resinput` + una creazione dal wizard manuale (`TEST draft wizard`, con `casazero.prova`) confrontata via SQL con Residenza Prova |
| 1b | Fix di `new/actions.ts:14`: destrutturare `error` della lettura di `profiles`, loggarlo, distinguere "Errore tecnico, riprova" da "Permessi insufficienti" | `npm run verify` + caso nello script `verify:resinput` |
| 2 | Modulo puro `src/lib/residence-draft.ts`: schema AI, normalizzazione e validazione, trasformazione proposta → input, tre stati delle dotazioni, controlli di coerenza, conteggio delle voci non generate per "Segna le rimanenti come No" | `npm run verify` + `npm run verify:resdraft` |
| 3 | Dipendenza `pdfjs-dist` a versione esatta e `extractPdfText`: import dinamico, tetto su pagine e caratteri, rilevamento dei PDF scansionati | `npm run verify` + `npm run verify:pdftext` sul PDF di prova + `npm run build` |
| 4 | Route `/api/residence-draft` (POST con il testo): solo super_admin, `error` sempre letto, nessuna scrittura nel DB, log `[ai-usage]` | `npm run verify` + curl senza login → 401 + una chiamata da loggato con controllo del log |
| 5 | Interfaccia: ingresso "Da documento" in Nuova residenza; revisione a pagina intera con componenti estratti dal wizard; confidenza e citazione per campo; dotazioni a tre stati con il bottone e il conteggio; avvisi di coerenza; `beforeunload`; "Crea residenza" sulla stessa `createResidence` | `npm run verify` + `npm run build` + prova dal vivo + SELECT di controllo |

Il commit 5 è il più grande. Se l'estrazione dei componenti del wizard pesa da sola, va
diviso in 5a (estrazione senza cambiare comportamento, wizard manuale riprovato) e 5b
(pagina di revisione).

## Backlog

- **P2:** `new/actions.ts:89` mostra all'utente il messaggio grezzo della RPC.
- **V2:** più PDF con fusione dei risultati e conflitti tra documenti; tabella
  `residence_drafts`; PDF conservati come documenti della residenza dopo la creazione;
  `isServiceUnavailableError` in un modulo condiviso; possibile `source = 'ai'` su
  `residence_features` (il CHECK lo ammette già, ma la RPC scrive `'wizard'`: servirebbe
  `CREATE OR REPLACE` della RPC); una superficie per modificare le dotazioni dopo la
  creazione con rigenerazione delle voci (oggi assente, vedi sopra).

## Aperto

- La residenza di confronto per il commit 1 dentro TEST prova Nicola è solo Residenza Prova:
  basta così o ne serve un'altra creata a mano?
- Il conteggio delle voci non generate dal bottone del punto 7: calcolo nel client dai
  template, oppure solo l'elenco delle dotazioni senza numero.

## Decisioni 9/11

1. **Gemello di confronto:** Residenza Prova (builder TEST prova Nicola, `casazero.prova@gmail.com`)
   basta. Nessuna seconda residenza da creare a mano.
2. **Bottone di creazione (commit f):** mostra una riga "N voci di manutenzione non verranno
   generate" più l'elenco delle dotazioni a No. Il conteggio si calcola nel client dai template
   condizionali (chiude la seconda domanda aperta).
3. **Dotazioni modificabili dopo la creazione:** si vuole, ma è un concern a parte. Non si fa
   ora: alla fine di a-c solo una FASE 0 read-only (nessuna modifica).

Esecuzione: commit a, b, c (residence-input, fix `new/actions.ts:14`, residence-draft) uno alla
volta, con stop e ok di Filippo prima di ogni commit. d-f non iniziano senza ok.

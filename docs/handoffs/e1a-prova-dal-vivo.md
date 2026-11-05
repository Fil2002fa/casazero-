# E1a — prove dal vivo (6/11)

Cosa si prova: Excel a più schede, quadro unità × documenti, assegna/cambia unità
(con evento nel registro), colonne di origine e confidenza, cause dei fallimenti nei
batch. Tutto il codice è in locale: **il push non è stato fatto**, quindi le prove
si fanno con `npm run dev` (finestra PowerShell separata) e non in produzione.
Il dev server che c'era è stato fermato per il build: riavvialo.

Stato verificato a monte (non da rifare): `npm run build` pulito, `npm run verify`
pulito, otto script `verify:*` verdi. Non è mai stata eseguita la UI né la route
Excel con una sessione vera: sono le prove qui sotto.

## 0. Prerequisiti (da sistemare PRIMA di cominciare)

- **Account super_admin**: `casazero.prova@gmail.com`, builder "TEST prova Nicola"
  (`c71e9e4e-b90e-479b-85d7-cb352b798b5e`). Stato al 5/11: 1 profilo, 0 residenze,
  catalogo con 35 voci attive e 11 attese base di checklist.
  Il login in locale di questo account non è stato provato in questa sessione.
- **Account admin: NON ESISTE** nel builder di prova (oggi c'è un solo profilo).
  Serve un secondo account, da creare da `/admin/administrators` con un invito
  amministratore (il sistema genera il link, nessuna email parte) e poi da
  assegnare a "Residenza Prova". Decidi tu quale email usare. Senza questo account
  la parte B (admin) non si può fare.
- **Chiave AI**: `ANTHROPIC_API_KEY` presente in `.env.local` (verificata solo la
  presenza). Senza, la classificazione mostra il banner di servizio non disponibile.
- **Le query** nella sezione "Query di controllo" sono solo SELECT, già provate a
  vuoto sul DB. Si lanciano da Supabase o da Claude Code.
- Tutto gira sul progetto Supabase di produzione (`kuvekkseclhhcamojysj`): le
  scritture delle prove sono vere, ma limitate al builder di prova.

## 1. I documenti di prova (13)

Residenza "Residenza Prova", unità A1, A2, B1, B2.

| # | Documento | Dove caricarlo | Tipo atteso |
|---|---|---|---|
| 1 | APE A1 | unità A1 | `ape` |
| 2 | Planimetria A1 | unità A1 | `planimetria_catastale` |
| 3 | DiCo elettrica A1 | unità A1 | `dich_conformita_dm37`, sistema elettrico |
| 4 | Planimetria A2 | unità A2 | `planimetria_catastale` |
| 5 | DiCo elettrica A2 | unità A2 | `dich_conformita_dm37`, elettrico |
| 6 | APE B1 | unità B1 | `ape` |
| 7 | Planimetria B1 | unità B1 | `planimetria_catastale` |
| 8 | DiCo elettrica B1 | unità B1 | `dich_conformita_dm37`, elettrico |
| 9 | Planimetria B2 | unità B2 | `planimetria_catastale` |
| 10 | DiCo elettrica B2 | unità B2 | `dich_conformita_dm37`, elettrico |
| 11 | Libretto impianto | residenza | `libretto_impianto` |
| 12 | Agibilità | residenza | `agibilita` |
| 13 | DiCo elettrica che cita "interno B2" | residenza (nessuna unità) | `dich_conformita_dm37`, elettrico |

A2 e B2 non hanno l'APE: è voluto.

**Matrice attesa dopo classificazione ed estrazione** (stati del quadro "Documenti per unità"):

| Unità | APE | Planimetria catastale | DiCo · Impianto elettrico |
|---|---|---|---|
| A1 | Presente (classe, valida fino al) | Presente (data) | Presente (impresa, data) |
| A2 | **Mancante** | Presente | Presente |
| B1 | Presente | Presente | Presente |
| B2 | **Mancante** | Presente | Presente |

Sotto il titolo del quadro: "Da assegnare a un’unità: 1 documento." — **solo se**
l'estrazione del documento 13 ha letto l'unità ("interno B2") o l'ambito "unità"
(controllo al passo 4).

Se l'AI sbaglia un tipo o il sistema, non è un fallimento della prova: usa
"Rivedi classificazione" e annotalo (è un dato utile per Nicola).

## Parte A — super_admin (`casazero.prova`)

### Passo 1 — Residenza e unità

- **Fai**: login, `/admin/residences/new`, crea "Residenza Prova" con 4 unità A1, A2, B1, B2.
  Se il wizard offre "già consegnate", usa una data di circa 6 mesi fa (es. 01/05/2026):
  così le voci hanno scadenze, alcune già passate.
- **Vedi**: la residenza compare in elenco; 4 unità.
- **DB**: Q1. Atteso: 4 righe, `builder_id = c71e9e4e-…` su tutte.

### Passo 2 — Upload dei 13 documenti

- **Fai**: in `/admin/residences/<id>/documenti` → "Carica documenti". Per ogni unità
  scegli "Unità" e l'unità giusta (documenti 1-10), poi "Residenza" per 11-13.
- **Vedi**: dopo il caricamento parte la classificazione (progresso "Classificazione: N di M"),
  poi l'estrazione. Alla fine nessun pulsante "Classifica documenti" o "Estrai dati"
  residuo (o con conteggio 0).
- **DB**: Q2. Atteso: 13 righe; `unita` = A1… per 1-10, vuoto per 11-13; `classification_status`
  `completata` per i documenti sicuri, `da_revisionare` per quelli sotto 0,8 di confidenza.
  Q3: una riga per ogni documento classificato (tutti i 13 tipi attesi sono estraibili) con
  `status = completata`, `for_doc_type` uguale al `doc_type` di Q2, `valid_until` valorizzata sulle APE.

### Passo 3 — Il quadro

- **Fai**: guarda la pagina Documenti, in cima (sopra "Da caricare").
- **Vedi**: la matrice attesa qui sopra. Le celle "Presente" hanno sotto i dati chiave
  (APE: "Classe energetica: …" e "Valida fino al: …"; planimetria: "Data documento: …";
  DiCo: "Impresa installatrice: …" e "Data documento: …"). Unità in ordine A1, A2, B1, B2.
- **Controlla**: A2 e B2 hanno APE "Mancante" e nient'altro di mancante; un documento
  "Da rivedere" appare come "Da verificare" nella sola cella del suo tipo proposto.
- **DB**: Q2 (che i `doc_type`/`sistema` coincidano con quello che il quadro mostra).

### Passo 4 — Il documento 13 e l'avviso

- **Fai**: trova la DiCo senza unità. Guarda in Q3 `ambito` e `unita_riferimento`.
- **Vedi / controlla**: se `unita_riferimento` = "interno B2" (o `ambito` = `unita`), il quadro
  mostra "Da assegnare a un’unità: 1 documento." Se l'AI NON l'ha letta (null), imposta
  tu l'unità con "Correggi dati" → "Unità di riferimento" = `interno B2`, salva:
  l'avviso deve comparire. (Questo prova anche la correzione a mano, vedi passo 8.)
- **DB**: Q3 (colonne `ambito`, `unita_riferimento`), Q4 se hai corretto a mano.

### Passo 5 — Assegna unità

- **Fai**: sulla card del documento 13 → "Assegna unità" → scegli B2 → Salva.
- **Vedi**: la card passa sotto "B2" (sezione Per unità); il bottone ora dice "Cambia unità";
  l'avviso "Da assegnare…" sparisce; il quadro per B2 resta "Presente" sulla DiCo.
  Nel registro attività (`/admin/residences/<id>/attivita`) compare
  «Documento «…» assegnato a un’unità» con soggetto "Unità B2".
- **DB**: Q2 (`unita` = B2). Q5: una riga `documento_unita_cambiata`, `actor_role` = `super_admin`,
  `unita` = B2, payload con **esattamente** `document_id, title, doc_type, from_unit_id (null), to_unit_id`.

### Passo 6 — Cambia e togli unità

- **Fai**: stesso documento: "Cambia unità" → A2 → Salva; poi "Cambia unità" → "Nessuna unità
  (documento della residenza)" → Salva. Poi riprova a salvare senza modificare la scelta.
- **Vedi**: due frasi nel registro: «…spostato in un’altra unità» (soggetto A2) e
  «…riportato alla residenza» (soggetto A2: l'unità di origine). Il Salva è disabilitato
  quando la scelta non cambia, quindi non si può nemmeno produrre un evento "senza cambiamento".
- **DB**: Q5: due righe nuove; nella seconda `from_unit_id` = A2, `to_unit_id` = null,
  `unita` = A2. Nessuna riga in più per il tentativo senza cambiamento.

### Passo 7 — Effetto sulla checklist (documentato nel pannello)

- **Fai**: sull'agibilità (documento 12): "Assegna unità" → A1 → Salva. Guarda "Da caricare".
  Poi riportala a "Nessuna unità".
- **Vedi**: con l'agibilità assegnata a un'unità la voce Agibilità torna tra quelle mancanti;
  riportandola alla residenza è di nuovo soddisfatta. Il testo del pannello lo anticipa.
- **DB**: Q5 (due eventi in più). Nessun'altra tabella cambia.

### Passo 8 — Correggi dati, origine del dato

- **Fai**: sull'APE A1 → "Correggi dati" → cambia "Classe energetica" → Salva.
- **Vedi**: badge "Dati corretti a mano" sulla card; il quadro mostra la nuova classe per A1.
- **DB**: Q4: una riga (`ape`, `classe_energetica`, valore nuovo). Q5: `documento_corretto`.
- **Poi**: "Ripristina valore AI" → Q4 vuota per quel campo; badge sparito.
  (Rifai la correzione prima del passo 10, così l'Excel la mostra.)

### Passo 9 — Un documento da rivedere (opzionale)

- **Fai**: carica nella residenza un PDF estraneo (brochure, foto di cantiere).
- **Vedi**: stato "Da rivedere" o "Nessuna categoria", a seconda dell'AI.
- **DB**: Q2: `classification_status` e `classification_confidence` per capire le fasce.

### Passo 10 — L'Excel da super_admin

- **Fai**: "Esporta Excel" nella pagina Documenti. Apri il file.
- **Nome file**: `dati-residenza-prova-2026-11-06.xlsx` (data del giorno).
- **Schede, in quest'ordine** (4): Riepilogo unità · Scadenze · Fornitori · Documenti.
- **Riepilogo unità** — 4 righe A1, A2, B1, B2 in ordine naturale. Colonne: Unità, Piano,
  Consegna (data, oppure "Non consegnata"), Residente ("Nessun account" se non ci sono
  account attivi), Documenti assegnati (numeri: dopo il passo 6 il documento 13 è tornato
  alla residenza, quindi A1 3, A2 2, B1 3, B2 2), Documenti da verificare, Voci attive, Voci scadute,
  Prossima scadenza, poi coppie Stato/dati per APE, planimetria, DiCo elettrica.
  Controlla che A2 e B2 dicano "Mancante" sull'APE.
- **Scadenze** — una riga per voce del piano attivo; parti comuni per prime, poi A1…B2.
  Le voci **promemoria**: Stato "Consigliata · ogni N mesi", Prossima scadenza **vuota**,
  mai "Scaduta" (anche se la data sarebbe passata). Le altre: Pianificata / Scaduta /
  In corso / In attesa di consegna. C'è la colonna Fornitore (sei super_admin).
- **Fornitori** — vedi passo 11.
- **Documenti** — 13 righe, 17 colonne: le 12 di sempre + File, Stato classificazione,
  Confidenza classificazione (Alta/Media/Bassa, vuota se non registrata), Origine del dato
  (AI / Corretto a mano / Da verificare / Non estratto / vuoto per "altro"), Campi corretti
  a mano. Il documento corretto al passo 8 dice "Corretto a mano" e "Classe energetica".
  La planimetria e il libretto: "AI". I documenti di prova non classificati: "Da verificare".
- **DB**: Q6 (conteggi del piano). Atteso: il numero di righe della scheda Scadenze =
  somma di `nel_piano_attivo` su tutte le righe di Q6; il numero di promemoria = somma di
  `di_cui_promemoria`.

### Passo 11 — Fornitori

- **Fai**: (a) sulla DiCo di A1, "Rivedi classificazione": se compare la proposta del fornitore,
  confermala. (b) Dalla pagina Fornitori della residenza aggiungi a mano un fornitore con
  un impianto. Riesporta.
- **Vedi**: scheda Fornitori con una riga per fornitore, ordinata A-Z; "Origine del collegamento"
  = "Da documento" (a), "Manuale" (b), "Da documento e manuale" se ci sono entrambi;
  "Documenti collegati" con il titolo della DiCo; P.IVA come testo (con eventuali zeri iniziali).
- **DB**: Q7.

### Passo 12 — Cause dei fallimenti nei batch

- **Fai**: carica 3 PDF nuovi; appena parte "Classificazione: 1 di 3" apri gli strumenti del
  browser → Network → "Offline". Aspetta la fine del batch, poi torna online.
- **Vedi**: sotto i pulsanti: "N documenti non classificati — riprova con Classifica documenti.
  Causa: connessione non riuscita." Poi "Classifica documenti (N)" li recupera.
- **Nota**: un documento in volo al momento dello stacco potrebbe restare "in corso": è la
  fragilità nota del batch nel browser, già in backlog P1 (non fa parte di questa prova).
- **Non provabile da qui**: la pagina "Impossibile caricare i documenti per un problema
  tecnico" (guasto di lettura lato server). Coperta solo da tsc, lint e build.

### Passo 13 — Perimetro del builder

- **Fai**: apri, loggato come `casazero.prova`, `/api/documenti-xlsx?residenceId=<id di una residenza di un altro builder>` (id da Q9).
- **Vedi**: risposta JSON `{"error":"Accesso negato"}` con stato 403, nessun file.
- **Fai**: stessa cosa con un id inesistente (non UUID) → 404 "Residenza non trovata".

## Parte B — admin (account da creare, assegnato a "Residenza Prova")

### Passo 14 — Assegnazione

- **DB**: Q8 mostra l'admin assegnato, con `role = admin` e `builder_id` del builder di prova.

### Passo 15 — Quadro e assegna unità

- **Fai**: con l'admin apri la pagina Documenti.
- **Vedi**: lo stesso quadro del super_admin, identico. "Assegna unità" funziona.
- **DB**: Q5: l'evento ha `actor_role` = `admin` e `actor_name` dell'admin.

### Passo 16 — Excel da admin

- **Fai**: "Esporta Excel".
- **Vedi**: **3 schede** (Riepilogo unità, Scadenze, Documenti): **nessuna scheda Fornitori**.
  Scadenze con **8 colonne**, senza la colonna Fornitore. Cerca nel file il nome del fornitore
  creato al passo 11: non deve comparire da nessuna parte.
- **Controlla**: le altre schede coincidono con quelle del super_admin.

### Passo 17 — Cosa l'admin non deve fare

- **Vedi**: nel pannello documenti non c'è la gestione della checklist (esclusioni) né la
  proposta fornitore. `/admin/residences/<id>/fornitori` non è accessibile.
- **Fai**: `/api/documenti-xlsx?residenceId=<id di una residenza a cui NON è assegnato>`
  → 403 `{"error":"Accesso negato"}`.

## Query di controllo (solo SELECT)

La residenza si trova per nome; il builder di prova è `c71e9e4e-b90e-479b-85d7-cb352b798b5e`.

**Q1 — residenza e unità**
```sql
SELECT r.id AS residence_id, r.builder_id, u.label, u.floor, u.delivery_date
FROM residences r JOIN units u ON u.residence_id = r.id
WHERE r.name = 'Residenza Prova' ORDER BY u.label;
```

**Q2 — documenti**
```sql
SELECT d.file_name, u.label AS unita, d.doc_type, d.sistema, d.classification_status,
       d.classification_confidence, d.reviewed_by IS NOT NULL AS rivisto
FROM documents d JOIN residences r ON r.id = d.residence_id LEFT JOIN units u ON u.id = d.unit_id
WHERE r.name = 'Residenza Prova' ORDER BY u.label NULLS FIRST, d.file_name;
```

**Q3 — estrazioni**
```sql
SELECT d.file_name, e.for_doc_type, e.status, e.ambito, e.unita_riferimento,
       e.document_date, e.valid_until, e.fields
FROM document_extractions e JOIN documents d ON d.id = e.document_id
JOIN residences r ON r.id = d.residence_id
WHERE r.name = 'Residenza Prova' ORDER BY d.file_name;
```

**Q4 — correzioni a mano**
```sql
SELECT d.file_name, o.for_doc_type, o.field_key, o.value, o.set_at
FROM document_field_overrides o JOIN documents d ON d.id = o.document_id
JOIN residences r ON r.id = d.residence_id
WHERE r.name = 'Residenza Prova' ORDER BY d.file_name, o.field_key;
```

**Q5 — registro attività dei documenti**
```sql
SELECT e.created_at, e.event_type, e.actor_role, e.actor_name, u.label AS unita, e.payload
FROM activity_events e JOIN residences r ON r.id = e.residence_id
LEFT JOIN units u ON u.id = e.unit_id
WHERE r.name = 'Residenza Prova'
  AND e.event_type IN ('documento_unita_cambiata', 'documento_corretto', 'documento_caricato', 'documento_classificato')
ORDER BY e.created_at;
```

**Q6 — voci del piano**
```sql
SELECT coalesce(u.label, 'Parti comuni') AS soggetto,
       count(*) FILTER (WHERE m.activation_status = 'inclusa' AND t.is_active) AS nel_piano_attivo,
       count(*) FILTER (WHERE m.activation_status = 'inclusa' AND t.is_active
                          AND coalesce(m.completion_mode, t.completion_mode) = 'promemoria') AS di_cui_promemoria,
       count(*) AS totali
FROM maintenance_items m JOIN residences r ON r.id = m.residence_id
JOIN maintenance_templates t ON t.id = m.template_id LEFT JOIN units u ON u.id = m.unit_id
WHERE r.name = 'Residenza Prova' GROUP BY 1 ORDER BY 1;
```

**Q7 — fornitori e collegamenti**
```sql
SELECT s.name, s.vat_number, si.sistema, si.source, si.source_document_id IS NOT NULL AS da_documento
FROM suppliers s
LEFT JOIN supplier_installations si ON si.supplier_id = s.id
  AND si.residence_id = (SELECT id FROM residences WHERE name = 'Residenza Prova'
                         AND builder_id = 'c71e9e4e-b90e-479b-85d7-cb352b798b5e')
WHERE s.builder_id = 'c71e9e4e-b90e-479b-85d7-cb352b798b5e' ORDER BY s.name;
```

**Q8 — admin assegnati**
```sql
SELECT p.full_name, p.role, p.builder_id
FROM admin_assignments a JOIN profiles p ON p.id = a.profile_id
JOIN residences r ON r.id = a.residence_id WHERE r.name = 'Residenza Prova';
```

**Q9 — residenze di altri builder (per il passo 13)**
```sql
SELECT r.id, r.name FROM residences r
WHERE r.builder_id <> 'c71e9e4e-b90e-479b-85d7-cb352b798b5e' ORDER BY r.name LIMIT 3;
```

## Cosa annotare

Per ogni passo: PASSA / NON PASSA / non eseguito, e se non passa lo schermo o la riga di
DB che lo mostra. Tre cose valgono più delle altre per la consegna a Nicola: A2 e B2
senza APE nel quadro e nell'Excel; "Consigliata" mai "Scaduta" sulle promemoria; l'admin
che non vede mai fornitori.

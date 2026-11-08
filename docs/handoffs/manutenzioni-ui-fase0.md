# FASE 0 — Manutenzioni: diagnosi per il redesign della UI

Stato: read-only. Nessuna modifica a codice o DB. Non committare questo file.
Scritto man mano; la parte DB (domande 2, 3-dati, 5-SQL, 7-DB, 8-struttura, 10-RLS) viene da query SELECT eseguite via MCP su `kuvekkseclhhcamojysj`.

## Vincoli dichiarati
- Ampiezza: tre viste intere (costruttore, admin, residente), nessuna variante ridotta.
- Strutturale: niente JSX duplicato tra ruoli; componenti condivisi, si ramifica solo sulle prop che differiscono.
- `completions` solo struttura e conteggi.

---

## 2. MODELLO DATI (da `information_schema`)

### `maintenance_items` (riga = una voce su una unità, oppure sulle parti comuni se `unit_id` è NULL)
| colonna | tipo | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| template_id | uuid | NO | — |
| residence_id | uuid | NO | — |
| unit_id | uuid | SI | — (NULL = parti comuni) |
| frequency_months | int4 | SI | — (override; NULL = eredita dal template) |
| priority | enum maintenance_priority (N1/N2/N3) | SI | — (LEGACY) |
| warranty_info | text | SI | — |
| supplier_id | uuid | SI | — |
| next_due_date | date | SI | — |
| status | enum maintenance_status (in_attesa / scaduta / in_corso / completata) | NO | 'in_attesa' |
| created_at / updated_at | timestamptz | NO | now() |
| completion_mode | enum completion_mode (residente / amministratore / promemoria) | SI | — (NULL = eredita) |
| obligation_type | enum obligation_type (**A / B / C**) | SI | — (NULL = eredita) |
| activation_status | enum item_activation (inclusa / esclusa / archiviata) | NO | 'inclusa' |
| due_basis_override | date | SI | — (migrazione 042, base della cascata, solo super_admin) |

Nota: l'enum `obligation_type` nel DB ha etichette `A | B | C`, non "Obbligo di legge / Raccomandata / Consiglio". Le etichette italiane vivono nel codice (da verificare dove, vedi sezione codice).

### `maintenance_templates` (catalogo)
id, title, category (text, = "sistema": Termico, Elettrico…), description (text, null), frequency_months (NOT NULL), priority (NOT NULL, legacy), scope (`unit` | `condominium`), sort_order, created_at, completion_mode (null), obligation_type (null), is_active (default true), is_conditional (default false), condition_key (text, null → chiave in `residence_features`).

### Colonne che NON esistono (rilevanti per il mockup)
- Nessuna colonna "perché conta" (testo per voce) né su template né su item. `description` esiste ma è per lo più vuota sulle voci legacy e contiene riferimenti normativi sulle voci nuove (26-45).
- Nessuna colonna "documento atteso" su template o item. Esiste `document_checklist_template` (doc_type, sistema, label, scope, …) ma NON è collegata ai template di manutenzione (nessuna FK; `sistema` è testo minuscolo, `category` è testo capitalizzato). 11 righe attive, tutte documenti di fascicolo, non per voce.
- Nessuna colonna "regola del ritardo" (rolling vs date fisse).
- Nessuna colonna "anticipo promemoria". `notifications` ha solo type/payload/channel/status, nessun lead time.
- Nessuna colonna "si applica" distinta: l'equivalente è `activation_status` (inclusa/esclusa/archiviata).

### `completions` (solo struttura, off-limits in scrittura)
id, item_id (NOT NULL), unit_id (null), residence_id, completed_at (date), performed_by_profile_id (null), performed_by_name (text, null), notes (text, null), created_at.
**Non esiste una colonna "esito".** Gli allegati sono in `attachments` (completion_id, storage_path, file_name, file_size, mime_type). Conteggi: 23 completions (13 senza unit_id = parti comuni; 16 con performed_by_name; 12 con notes), 4 attachments.

### `suppliers`
id, residence_id, builder_id, name, phone, email, categories text[], vat_number, created_at. Il fornitore è **per residenza** (non per costruttore). `supplier_installations` lega fornitore + residenza + `sistema` (text) + source.

### `residence_features` (dotazioni)
id, residence_id, feature_key, present (bool), source, confirmed_by, confirmed_at, created_at. Si collega ai template via `maintenance_templates.condition_key`.

---

## 3-dati. LA CONFIGURAZIONE È PER UNITÀ O PER VOCE? — query

Righe item totali: Furlan srl 385 (129 coppie residenza×template), TEST prova Nicola 38 (14 coppie).

Query: per (builder, residenza, template) quante configurazioni distinte per frequency_months / completion_mode / obligation_type / warranty_info / supplier_id / activation_status / priority / due_basis_override; riportate solo le coppie con più di un valore distinto.

**Furlan srl — 2 coppie su 129 con valori diversi tra unità della stessa voce:**

| residenza | voce | righe | freq distinte | fornitore distinti |
|---|---|---|---|---|
| Residenza Santa Giustina | Pulizia filtri climatizzatore | 5 | 2 | 2 |
| residenza teolo | Test del differenziale (tasto T) | 12 | 3 | 1 |

**TEST prova Nicola — 0 coppie divergenti.**

Dettaglio delle righe con override in Furlan (tutte quelle esistenti):

| residenza | unità | voce | freq template | freq item | fornitore | prossima | completions |
|---|---|---|---|---|---|---|---|
| Santa Giustina | (comuni) | Manutenzione cancelli e portoni motorizzati | 12 | **18** | — | 2028-04-25 | 1 |
| Santa Giustina | Appartamento furlan 1 | Pulizia filtri climatizzatore | 6 | 6 | sì (1c1a3c89) | 2026-12-01 | 0 |
| residenza teolo | Appartamento 1 | Test del differenziale (tasto T) | 6 | **699** | — | 2027-03-19 | 0 |
| residenza teolo | Appartamento 2 | Test del differenziale (tasto T) | 6 | **60** | — | 2027-03-19 | 0 |

Osservazioni:
- 699 mesi e 60 mesi su "Test del differenziale" sono valori palesemente di test: non sono configurazione reale, ma sono la prova che il modello per-unità oggi può divergere.
- `next_due_date` di quelle due righe teolo è identica (2027-03-19) pur con frequenze diverse → conferma che cambiare `frequency_months` sull'item **non ricalcola** `next_due_date` (vedi sezione 5).
- Il caso Santa Giustina "filtri climatizzatore" ha freq item = freq template (6 = 6): l'override è scritto ma uguale al default. Il fornitore differisce perché una sola unità lo ha.
- Cancelli: la riga è delle parti comuni (unit_id NULL) e ha 1 completamento: con freq override 18 (template 12) e prossima 2028-04-25.

**Conteggi di override su tutte le righe** (per costruttore):

| builder | freq override | completion_mode override | obligation_type override | warranty_info | supplier_id | priority valorizzata | non 'inclusa' | due_basis_override |
|---|---|---|---|---|---|---|---|---|
| Furlan srl | 4 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| TEST prova Nicola | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Archivio pre-demo (demo/test, throwaway) | 13 | 6 | 0 | 184 | 195 | 21 | 204 | 0 |

Nota: `Residenza Cavaccio` (demo throwaway, Archivio pre-demo) ha molte divergenze per unità (fornitore, frequenza, modalità, priority) perché è il dataset di prova della vecchia UI "Configura per unità". Non è un vincolo di progetto.

Nota sul legacy: `priority` sulle righe item è NULL ovunque tranne 21 righe in Archivio pre-demo. Cioè il dual-write di `priority` (CLAUDE.md) sulle righe item di Furlan/Nicola non ha lasciato traccia: le viste leggono `priority` dal template, non dall'item (da confermare nel codice, sezione 10).

---

## 5-SQL. CALCOLO DELLE SCADENZE (funzioni e trigger nel DB)

Trigger su `completions` e `maintenance_items` (da `information_schema.triggers`):
- `on_completion_inserted` AFTER INSERT su `completions` → `czero_recalc_due()`
- `maintenance_items_role_column_guard` BEFORE UPDATE su `maintenance_items` → `czero_maintenance_items_role_column_guard()`
- `maintenance_items_updated_at` BEFORE UPDATE → `set_updated_at()`

**`czero_recalc_due()`** (SECURITY DEFINER): legge `COALESCE(mi.frequency_months, mt.frequency_months)` dell'item e imposta
`next_due_date = (NEW.completed_at::DATE + (v_freq || ' months')::INTERVAL)::DATE`, `status='in_attesa'`.
→ **La prossima scadenza si conta dall'ultima esecuzione** (data del completamento, non la data prevista). Questa è l'unica regola esistente; non è configurabile.

**`czero_create_residence_with_units(...)`**: alla creazione, per ogni template attivo inserisce un item con `next_due_date = COALESCE(rcd.delivery_date, delivery_date) + freq`. Per le voci di unità: se l'unità ha `delivery_date` si usa quella (o la data categoria), se non ce l'ha e la voce è `promemoria` si usa la data della residenza, altrimenti `next_due_date` resta **NULL** (gate: unità non consegnata). Lo `status` è `'scaduta'` se la data calcolata è passata e la modalità non è promemoria.

**`czero_add_unit_with_items(...)`**: stessa logica per una unità aggiunta dopo (NULL tranne promemoria).

**`czero_register_delivery(p_unit_id, p_old_date, p_new_date, p_plan jsonb)`**: solo super_admin; ricalcola `next_due_date` delle voci dell'unità elencate nel piano; rifiuta voci promemoria, fuori piano (`activation_status <> 'inclusa'`) e **voci con completamenti** (`'nel fascicolo'`), che restano intatte. Scrive un `activity_events` `data_consegna_modificata`.

**Il filtro dotazioni** (`residence_features` + `condition_key`) è applicato in creazione (`p_features IS NULL OR condition_key IS NULL OR EXISTS(present)`) e in `czero_add_unit_with_items`. Nessuna funzione DB ricalcola in seguito.

**Cosa succede se si cambia `frequency_months` su un item con data?** Nessuna funzione DB né trigger reagisce a un UPDATE di `frequency_months`: `next_due_date` resta com'è fino al prossimo completamento (che userà la nuova frequenza). Prova: i due item teolo con freq 699 e 60 hanno entrambi `next_due_date=2027-03-19`. Da confermare con la riga di codice dell'action nella sezione codice.

**Cron**: `cron.job` non esiste (nessun pg_cron). Il cron è fuori dal DB (route API/Vercel): vedi sezione codice.

**Distribuzione stato** (tutte le righe item, tutti i costruttori):
| status | activation | modalità effettiva | n | senza data | data passata |
|---|---|---|---|---|---|
| in_attesa | inclusa | residente | 552 | 45 | 0 |
| in_attesa | inclusa | amministratore | 180 | 0 | 0 |
| in_attesa | inclusa | promemoria | 417 | 0 | 0 |
| in_attesa | archiviata | residente | 167 | 0 | 27 |
| in_attesa | archiviata | amministratore | 8 | 0 | 1 |
| in_attesa | archiviata | promemoria | 29 | 0 | 17 |
| scaduta | inclusa | residente | 9 | 0 | 9 |
| scaduta | inclusa | amministratore | 1 | 0 | 1 |

Quindi: 45 voci incluse hanno `next_due_date` NULL (unità non consegnate). Nessun item è mai `esclusa` (0 righe): lo stato "escluso" in dati esiste come `archiviata` (204 righe, tutte in Archivio pre-demo). `in_corso` e `completata` non compaiono mai.

---

## 7-DB. CATALOGO NEL DB: ATTENZIONE, NON SONO 19 VOCI

`maintenance_templates` ha **35 template con `is_active = true`** e 10 inattivi (45 totali). CLAUDE.md e `docs/catalogo-manutenzioni-v2.md` parlano di 19 voci. Riconciliato: le 19 sono i template con `sort_order` 1–29 attivi (il catalogo v2); le altre 16 (`sort_order` 30–45: antincendio, idrico, ascensore, caldaia, RCEE, autoclave, legionella, cancelli, sollevamento reflue, canne fumarie) sono state inserite spente dalla migrazione 033 (`033_seed_voci_catalogo_condizionate.sql:9-13`) e accese dalla 035 (`035_accensione_voci_condizionate.sql:6,88-92`). Quindi "19 voci attive" in CLAUDE.md è superato: **nel DB sono 35**. Proposta per "Leggi emerse": aggiornare il numero.

**Caldaia e controllo di efficienza energetica sono DUE template distinti** (sort_order 32 e 33; `condition_key` `centrale_termica` e `generatore_gas`; entrambi A / amministratore / condominium; 12 e 48 mesi). Nel documento `catalogo-manutenzioni-v2.md` invece non c'è una voce caldaia: l'efficienza è un sotto-obbligo della voce pompa di calore (`catalogo-manutenzioni-v2.md:46`). Il DB vince; il md è disallineato.

**Struttura del piano reale:**
| scope | coppie (residenza, template) | con una sola riga | max righe per coppia |
|---|---|---|---|
| condominium | 238 | 238 (tutte) | 1 |
| unit | 236 | 47 | 15 |

Conseguenza decisiva per la domanda 3: le voci condominiali sono **già per voce** (una riga per residenza, `unit_id NULL`). Il problema "per unità" riguarda solo le voci con `scope = 'unit'`.

---

## 10-RLS. PERMESSI (policy reali)

`maintenance_items`:
- `items: super_admin gestisce tutto` — ALL, super_admin del builder proprietario della residenza.
- `items: admin aggiorna stato` — UPDATE, ruolo admin con `czero_can_access_residence`. Il trigger `czero_maintenance_items_role_column_guard` blocca per tutti i ruoli authenticated la modifica di id/template_id/residence_id/unit_id/created_at, e per l'admin la modifica di `activation_status` e `due_basis_override`. **L'admin può quindi aggiornare a livello DB anche `frequency_months`, `completion_mode`, `obligation_type`, `priority`, `warranty_info`, `supplier_id`, `next_due_date`, `status`**: il confine reale è nelle action, non nella RLS (da confermare nel codice).
- `items: lettura se si ha accesso` — SELECT.

`maintenance_templates`: solo SELECT per qualunque autenticato. Nessuna policy di scrittura → il catalogo non è modificabile da UI/utenti, solo da migrazione/service role.

`completions`: INSERT solo `client` (con accesso all'unità) o `admin` (con accesso alla residenza), e `performed_by_profile_id = auth.uid()`. **Nessuna policy per super_admin → invariante rispettata.** SELECT per chi ha accesso. Nessuna UPDATE/DELETE.
Nota: la policy INSERT ammette anche `client`, non solo `admin` come scritto in CLAUDE.md ("INSERT solo ruolo admin"). È coerente con il completamento da parte del residente (modalità `residente`); CLAUDE.md è impreciso su questo punto, da segnalare nella sezione "Leggi emerse" dell'handoff finale, non da modificare ora.

`suppliers`: ALL per super_admin del builder. Nessuna policy per admin/client → un admin non può leggere i fornitori direttamente (solo via service role nelle pagine admin/residente; da confermare nel codice).

`residence_features`: solo SELECT per super_admin del builder (nessuna policy di scrittura → scrive via RPC SECURITY DEFINER o service role).

`residence_category_dates`: super_admin ALL; lettura per chi ha accesso.

---

---

# PARTE CODICE (esploratori + EVIDENCE riaperte da me)

Verificate di persona (aperte e lette): `fornitori/actions.ts` righe 1-368, `api/cron/daily/route.ts` 55-155, `ItemConfigForm.tsx` 20-60, DB (trigger, funzioni, policy, conteggi). Le altre EVIDENCE sono degli esploratori, confidenza dichiarata da loro.

## 1. MAPPA DEI FILE

### 1a. Costruttore — `src/app/(dashboard)/admin/residences/[id]/manutenzioni/` (+ action in `fornitori/`)
| file | righe | cosa fa |
|---|---|---|
| `page.tsx` | 127 | Server. `requireRole(['admin','super_admin'])` (:27). Legge `residences`, `maintenance_items` (con embed template/units/suppliers, **senza** filtro su `activation_status`, :41-48), `completions` (:52), `suppliers` e `supplier_installations` (:59-66), `unit_members` (:92-96). Toglie i fornitori ai non super_admin (:81-84). `canManagePlan = super_admin` (:123). |
| `ManutenzioniClient.tsx` | 971 | Client. Nessuna query. Raggruppa per `category` poi per titolo template (:302-310, **non** per urgenza). Contatori da `liveItems` = non archiviate (:253-260). Tab Attive/Escluse solo se `canManagePlan` (:379, :215). Stato live con `isOverdueLive` (:558-559). Drill-down per voce → `UnitRow` (:849-927) che monta `ItemConfigForm` per **ogni** istanza (:681-690), per i condominiali una sola con `rep = typeItems[0]` (:671-679). Escludi/Includi: `setTemplateActivationForResidence` (:10, :230). |
| `ItemConfigForm.tsx` | 147 | Form "Configura": Modalità, Freq. (mesi), Info garanzia, Fornitore. Invia solo i campi cambiati (:38-43). Reso per tutti i ruoli, **non** gated da `canManagePlan` (:927). |
| `actions.ts` | 291 | Solo `sollecitaItem` (:73): service client, notifica; non scrive `maintenance_items`. |
| `loading.tsx` | 33 | Skeleton. |
| `../fornitori/actions.ts` | 368 | **Qui vivono** `updateMaintenanceItemConfig` (:126-213, "Salva configurazione") e `setTemplateActivationForResidence` (:219-368, Escludi/Includi), più `createSupplier`/`deleteSupplier`. |

Helper: `lib/maintenance-status.ts` (236: `isCountable :63`, `isOverdueLive :71`, `resolveCompletionMode :39`, `resolveObligationType :49`, `activityBucket :194`, `formatRelativeDue :233`), `lib/maintenance-due.ts` (202: `nextDueFrom :75`, `resolveDueBasis :170`), `lib/unit-utils.ts:11 unitNotDelivered`, `lib/maintenance-labels.ts` (31, `OBLIGATION_LABELS`), `lib/itemConfigMessages.ts`.

### 1b. Amministratore — `src/app/(dashboard)/admin/manutenzioni/`
| file | righe | cosa fa |
|---|---|---|
| `page.tsx` | 171 | Legge `maintenance_items` + template + residences; filtri SQL `unit_id IS NULL`, `status <> completata`, `activation_status = inclusa` (:95-105); in JS `isAdminActivity` (solo modalità amministratore) e ordina con `compareActivityUrgency` (:111-114). |
| `ManutenzioniTable.tsx` | 113 | Badge da `BUCKET_BADGE` (:31-35); "Prendi in carico" solo se `in_ritardo` (:71). |
| `actions.ts` | 170 | `takeChargeN3` (:19-36, solo `status='in_corso'`) e `completeN3` (:55-111, INSERT in `completions` + upload in bucket `attachments` + INSERT `attachments`). Gate: `role === 'admin'` (:55) + riga in `admin_assignments` (:80-86). |
| `[id]/page.tsx` | 274 | Dettaglio (vedi 8). |

### 1c. Residente — `src/app/(app)/manutenzioni/`
| file | righe | cosa fa |
|---|---|---|
| `page.tsx` | 115 | Redirect di super_admin e admin (:33-34). Query con `activation_status = inclusa` (:52-53), `isCountable` (:74). Tre bucket: `daFare` (scadute vive), `consigli` (promemoria), `inProgramma` (:91-95). |
| `ManutenzioniList.tsx` | 138 | Lista; bottone "Registra completamento" solo per modalità residente (:66-72). |
| `CompletionAction.tsx` / `CompletionSheet.tsx` | 36 / 105 | Form di completamento (note + allegato, data fissa oggi). |
| `actions.ts` | 99 | `completeN2`: INSERT in `completions` con `unit_id`; nessun gate di ruolo applicativo, decide la RLS (:24-25); non scrive `next_due_date` (lo fa il trigger, :63-65). |
| `[id]/page.tsx` | 243 | Dettaglio residente. **Nessun redirect per admin/super_admin** (:25): possono aprirlo. `N3AdminActions` anche per super_admin (:90-91, :185-188), ma `completeN3` rifiuta il super_admin (`actions.ts:55`): bottone che darebbe errore. |

Componenti condivisi: `components/N3AdminActions.tsx` (146), `ui/Badge.tsx` (`StatusBadge`, `PromemoriaBadge`, `TypeBadge` con `OBLIGATION_LABELS` A→"Obbligo di legge", B→"Raccomandata", C→"Consiglio", `Badge.tsx:52-56`), `lib/formatRegisteredBy.ts`, `lib/formatFrequency.ts`, `lib/pluralize.ts`.

Debiti che il redesign incontra: `formatFrequency(null)` stampa "ogni ? mesi" (`formatFrequency.ts:4`); le date nei dettagli usano `new Date(iso).toLocaleDateString` senza `T00:00:00` (`admin/[id]/page.tsx:123-126`, `(app)/[id]/page.tsx:62-65`) mentre esiste `lib/formatDate.ts:44 formatDateIT` deterministica, non usata da queste viste.

## 3-codice. COSA SCRIVE "Salva configurazione"

**UNA sola riga `maintenance_items`.** Verificato di persona:
```
fornitori/actions.ts:196-200
const { data: updated, error } = await supabase
  .from('maintenance_items')
  .update(updatePayload)
  .eq('id', itemId)
  .select('id')
```
- Colonne: `completion_mode`, `frequency_months`, `warranty_info`, `supplier_id` (+ `priority`, vedi 10). `obligation_type` **mai scritto per voce**: eredita sempre dal template (:159-160).
- Non scrive mai il template, mai le altre istanze della stessa voce.
- Effetto collaterale: se la `priority` effettiva nel payload è N1 (cioè si salva una modalità promemoria) azzera `status='in_attesa'` e, se c'è frequenza, **riscrive `next_due_date = nextDueFrom(oggi, freq)`** (:172-191). Si attiva solo quando il payload contiene `completion_mode` o `priority`.
- Il form è montato per istanza: `ManutenzioniClient.tsx:681-690` (una per unità).

## 4. ESCLUSIONE
`setTemplateActivationForResidence(templateId, residenceId, target)` — `fornitori/actions.ts:219-368`. Solo super_admin (:237-239), client RLS (policy "super_admin gestisce tutto").
- **Escludi** (`target='archiviata'`): `UPDATE maintenance_items SET activation_status='archiviata' WHERE template_id=? AND residence_id=? AND activation_status<>'archiviata'` (:243-249). **Fan-out su tutte le istanze della voce nella residenza.** Non tocca `status`, né `next_due_date`, né unità, né `is_active` del template, né `completions`. Scrive 1 evento `voce_archiviata` in `activity_events` per atto (:277-292).
- **Includi** (`target='inclusa'`): rilegge le archiviate (:310-315), **ricalcola `next_due_date = nextDueFrom(oggi, freq)`** per tutte le modalità, a bucket di data (:323-345); cancello di consegna: voce di unità non consegnata e non promemoria torna **senza data** (:337-341); `status='in_attesa'`; `activation_status='inclusa'` (:349-359). **Non scrive nessun evento in `activity_events`** (asimmetria con l'esclusione).
- Dato: le voci escluse si chiamano `archiviata` nel DB. L'etichetta enum `esclusa` esiste ma **0 righe** la usano. Le 204 righe archiviate sono tutte in "Archivio pre-demo" (demo); Furlan e Nicola ne hanno 0.
- Dotazioni (`residence_features`): **nessun legame** con escludi/includi (nessun riferimento in `manutenzioni/*` né in `fornitori/actions.ts`). `residence_features` condiziona solo la **creazione** delle voci (RPC `czero_create_residence_with_units` e `czero_add_unit_with_items`, SQL letto da me: `condition_key IS NULL OR EXISTS(feature present)`). Includere una voce condizionata dopo averla esclusa NON ricontrolla la dotazione.
- Bug minore già visibile: su errore la modale di conferma resta aperta senza toast (`ManutenzioniClient.tsx:230-233`).

## 5-codice. CALCOLO DELLE SCADENZE — scrittori di `next_due_date`
| scrittore | quando | regola |
|---|---|---|
| trigger `czero_recalc_due` (003_m2.sql:22-27; presente nel DB, verificato) | INSERT in `completions` | `completed_at + freq` → **dall'ultima esecuzione**; `status='in_attesa'` |
| RPC creazione residenza/unità (044) | creazione | `data consegna (cascata) + freq`; NULL per unità non consegnata salvo promemoria |
| `czero_register_delivery` (046:156-158) | registrazione consegna unità | date dal piano del client; salta voci con completamenti, promemoria, fuori piano |
| cron `/api/cron/daily` (`route.ts:100-103`) | ogni giorno 07:00 UTC | **solo promemoria**: `nextDueFrom(dueDate, freq)` cioè dalla **data prevista**, non dall'esecuzione |
| `updateMaintenanceItemConfig` (:188-190) | salvataggio config N1 | `oggi + freq` |
| `setTemplateActivationForResidence` (:341-354) | includi | `oggi + freq` (o NULL col cancello) |
| nessuno | cambio di `frequency_months` | **nessun ricalcolo** |

- **Regola oggi (non configurabile):** residente/amministratore = dall'ultima esecuzione (trigger). Promemoria = date fisse (il cron avanza dalla data prevista). Per residente/amministratore scaduti il cron marca `status='scaduta'` e lascia la data passata (`route.ts:117-122`). **Non esiste una "regola del ritardo" configurabile**: la differenza è implicita e dipende dalla modalità.
- **Cambio frequenza su voce con data:** `next_due_date` non cambia; la nuova frequenza vale dal prossimo completamento (trigger, `COALESCE(mi.frequency_months, mt.frequency_months)`) o dal prossimo giro del cron per i promemoria (`route.ts:91`). Prova nei dati: i due item teolo con freq 699 e 60 hanno entrambi `next_due_date = 2027-03-19`.
- `due_basis_override`: nessun writer nel repo (solo lettura `units/actions.ts:413,443` e guardia 042:208-209). Colonna orfana in scrittura.
- Nota: un esploratore ha segnalato che `docs/handoffs/HANDOFF_stato_scaduta_live_07_02_15_43.md:35` riportava il trigger `czero_recalc_due` come "inesistente in pg_trigger". Verificato oggi su DB: **esiste** (`on_completion_inserted`).

## 6. PROMEMORIA
- **Nessun anticipo configurabile.** `route.ts:70 .lte('next_due_date', today)`: il cron guarda solo scadenze di oggi o passate, nessun offset. Nessun `reminder_days`/lead time in codice né in schema.
- Cosa decide il cron (`route.ts:63-71`, service role): item `inclusa`, status in_attesa/scaduta/in_corso, `next_due_date <= oggi`.
  - promemoria: avanza la data (`:100-103`) e notifica una volta per passaggio, dedup 0 giorni, tipo `n1_due` (:105); notifica solo se `unit_id` (le promemoria condominiali non notificano nessuno, :106).
  - residente/amministratore in_attesa: marca `scaduta` e notifica `n2_due`/`n3_due` (:117-137).
  - già scadute: solleciti **hardcoded** ogni 14 giorni (residente) o 30 (amministratore) (:141-143).
- Conflitto da sapere: l'anticipo del mockup ("avvisa N giorni prima") non si innesta sul cron attuale, che per i promemoria **avanza la data e notifica nello stesso passaggio** a scadenza raggiunta. Un anticipo richiede di separare "notifica" da "avanzamento" e un dedup per ciclo.

## 7. CATALOGO — 35 template attivi nel DB (verità: DB)
Etichette: A = Obbligo di legge · B = Raccomandata · C = Consiglio. "Documento atteso": **nessun campo esiste** (né nel DB né nel md).

| # | Voce | Sistema (`category`) | Ambito | Tipo | Modalità | Freq. mesi | cond. |
|---|---|---|---|---|---|---|---|
| 1 | Pulizia grondaie e canali di gronda | Coperture | comuni | B | amministratore | 12 | — |
| 3 | Controllo manto di copertura (giugno) | Coperture | comuni | B | amministratore | 12 | — |
| 4 | Verifica lucernari | Coperture | comuni | B | amministratore | 12 | lucernari |
| 5 | Controllo antenna TV/parabola | Coperture | comuni | B | amministratore | 12 | antenna_centralizzata |
| 6 | Pulizia condotti / cappa cucina | Ventilazione | unità | B | residente | 12 | — |
| 8 | VMC: sostituzione filtri | Ventilazione | unità | B | residente | 12 | — |
| 9 | VMC: pulizia condotti | Ventilazione | unità | B | residente | 36 | — |
| 11 | Pulizia filtri climatizzatore | Termico | unità | C | promemoria | 6 | — |
| 15 | Test del differenziale (tasto T) | Elettrico | unità | C | promemoria | 6 | — |
| 17 | Verifica messa a terra condominiale | Elettrico | comuni | A | amministratore | 60 | luogo_di_lavoro |
| 21 | Imbiancatura interni | Finiture | unità | C | promemoria | 36 | — |
| 22 | Pulizia muri esterni | Finiture | comuni | C | **promemoria** | 24 | — |
| 23 | Trattamento idrorepellente muri esterni | Finiture | comuni | C | **promemoria** | 60 | — |
| 24 | Controllo e lubrificazione serramenti | Finiture | unità | B | residente | 12 | — |
| 25 | Verifica linee vita | Sicurezza | comuni | A | amministratore | 12 | — |
| 26 | Fosse biologiche e condensa grassi | Spurghi | comuni | B | amministratore | 6 | fossa_biologica |
| 27 | Pozzetti di ispezione e condotte | Spurghi | comuni | B | amministratore | 12 | — |
| 28 | Manutenzione climatizzazione / pompa di calore | Termico | unità | B | residente | 12 | — |
| 29 | Manutenzione impianto fotovoltaico | Fotovoltaico | comuni | B | amministratore | 12 | impianto_fotovoltaico |
| 30 | Manutenzione ordinaria ascensore | Ascensore | comuni | A | amministratore | 6 | ascensore |
| 31 | Verifica periodica biennale ascensore | Ascensore | comuni | A | amministratore | 24 | ascensore |
| 32 | Manutenzione caldaia / impianto termico | Termico | comuni | A | amministratore | 12 | centrale_termica |
| 33 | Controllo efficienza energetica caldaia (RCEE) | Termico | comuni | A | amministratore | 48 | generatore_gas |
| 34 | Controllo periodico estintori | Antincendio | comuni | A | amministratore | 6 | presidi_antincendio |
| 35 | Controllo rete idranti e naspi | Antincendio | comuni | A | amministratore | 6 | rete_idranti |
| 36 | Porte tagliafuoco REI e maniglioni | Antincendio | comuni | A | amministratore | 6 | porte_rei |
| 37 | Illuminazione di emergenza | Antincendio | comuni | A | amministratore | 12 | illuminazione_emergenza |
| 38 | Impianto rivelazione incendi (IRAI) | Antincendio | comuni | A | amministratore | 6 | impianto_rivelazione_incendi |
| 39 | Evacuatori di fumo e calore (EFC) | Antincendio | comuni | A | amministratore | 6 | evacuatori_fumo |
| 40 | Sanificazione serbatoi e autoclave | Idrico | comuni | B | amministratore | 12 | autoclave |
| 41 | Verifica funzionale autoclave | Idrico | comuni | B | amministratore | 12 | autoclave |
| 42 | Valutazione rischio legionella | Idrico | comuni | B | amministratore | 12 | acs_centralizzata |
| 43 | Cancelli e portoni motorizzati | Accessi | comuni | B | amministratore | 12 | cancello_motorizzato |
| 44 | Sollevamento acque reflue | Spurghi | comuni | B | amministratore | 12 | sollevamento_reflue |
| 45 | Pulizia canne fumarie collettive | Termico | comuni | B | amministratore | 12 | canna_fumaria_collettiva |

(# = `sort_order`; i primi 19 = catalogo v2, 30–45 = 16 voci accese dalla 035.) Differenze md ↔ DB sulle 19: "Pulizia muri esterni" e "Trattamento idrorepellente" sono `Amministratore` nel md (:88-89) e `promemoria` nel DB. Il md annota inoltre "A se luogo di lavoro" per la messa a terra e "24 mesi max di norma" per le linee vita (freq. DB 12).

Il "sistema" del mockup = `category` (testo libero, non una FK). `document_checklist_template.sistema` è un'altra tassonomia (minuscola) e non è collegata ai template.

## 8. DETTAGLIO E STORICO (oggi)
- **Admin `[id]/page.tsx`**: legge item + template (titolo, categoria, descrizione, scope, mode, obligation), `suppliers(name,phone,email)` (mostrato solo a super_admin, :208), `residences(name)`, `units(label)` (:54-58). Mostra titolo, categoria, badge stato/promemoria/tipo, scadenza (non per promemoria, :150), residenza, ambito, descrizione, garanzia (`warranty_info` dell'item), fornitore, azione di presa in carico/completamento, storico.
- **Residente `[id]/page.tsx`**: stessi campi tranne residenza/ambito; storico 10 righe; legge `units`/`residences` ma non li mostra.
- **Storico**: `completions.select('id, completed_at, performed_by_name, notes, attachments(id, file_name)')` ordinato per data, limit 20 (admin, :110-114) / 10 (residente, :69-74). Mostra data, "Eseguito da" (nome o etichetta di modalità, `formatRegisteredBy`), note, **conteggio** allegati (non cliccabili, :254-258).
- **Campi di `completions` leggibili per uno storico**: `completed_at`, `performed_by_name`, `performed_by_profile_id` (non letto oggi), `notes`, `unit_id`, `created_at`; allegati via `attachments` (`file_name`, `file_size`, `mime_type`, `storage_path`). **"Esito": non esiste.**
- Per uno storico per-voce a livello residenza (aggregando le unità) serve `completions WHERE item_id IN (items della voce)`. La RLS SELECT di `completions` (`can_access_unit` / `can_access_residence`) copre il super_admin del builder. Conteggio coerenza: 0 completions con residenza diversa da quella dell'item.

## 9. CONFRONTO COL MOCKUP

| campo del mockup | esiste già / si ricava / manca | note e proposta |
|---|---|---|
| Stato raggruppato per urgenza (Scadute / Entro 30 gg / Più avanti / Completate di recente) | **Si ricava**. Scadute: `isOverdueLive` (`maintenance-status.ts:71`). In attesa di consegna: `isAwaitingDelivery`. "Completate di recente": da `completions.completed_at` (lo `status` non diventa mai `completata`: il trigger lo rimette `in_attesa`). | **Conflitto con l'invariante promemoria**: raggruppare per scadenza vuol dire confrontare date. Le promemoria devono stare in un gruppo fisso ("Consigliate") fuori dai bucket di data, senza stato/prossima. Serve un helper unico e puro (con script `verify:`). Le 45 voci senza data stanno in "In attesa di consegna". |
| Prossima / Ultima per voce e per unità | **Si ricava**. Prossima = `next_due_date` per item (per voce: minimo tra le istanze incluse non promemoria). Ultima = `max(completions.completed_at)` per `item_id`. | Nessuna migrazione. Oggi la pagina già carica `completions` (`page.tsx:52`). |
| Regola del ritardo | **Manca** (implicita e fissa per modalità, vedi 5) | Migrazione additiva: `maintenance_items.due_rule text NULL CHECK (due_rule IN ('from_last_completion','fixed_dates'))`, NULL = comportamento attuale per modalità. In più va **modificata** `czero_recalc_due` (CREATE OR REPLACE) per rispettarla: non è puramente additiva, serve conferma. Alternativa a zero rischio: mostrare la regola come testo sola lettura finché non si decide. |
| Anticipo del promemoria | **Manca** | Migrazione additiva: `maintenance_items.reminder_lead_days integer NULL CHECK (reminder_lead_days BETWEEN 0 AND 365)`, NULL = nessun anticipo. Richiede anche una modifica del cron (separare notifica da avanzamento data, dedup per ciclo): commit a parte. |
| "Si applica" sì/no | **Esiste**: `activation_status` (inclusa/archiviata; `esclusa` non usato) e `setTemplateActivationForResidence` fa già il fan-out per voce | Riuso senza migrazione. Da correggere: errore senza toast, nessun evento in inclusione. |
| Obbligo bloccato se di legge | **Esiste di fatto**: `obligation_type` non è mai scritto per item (`fornitori/actions.ts:159-160`), eredita sempre dal template | Il pannello lo mostra sola lettura per tutte, non solo per A. |
| Documento atteso | **Manca** | Migrazione additiva: `maintenance_templates.expected_document text NULL`. Testo libero per template. Non serve FK a `document_checklist_template` (altro dominio: documenti di consegna). Seed dei testi = decisione di contenuto di Filippo. |
| Perché conta (testo per voce) | **Manca** (`description` è vuota sulle 19 e normativa sulle 16) | Migrazione additiva: `maintenance_templates.why_it_matters text NULL`. Template è senza policy di scrittura: i testi entrano solo via migrazione/service role. |
| Info garanzia | **Esiste**: `maintenance_items.warranty_info` (text), per istanza. Dati: Furlan 0, Nicola 0 righe valorizzate | Per voce = fan-out su tutte le istanze. Nessuna migrazione. |
| Fornitore | **Esiste**: `maintenance_items.supplier_id`; fornitori per residenza (`suppliers.residence_id`), `supplier_installations` per sistema. Furlan: 1 riga con fornitore | Fan-out come sopra. Il fornitore si vede solo a super_admin (`page.tsx:81-84`; RLS `suppliers` solo super_admin). |
| Storico | **Esiste** (`completions` + `attachments`), manca "esito" | Nessuna migrazione. Esito non esiste e non si inventa: `completions` è immutabile e off-limits. Allegati senza download oggi: serve URL firmato (lettura, non scrittura). |

Migrazioni additive minime proposte (NON applicate): 
```sql
ALTER TABLE maintenance_templates ADD COLUMN IF NOT EXISTS why_it_matters text;
ALTER TABLE maintenance_templates ADD COLUMN IF NOT EXISTS expected_document text;
-- solo se si decide di rendere configurabili:
ALTER TABLE maintenance_items ADD COLUMN IF NOT EXISTS due_rule text
  CHECK (due_rule IN ('from_last_completion','fixed_dates'));
ALTER TABLE maintenance_items ADD COLUMN IF NOT EXISTS reminder_lead_days integer
  CHECK (reminder_lead_days BETWEEN 0 AND 365);
```
Le prime due sono additive pure. Le ultime due sono additive come schema, ma per essere vere servono modifiche a `czero_recalc_due` e al cron.

## 10. PERMESSI E RISCHI

**Chi modifica la config oggi**
- Salva configurazione: `admin` e `super_admin` (`fornitori/actions.ts:151`), client RLS. La policy `items: admin aggiorna stato` è UPDATE su tutta la riga e il trigger `czero_maintenance_items_role_column_guard` blocca per l'admin solo `activation_status` e `due_basis_override` (verificato su DB). **Un admin può quindi scrivere modalità, frequenza, garanzia, fornitore, anche a DB.** `ItemConfigForm` è visibile anche all'admin (`ManutenzioniClient.tsx:927`).
- Escludi/Includi: solo super_admin, nel codice (`:237-239`) e nel guard del DB.
- Fornitori: lettura/scrittura RLS solo super_admin; un admin che salva un `supplier_id` non ha la lista (nascosta in `page.tsx:81-84`).
- Catalogo: nessuno scrive `maintenance_templates` da applicazione (solo SELECT).

**Cosa si rompe se la config passa da per unità a per voce**
1. Nulla nello schema: la config resta nelle righe item, la UI scriverebbe in fan-out (`UPDATE ... WHERE residence_id=? AND template_id=?`), come già fa Escludi/Includi. I dati reali di Furlan/Nicola divergono solo in 2 coppie su 143 (vedi 3).
2. Si perde la possibilità di divergenze per unità: oggi consentite dal form. Il nuovo pannello deve **mostrare** "valori diversi tra unità" invece di appiattirli in silenzio, e non sovrascrivere senza avviso.
3. Cambio di `completion_mode` in fan-out su voci con completamenti: il fascicolo resta intatto, ma `czero_register_delivery` classifica per `coalesce(item.mode, template.mode)`; una voce passata a promemoria diventa non ricalcolabile e una passata da promemoria a residente può risultare subito scaduta (data vecchia). Va deciso cosa fare con la data.
4. Il ramo N1 di `updateMaintenanceItemConfig` (:172-191) riscrive `next_due_date` a `oggi + freq` su ogni salvataggio con modalità promemoria: in fan-out azzererebbe le date di tutte le unità, anche dopo completamenti. Vietato propagarlo senza regola esplicita.
5. Cambio frequenza in fan-out: oggi non ricalcola. Il mockup mostra "cambia la prossima scadenza di N unità": serve decidere la regola (ricalcolare solo item **senza completamenti**, come `czero_register_delivery`; per quelli con completamenti l'ancora è l'ultima esecuzione, quindi cambia `completed_at + nuova freq`; promemoria data via cron). Il numero N dell'avviso e l'anteprima delle 3 date richiedono un helper puro unico (stessa funzione per anteprima e scrittura), `nextDueFrom` esiste già.
6. Le 45 righe incluse senza data (unità non consegnate) non devono ricevere una data da un salvataggio per voce: stesso cancello di `setTemplateActivationForResidence` (:337-341).
7. Voci condominiali: nessun cambiamento (una riga).
8. `requireRole(['admin','super_admin'])` sulla pagina: il nuovo elenco/dettaglio/Configura è per super_admin. L'admin oggi apre la stessa pagina e vede Configura: da decidere se lo perde.

**Dual-write di `priority`**
- Avviene in **un solo punto**: `fornitori/actions.ts:161-167` (`modeToPriority`/`priorityToMode`, :14-32). Nessun'altra scrittura. Il nuovo Configura **deve mantenerlo** (legge di CLAUDE.md): qualunque nuova action che scrive `completion_mode` deve scrivere anche `priority` con la stessa mappa. Si propone di **riusare** `updateMaintenanceItemConfig` (o estrarre la mappa in `lib/` come fonte unica) invece di duplicare la logica.
- **Discrepanza con CLAUDE.md**: CLAUDE.md dice che "le viste residente e admin leggono ancora `priority`". Il grep degli esploratori non trova nessuna lettura di `priority` nelle viste residente/admin (`maintenance-status.ts:14` lo dichiara anzi "mai da priority"; il cron :82-85 idem). L'unica lettura è `ManutenzioniClient.tsx:68` (`priority: item.priority ?? tpl?.priority ?? 'N2'` in `resolveAxes`, valore non usato dai chiamanti) e la select di `page.tsx:42`. Limite: grep per stringa; una `select('*')` non comparirebbe. Il dual-write resta comunque da mantenere finché Filippo non lo dichiara chiuso.
- Dati: `priority` valorizzata su 0 righe item di Furlan/Nicola, 21 in Archivio pre-demo.

**Altri rischi segnalati dagli esploratori (non corretti)**
- Un item con modalità NULL (né item né template) e scaduto finirebbe in "daFare" del residente con testo "A carico dell'amministratore" (`ManutenzioniList.tsx:57-72`). Nei dati reali non ci sono item senza modalità effettiva (tutte le righe hanno modalità effettiva), ma il codice lo ammette.
- `takeCharge` e `completeN3` non scrivono `unit_id`: coerente col fatto che sono condominiali.
- Il `completeN3` dell'admin non può mai essere invocato dal super_admin, ma il dettaglio residente gli mostra comunque `N3AdminActions` (bottone che fallisce).
- `docs/migrations.log`: ultima riga 053 (2026-11-06). La prossima migrazione sarebbe 054.

---

# CONCLUSIONI

## (a) Risposta secca alla domanda 3
**Oggi la configurazione è per UNITÀ per le voci di unità (`scope='unit'`) e per voce per le condominiali.** "Salva configurazione" scrive **una sola riga** `maintenance_items` (`.eq('id', itemId)`, `fornitori/actions.ts:196-200`), montato per ogni unità (`ManutenzioniClient.tsx:681-690`). Nei dati reali di Furlan e Nicola la divergenza è marginale: **2 coppie (residenza, voce) su 143** hanno valori diversi tra unità (Santa Giustina "filtri climatizzatore": fornitore su 1 unità di 5; teolo "Test del differenziale": frequenze 6, 60 e 699, quest'ultime valori di prova). Passare a "per voce" è quindi **possibile senza migrazione**, scrivendo in fan-out su tutte le istanze della voce nella residenza (stesso pattern di Escludi/Includi), a patto di mostrare le divergenze e di non propagare il ricalcolo date del ramo promemoria.

## (b) Proposta di divisione in commit (un concern per commit)

0. **Preliminare decisioni** (nessun commit, vedi "Domande" sotto).
1. **Lista costruttore** — nuova lista a griglia (Voce, Obbligo, Chi la chiude, Frequenza, Stato, Prossima, Ultima), raggruppata per urgenza, filtri ricerca/unità/"solo obblighi di legge"/"solo dell'amministratore". Helper puro di raggruppamento + `verify:` con i casi (promemoria in gruppo fisso, senza data, archiviate escluse). Sostituisce il raggruppamento per sistema in `ManutenzioniClient`. Nessun cambio a `actions.ts`. **Nessuna migrazione.**
2. **Pannello di dettaglio** — clic sulla riga → pannello con Stato, Unità, Chi chiamare, Storico (+ "Modifica in Configura" che per ora porta al tab). Sezioni "Perché conta" e "Cosa conservare": **2a** senza quelle due (nessuna migrazione); **2b** con le colonne `why_it_matters` e `expected_document` su `maintenance_templates` + seed dei testi. **Migrazione additiva solo in 2b** (applicabile senza conferma per CLAUDE.md, ma il seed dei testi è contenuto da approvare).
3. **Configura** — **3a**: tab con una riga per voce, pannello Cosa e Chi e dove (si applica, garanzia, completion_mode, fornitore, obbligo sola lettura) via fan-out, dual-write di `priority` mantenuto, divergenze mostrate. **3b**: blocco Quando (frequenza con anteprima e avviso "cambia la prossima scadenza di N unità", poi regola del ritardo e anticipo). **3b richiede migrazione** (`due_rule`, `reminder_lead_days`) **e modifica di `czero_recalc_due` e del cron**: non additiva pura, conferma esplicita di Filippo e commit separati (DB, cron, UI).
4. **Escluse** — tab Escluse come elenco per voce con "Includi nel piano", riuso di `setTemplateActivationForResidence`; correzioni: toast sull'errore, evento `activity_events` anche in inclusione (richiede possibile estensione del CHECK `event_type`, quindi **migrazione** se si aggiunge un tipo; altrimenti nessuna). **Nessuna migrazione se si lascia l'inclusione senza evento.**

| commit | migrazione |
|---|---|
| 1 Lista | no |
| 2a Dettaglio | no |
| 2b Perché conta / Cosa conservare | sì, additiva (2 colonne su template) |
| 3a Configura Cosa + Chi e dove | no |
| 3b Quando | sì (2 colonne su item) + modifica funzione DB e cron: richiede conferma |
| 4 Escluse | no (sì solo se si logga l'inclusione) |

## Domande aperte per Filippo (decidono lo scope, non le assumo)
1. **Promemoria nel raggruppamento per urgenza**: gruppo fisso "Consigliate" senza date (rispetta l'invariante) o altro?
2. **Anticipo del promemoria e regola del ritardo**: nel redesign o rimandati? Sono le uniche voci del mockup che toccano cron e trigger.
3. **Ricalcolo su cambio frequenza**: ricalcolare solo item senza completamenti, o anche quelli con completamenti da ultima esecuzione?
4. **Permessi**: l'amministratore deve continuare a poter configurare (oggi sì) o Configura diventa solo super_admin?
5. **Voci con valori diversi tra unità** (es. teolo "differenziale" 6/60/699): il pannello per voce li mostra come "valori diversi" e il salvataggio li uniforma solo se si tocca quel campo. Conferma?
6. **Numero voci**: "19 voci attive" in CLAUDE.md contro 35 nel DB (019+16 accese dalla 035): il mockup deve mostrare tutte e 35?

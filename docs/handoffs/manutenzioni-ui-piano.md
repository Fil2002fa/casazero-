# Manutenzioni — redesign UI della vista costruttore: piano approvato

Origine: diagnosi FASE 0 (`manutenzioni-ui-fase0.md`, non tracciato) e decisioni di Filippo.
Pagina: `residences/[id]/manutenzioni`. Vista super_admin. Modello v2 (N1/N2/N3 abolito).

## Decisioni chiuse

1. **Promemoria**: gruppo fisso "Consigliate" in fondo alla lista, separato dai gruppi per urgenza (Scadute / Entro 30 giorni / Più avanti). Nessun confronto di date per le promemoria: nelle colonne Stato, Prossima e Ultima un trattino neutro, colonne allineate.
2. **Regola del ritardo e anticipo del promemoria**: fuori dal redesign. Nel pannello la regola è solo testo letto: "dall'ultima esecuzione" (residente, amministratore), "date fisse" (promemoria). Nessuna modifica a trigger, `czero_recalc_due`, cron.
3. **Cambio di frequenza** (commit 3b, ultimo): ricalcolo di `next_due_date` dall'ultima esecuzione, o dalla base di consegna se non ci sono completamenti; mai sulle promemoria; `completions` solo in lettura. Va ripianificato in una FASE 0 a sé prima di scriverlo.
4. **Configura solo super_admin**: form nascosto per l'admin + gate nell'action. Nessuna modifica RLS ora.
5. **Valori diversi tra unità della stessa voce**: il campo mostra "Valori diversi tra le unità" e scrive su tutte le righe solo se il campo viene modificato. Mai uniformare in automatico. Il ricalcolo del ramo promemoria (`fornitori/actions.ts:172-191`) non deve propagarsi alle altre unità.
6. **Voci mostrate**: quelle attive nel DB (35). La differenza col catalogo v2 (19) resta una domanda aperta, non tocca questo lavoro.
7. **2b rimandato**: "Perché conta" e "Cosa conservare" (con la migrazione su `maintenance_templates`) non ci sono; il pannello per ora non mostra quelle due sezioni.

## Ordine dei commit

0 → 1 → 2a → 3a → 4 → 3b

| # | Commit | Migrazione |
|---|---|---|
| 0 | Questo piano, solo documentazione | no |
| 1 | Lista costruttore a griglia, raggruppata per urgenza, filtri, helper puro `maintenance-list.ts` + `verify:maintlist` | no |
| 2a | Pannello di dettaglio: Stato, Unità, Chi chiamare, Storico (senza Perché conta e Cosa conservare) | no |
| 3a | Configura per voce: Cosa e Chi e dove (si applica, garanzia, completion_mode, fornitore, obbligo in sola lettura), scrittura su tutte le righe della voce, dual-write di `priority` mantenuto, gate super_admin | no |
| 4 | Tab Escluse con "Includi nel piano" (riuso di `setTemplateActivationForResidence`), toast sull'errore | no, salvo evento in `activity_events` anche in inclusione |
| 3b | Configura "Quando": frequenza con anteprima e avviso "cambia la prossima scadenza di N unità", ricalcolo secondo la decisione 3 | no, ma FASE 0 propria prima di scrivere |

Regola del ritardo e anticipo non hanno commit: nessuna colonna `due_rule` né `reminder_lead_days`.

## Confronto col mockup (aggiornato con le decisioni)

| campo del mockup | esiste già / si ricava / manca | stato nel piano |
|---|---|---|
| Stato raggruppato per urgenza | Si ricava: `isOverdueLive` (`maintenance-status.ts:71`), `isAwaitingDelivery`; "Completate di recente" da `completions.completed_at` (lo `status` non diventa mai `completata`) | Commit 1. Promemoria in "Consigliate" senza confronti di date. Voci senza data (unità non consegnate) in "In attesa di consegna". "Completate di recente" non è tra i gruppi decisi: da riproporre in 2a o dopo |
| Prossima e ultima per voce e per unità | Si ricava: `next_due_date` per item, `max(completions.completed_at)` per `item_id` | Commit 1 (voce), 2a (unità) |
| Regola del ritardo | Manca come dato; implicita per modalità (trigger = dall'ultima esecuzione, cron = date fisse) | Fuori redesign: solo testo letto nel pannello (2a) |
| Anticipo del promemoria | Manca; il cron non ha lead time | Fuori redesign |
| "Si applica" sì/no | Esiste: `activation_status` + `setTemplateActivationForResidence` (fan-out per voce) | 3a e 4, nessuna migrazione |
| Obbligo bloccato se di legge | Esiste di fatto: `obligation_type` non è mai scritto per item, eredita dal template | 3a: sola lettura per tutte le voci |
| Documento atteso | Manca (nessuna colonna) | Rimandato con 2b |
| Perché conta | Manca (nessuna colonna) | Rimandato con 2b |
| Info garanzia | Esiste: `maintenance_items.warranty_info` per istanza | 3a: scrittura su tutte le righe della voce, solo se il campo cambia |
| Fornitore | Esiste: `maintenance_items.supplier_id`; fornitori per residenza, visibili solo a super_admin | 3a: come sopra; 2a lo mostra |
| Storico | Esiste: `completions` + `attachments`; "esito" non esiste | 2a, sola lettura |

## Vincoli di lavoro per tutti i commit

- Un concern per commit; `npm run verify` con output completo prima di ogni commit; diff e stat mostrati prima di committare.
- `completions` solo in lettura. Il dual-write di `priority` resta (un solo punto oggi: `fornitori/actions.ts:161-167`).
- Promemoria: nessuna lettura di `status`, nessun confronto di date, nessun linguaggio di scadenza.
- Helper condivisi per ogni valore che compare in più superfici; pluralizzazione con l'helper.
- Nessun elemento interattivo annidato.

## Stato dei commit

- 0: piano, `7965959`.
- 1: lista costruttore, `d354310`. Ordine dei gruppi deciso da Filippo: Scadute, Entro 30 giorni, In corso, Più avanti, In attesa di consegna, Consigliate (è anche il rango dello stato peggiore di una voce). `verify:maintlist` a 89 casi.
- 2a: pannello di dettaglio, `2a086db`. `verify:maintdetail` a 68 casi, 9 mutazioni a mano rilevate con ripristino identico.

## 2a — pannello di dettaglio (piano approvato, nessuna migrazione)

Clic sulla riga → pannello a destra sopra la pagina (la lista non si sposta), sfondo scuro cliccabile, X, Escape, focus trap, ritorno del focus alla riga. Sezioni nell'ordine: Stato, Unità, Chi chiamare, Storico; in fondo "Configura per unità". "Perché conta" e "Cosa conservare" non ci sono (2b rimandato).

### Riscontri della FASE 0

1. **`useDialogFocus` esiste** (`src/components/ui/useDialogFocus.ts:15`): focus iniziale, Tab intrappolato, Escape (`:33`), blocco scroll (`:26`), ritorno del focus al trigger (`:58`). Lo usano `Modal` e il drawer della sidebar. Due vincoli: il focus torna a `document.activeElement` all'apertura, e un clic sul `<li>` non focalizza niente (tornerebbe al body), quindi la riga fa `focus()` sul proprio bottone prima di chiamare `onOpen`; `onClose` deve avere identità stabile (`useCallback`), altrimenti l'effetto si riesegue e ruba il focus.
2. **`PanelShell` non va bene** (`documenti/PanelShell.tsx:48`): è del dominio Documenti, da 1280 px sta affiancato, senza trap né ritorno del focus. Il 2a usa lo stile overlay del drawer della sidebar (`bg-brand-dark/40`, pannello a destra, `z-modal`) con `useDialogFocus`, montato in portal su `document.body` come `Modal`, così lo scroll del `main` dietro non si muove.
3. **Storico: caricato insieme alla pagina, nessuna query né action nuova.** `residences/[id]/manutenzioni/page.tsx:53` carica già tutti i completamenti della residenza (data, `performed_by_name`, allegati) e `ManutenzioniClient` li riceve come prop. Massimo 16 completamenti per residenza oggi (23 in tutto il DB). Un'action alla riga costerebbe un viaggio di rete per apertura e una superficie RLS in più. Per la voce contano i completamenti di tutte le istanze, anche archiviate ("piano ≠ fascicolo"). L'unità si ricava dall'istanza. `completions` solo in lettura.
4. **Fornitore: si estende l'embed già presente** (`page.tsx:47`, tipo in `ManutenzioniClient.tsx:47`, oggi solo `id` e `name`) a `suppliers(id, name, phone, email)`: nessuna query in più, RLS invariata. Per l'admin i fornitori sono già azzerati (`page.tsx:81-84`): per lui la sezione "Chi chiamare" non c'è, invece di dire "Nessun fornitore collegato", che sarebbe falso.
5. **Limiti delle prove a schermo**: nessun fornitore di Furlan ha telefono o email, e nessun completamento di Furlan ha allegati (solo la demo, non accessibile). Telefono, email e conteggio allegati si provano solo con il verify.
6. **`formatRegisteredBy`** (`src/lib/formatRegisteredBy.ts`) vuole (nome, modalità dell'istanza, modalità del template): si riusa com'è.

### File

- `src/lib/maintenance-list.ts`: esporta `timedState` come `itemState` e `compareLabels` (modifica minima).
- `src/lib/maintenance-detail.ts` (nuovo, puro): `buildVoceDetail(templateId, items, completions, today, options)`. Riga della lista (la stessa del commit 1, nessuna regola duplicata), regola in testo ("dall'ultima esecuzione" / "date fisse"), frase "chi la chiude" ("Lo fa il residente" / "Lo fa l'amministratore" / "Solo promemoria"), obbligo, garanzia (o "Non indicata"), unità, fornitori, storico.
- `src/lib/maintenance-labels.ts`: frasi di modalità e testi di regola (fonte unica).
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/MaintenanceDetailPanel.tsx` (nuovo).
- `MaintenanceList.tsx`: la riga focalizza il suo bottone prima di `onOpen`.
- `ManutenzioniClient.tsx`: `selectedTemplateId`, `close` stabile, "Configura per unità" dal pannello (chiude, passa alla vista per unità, espande quella voce e ci scorre sopra); tipo `ItemRow.suppliers` con telefono ed email.
- `page.tsx`: embed del fornitore con telefono ed email.
- `scripts/verify-maintenance-detail.mjs` e `npm run verify:maintdetail`.

### Contenuto delle sezioni

- **Stato**: prossima (con l'unità che scade per prima), ultima, regola, chi la chiude, obbligo, info garanzia. Per le promemoria niente stato, prossima né ultima né confronti di date. "Valori diversi tra le unità" per chi la chiude, regola, garanzia e frequenza quando divergono.
- **Unità** (solo voci di unità): griglia Unità / Stato / Prossima / Ultima a colonne allineate, in ordine naturale delle etichette; istanze promemoria con trattino e senza lettura di stato o data. **Con il filtro-unità attivo la riga dell'unità filtrata è evidenziata** (`highlighted` calcolato nell'helper e provato dal verify; sfondo `brand-light` più `aria-current`). I valori divergenti sono elencati per conteggio, es. "ogni 6 mesi: 10 unità · ogni 60 mesi: 1 unità · ogni 699 mesi: 1 unità", senza una quinta colonna.
- **Chi chiamare** (solo super_admin): fornitore con nome, telefono ed email se ci sono; "Nessun fornitore collegato" se manca; se le unità hanno fornitori diversi, elenco per unità.
- **Storico**: dal più recente, con data, unità (o "Parti comuni"), "Eseguito da" via `formatRegisteredBy` e numero di allegati se ci sono. Niente note, niente link di download. Tetto di 20 con "e altri N".

### Scelte confermate

- Il pannello mostra sempre la voce intera, anche con il filtro-unità attivo (la riga evidenziata nella griglia Unità rende visibile la differenza).
- Valori diversi elencati per conteggio, senza colonna in più.
- Solo il numero degli allegati, senza note.
- Admin: il pannello si apre, senza "Chi chiamare". "Configura per unità" resta per tutti fino al gate del 3a.
- Tetto dello storico a 20 con "e altri N"; archiviate incluse.

### Verifica

- `npm run verify`, `npm run verify:maintlist`, `npm run verify:maintdetail` (casi su regola e frasi per modalità, garanzia nessuna/uguale/mista, fornitori nessuno/uno/diversi per unità con telefono ed email, promemoria senza stato né date, evidenziazione dell'unità filtrata, storico per ordine/archiviate/tetto/allegati/`formatRegisteredBy`, voce condominiale senza sezione Unità, input non mutati), poi mutazioni a mano con ripristino identico.
- DevTools su TEST wizard A, teolo in sola lettura (12 unità, 3 frequenze sul differenziale) e Santa Giustina (completamenti; fornitore su 1 unità di 5 su "Pulizia filtri climatizzatore"), a 1440 e 390 px, con Tab, Escape e Invio sulla riga, console e rete pulite.
- `tsc` verde, diff e stat mostrati, stop prima del commit.

## Domande aperte (non toccano questo lavoro)

- "19 voci attive" in CLAUDE.md contro 35 nel DB (19 del catalogo v2 + 16 accese dalla migrazione 035).
- CLAUDE.md dice che le viste residente e admin leggono ancora `priority`: il grep non trova letture reali (una `select('*')` non comparirebbe). Il dual-write resta finché Filippo non lo chiude.
- CLAUDE.md dice "INSERT su `completions` solo ruolo admin": la policy ammette anche `client` (completamento del residente).

## 3a — Configura per voce (FASE 0 chiusa il 2026-11-08, piano approvato con D1-D5, nessuna riga di codice scritta)

Obiettivo: tab **Piano | Configura | Escluse**. In Configura una riga per voce (Voce, Ambito, Chi la chiude, Obbligo, Frequenza, Fornitore, Garanzia); clic → pannello laterale con Cosa (obbligo in sola lettura, info garanzia) e Chi e dove (chi la chiude, fornitore), un solo Salva. Frequenza fuori (3b). Solo super_admin del builder della residenza.

### Riscontri

1. **`updateMaintenanceItemConfig` oggi** (`fornitori/actions.ts:126-213`), riga per riga:
   - Ruolo: `['admin','super_admin']` (`:151`), nessuno scope builder o residenza nel codice. `residenceId` serve solo a `revalidatePath` e ai log; il WHERE è `.eq('id', itemId)` (`:199`). L'unica barriera di scope è la RLS.
   - **Mass-assignment (B53)**: `updatePayload = { ...data }` (`:155`). Il tipo TS non esiste a runtime: una chiamata costruita a mano può scrivere `status`, `next_due_date`, `obligation_type`, `due_basis_override` (super_admin) e ogni colonna non protetta dal trigger `czero_maintenance_items_role_column_guard`, che blocca solo id, template_id, residence_id, unit_id, created_at (tutti i ruoli), `activation_status` e `due_basis_override` (admin).
   - Nessuna validazione: `completion_mode` solo dall'enum DB; `frequency_months` senza minimo (nel DB esiste 699 su teolo); `warranty_info` senza lunghezza; `supplier_id` solo FK (la FK ignora la RLS: un uuid di un fornitore di un altro builder si collega).
   - Dual-write `:161-167`: `completion_mode` ha precedenza e scrive `priority = modeToPriority(mode)`; se arriva solo `priority` deriva la modalità. `modeToPriority`/`priorityToMode` sono private di quel file (`:14-32`).
   - Ramo promemoria `:169-192`: se la priority effettiva è N1, `status='in_attesa'` e, con frequenza nota (payload, poi voce, poi template), `next_due_date = oggi + freq`, **per ogni riga toccata, sovrascrivendo la data esistente**. Nessun ramo per il passaggio inverso (da promemoria a residente o amministratore): data e status restano quelli del promemoria.
   - Esito: `.select('id')` e 0 righe toccate = errore di dominio (`:206`).
2. **`obligation_type` non è scritto da nessuna parte dell'app**: nessun `.update`/`.insert` lo include (grep in `src/`); `ItemConfigForm.tsx:10-15` lo dichiara "fatto normativo del catalogo"; `supabase/maintenance/riallinea_assi_voci.sql` (decisione del 31/10) lo ha messo NULL su tutte le voci. DB: 0 voci con `obligation_type` non nullo. Resta scrivibile solo a livello DB (la policy super_admin è ALL, quella admin UPDATE, il guard non lo copre). I lettori (lista, pannello, PDF, report, export) usano già `item ?? template`.
3. **Admin e RLS**: la policy `items: admin aggiorna stato` (UPDATE, `czero_can_access_residence`) lascia a un admin assegnato scrivere via PostgREST `completion_mode`, `supplier_id`, `warranty_info`, `frequency_months`, `obligation_type`, `status`, `next_due_date`. Il gate nell'action è una barriera applicativa, non di sicurezza dei dati. Nessuna modifica RLS in questo lavoro; estendere il guard alle colonne di configurazione per l'admin è un candidato a migrazione a parte (restringe, non allarga), da decidere.
4. **Registro attività**: `updateMaintenanceItemConfig` **non scrive in `activity_events`**. Scrive solo `setTemplateActivationForResidence` (`voce_archiviata`, `:277-292`). Il CHECK sugli event_type ha 13 valori, nessuno per la configurazione. Segnalato, non incluso nel 3a (aggiungere `voce_configurata` richiederebbe una migrazione come 049/051/053, più `ActivityEventType` e `activity-event-view.ts`).
5. **Gate esistente da riusare**: `authorizeResidenceActor(admin, userId, residenceId, prefix)` (`document-access.ts:134`) restituisce `{ ok, residence, role }`, con il super_admin vincolato a `residence.builder_id === profile.builder_id` e 403/404/500 distinti. `checkAdminInScope` (`admin-scope.ts:20`) è invece il perimetro dei PROFILI admin, non delle residenze: qui non è il pattern giusto. Si usa `authorizeResidenceActor` con service client accettando solo `role === 'super_admin'`; le scritture passano dal client di sessione, così la RLS resta la seconda barriera.
6. **Dati (SELECT di sola lettura, 8/11)**: 417 voci promemoria incluse, 0 con data passata, 27 su unità non consegnate (con data), 1 con completamenti; 742 voci non promemoria incluse, 0 in_corso, 0 senza data su unità consegnate; 0 voci di parti comuni con modalità residente. Il cron (`api/cron/daily/route.ts:97-114`) per i promemoria fa avanzare `next_due_date` di una frequenza e notifica solo se `status='in_attesa'`: un promemoria con status diverso non viene mai elaborato.
7. **Drift noto**: le RPC di creazione unità (044) lasciano `completion_mode`/`obligation_type` NULL e non portano la configurazione per voce: una unità aggiunta dopo una configurazione per voce nasce con i valori del template, quindi comparirà "Valori diversi". Non gestito nel 3a.

### Risposte alle sei domande

1. **Come diventa per voce senza allargare cosa si scrive**: nuova action `configureVoce(residenceId, templateId, changes)`. Il client manda solo template e residenza più i campi cambiati; le righe le legge il server (`residence_id` + `template_id`), mai una lista di id dal client. Whitelist esplicita a mano (nessuno spread), validata: `completion_mode` ∈ enum (e `residente` rifiutato sulle parti comuni), `warranty_info` trim, massimo 500 caratteri, vuoto → NULL, `supplier_id` ∈ fornitori dello stesso builder della residenza (controllo con la RLS di sessione più `builder_id`) oppure NULL. `obligation_type`, `frequency_months`, `status`, `next_due_date`, `activation_status`, `due_basis_override`, `priority` non sono accettati dal client: `priority` la deriva il server dalla modalità (dual-write mantenuto, con `modeToPriority` spostato in `src/lib/completion-mode.ts` perché un file `'use server'` può esportare solo funzioni async). La vecchia action viene ristretta nel commit 3a-5.
2. **Cambio di modalità da e verso promemoria** (sono le uniche righe con regole di data e status; tra residente e amministratore data e status non si toccano):
   - **Verso promemoria**: per le righe incluse `status = in_attesa` sempre (il cron elabora solo `in_attesa`, quindi uno `scaduta` o `in_corso` resterebbe muto); `next_due_date` **resta** se è oggi o futura, **diventa oggi + frequenza** se è passata o nulla. Oggi la action la riporta a oggi + frequenza per tutte: per la voce azzererebbe le scadenze di ogni unità.
   - **Da promemoria**: lo status resta `in_attesa`; la data resta, tranne sulle unità **non consegnate senza override** (`due_basis_override` nullo, `unitNotDelivered`) dove torna NULL ("In attesa di consegna", stessa regola del cancello di `setTemplateActivationForResidence:337-341` e di `planDeliveryRecalc`), così il passaggio non fa nascere una data su un'unità invenduta. Le righe con completamenti tengono la data (la riscrive il trigger). Anteprima prima di salvare: "N unità tornano in attesa di consegna, N risultano scadute subito".
   - Le righe archiviate ricevono i campi di configurazione ma non le regole di data e status (alla re-inclusione `setTemplateActivationForResidence` le ricalcola da oggi).
   - **Richiede una tua decisione (D3)**: è un comportamento nuovo rispetto a oggi.
3. **Registro attività**: no, come al riscontro 4. Segnalato e basta.
4. **Atomicità**: oggi un UPDATE per riga. Per voce, a parità di payload basta **un solo statement** `.update(...).eq('residence_id').eq('template_id')`, atomico. Con un cambio di modalità le righe hanno date diverse (bucket): più statement, non atomici in REST, e un fallimento a metà lascia la modalità cambiata e le date no; un secondo salvataggio non lo ripara perché vede la modalità già cambiata. Proposta: **una RPC `czero_configure_voce(...)`** (migrazione 054, additiva, `SECURITY INVOKER` così RLS e guard restano, controllo interno `czero_user_role() = 'super_admin'`, `REVOKE` ad anon). Il TS calcola il piano con l'helper puro e passa un jsonb `{id, completion_mode, priority, status, next_due_date, supplier_id, warranty_info}[]`; la funzione lo applica in un'unica transazione e restituisce le righe toccate. Se fallisce, nessuna riga cambia. **Richiede il tuo ok sulla migrazione (D2)**; senza, si ripiega su una sequenza di statement con rollback manuale, che sconsiglio.
5. **Fornitore per voce**: una scelta per tutte le unità. Dove le unità divergono (Santa Giustina) il select parte su "Valori diversi tra le unità" (valore sentinella, mai inviato); se l'utente non lo cambia il campo non entra nel payload e **nessuna riga viene toccata per quel campo** (se nessun campo cambia, nessuna scrittura e Salva disabilitato). Scegliere "— nessuno —" scrive NULL su tutte.
6. **Helper puro** `src/lib/maintenance-config.ts` (più `src/lib/completion-mode.ts`): `uniformValue(values)` (comune o diversi, con il valore), `buildConfigRows(items)` (righe del tab), `buildConfigChanges(current, draft)` (solo i campi toccati, sentinella "diversi" mai scritta), `validateConfigChanges` (whitelist), `planConfigWrite(rows, changes, today)` (per riga: campi, priority derivata, regole di data e status del punto 2, riepilogo per l'anteprima). `scripts/verify-maintenance-config.mjs` e `npm run verify:maintconfig`, con mutazioni a mano su tutte le regole (ramo promemoria senza reset dello status, cancello di consegna, spread del payload, campo non toccato che finisce scritto, sentinella scritta) e ripristino identico.

### Tab e percorso verso la frequenza

- Controllo a segmenti, solo per chi ha `canManagePlan` (oggi già così: l'admin non vede nessuna scheda): **Piano** (l'attuale "Attive", rinominata), **Configura** (nuova), **Escluse** (invariata, azioni attuali comprese: il commit 4 la riscrive).
- Frequenza fino al 3b: il bottone "Configura per unità" (testata della lista e fondo del pannello) resta, ribattezzato **"Frequenza per unità"**; porta alla vista per unità, dove `ItemConfigForm` mostra **solo il campo Frequenza** (con l'avviso "ancorata a una norma di legge") e Salva scrive solo `frequency_months` (la vecchia action ristretta). Modalità, fornitore e garanzia per unità spariscono da lì: si cambiano solo per voce. Con il 3b il bottone e la vista per unità spariscono.
- L'admin perde la modifica per unità che oggi ha (`ItemConfigForm` è visibile anche a lui): coerente con la decisione 4 (Configura solo super_admin).

### Pannello e UI

- Il guscio del 2a (portal, sfondo cliccabile, X, `useDialogFocus`) viene estratto in un componente condiviso `SidePanel` (commit di solo refactor, pannello di dettaglio invariato), usato anche dal pannello Configura.
- Sezioni **Cosa** (obbligo in sola lettura con la sua pillola, info garanzia) e **Chi e dove** (chi la chiude, fornitore), footer con un solo Salva (disabilitato senza modifiche), riepilogo sopra ("Cambi chi la chiude su 12 unità"), passo di conferma dentro il pannello quando il piano tocca date o status. Errori distinti: permessi, non trovata, errore tecnico "riprova"; mai `error` scartato.
- Campo misto: "Valori diversi tra le unità" come segnaposto, non toccato se l'utente non lo cambia.
- Tab Configura: stessa griglia e stesso stile della lista; le voci sono quelle del piano attivo; i fornitori misti si leggono "Valori diversi".

### Ordine dei commit

| # | Commit | Migrazione |
|---|---|---|
| 3a-1 | `completion-mode.ts`, `maintenance-config.ts`, `verify:maintconfig` con mutazioni | no |
| 3a-2 | Estrazione di `SidePanel` dal pannello 2a (solo refactor, schermate invariate) | no |
| 3a-3 | RPC `czero_configure_voce` (054) e action `configureVoce` con gate | sì (D2) |
| 3a-4 | Tab Piano / Configura / Escluse, tabella e pannello Configura | no |
| 3a-5 | Vecchia action ristretta a `frequency_months`, super_admin con scope, validata; `ItemConfigForm` a sola frequenza; bottone "Frequenza per unità"; chiusura B53 | no |

### Prove previste

- `npm run verify`, `verify:maintconfig`, `verify:maintlist`, `verify:maintdetail`.
- **SQL con `BEGIN; …; ROLLBACK`** (una transazione per esecuzione): scrittura su più righe di una voce di TEST wizard A, rifiuto per un admin, rifiuto cross-builder, atomicità (una riga fallisce → nessuna cambia), voce mista non toccata se il campo non cambia. Se un probe non è eseguibile per un limite d'ambiente lo dichiaro nel footer con il motivo.
- **DevTools su TEST wizard A** con scrittura vera: SELECT prima e dopo, ripristino dei valori e verifica del ripristino identico. Mai scrittura su teolo, Santa Giustina, Portello, Bassanello (lì solo lettura per vedere "Valori diversi").
- Pannelli a 1440 e 390 px con Tab, Escape, Invio; console e rete.

### Decisioni confermate da Filippo (2026-11-08)

- **D1 Obbligo — CONFERMATA: sola lettura per tutte le voci** (decisione del 31/10, nessun codice lo scrive, 0 override). B e C modificabili per voce restano scartati: richiederebbero di scrivere `obligation_type` sulle righe.
- **D2 Atomicità — CONFERMATA: RPC `czero_configure_voce` con migrazione 054** (additiva, un'unica transazione). Prima di applicarla: SQL mostrato per intero e riga in `docs/migrations.log`.
- **D3 Date nel passaggio da e verso promemoria — CONFERMATA: regole del punto 2 con anteprima** (tenere le date future, reset di passate e nulle verso promemoria; cancello di consegna al ritorno a modalità a tempo; "N unità tornano in attesa di consegna, N risultano scadute subito" prima di salvare).
- **D4 Righe archiviate — CONFERMATA: ricevono i soli campi di configurazione**, senza regole di data e status (alla re-inclusione le ricalcola `setTemplateActivationForResidence`).
- **D5 Parti comuni — CONFERMATA: `residente` rifiutato lato server** (e nascosto in UI): il cron notifica un residente solo se c'è `unit_id`.

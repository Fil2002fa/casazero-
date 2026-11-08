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

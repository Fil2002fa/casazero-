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

## Domande aperte (non toccano questo lavoro)

- "19 voci attive" in CLAUDE.md contro 35 nel DB (19 del catalogo v2 + 16 accese dalla migrazione 035).
- CLAUDE.md dice che le viste residente e admin leggono ancora `priority`: il grep non trova letture reali (una `select('*')` non comparirebbe). Il dual-write resta finché Filippo non lo chiude.
- CLAUDE.md dice "INSERT su `completions` solo ruolo admin": la policy ammette anche `client` (completamento del residente).

# Handoff — Definizione "scaduta" unificata e live · 02/07/2026 15:43

## Sommario
Unificata la definizione di "scaduta"/conformità in un unico helper condiviso
(`src/lib/maintenance-status.ts`) che calcola lo stato **live** da `next_due_date`
invece di leggere il campo `status` salvato (che solo il cron aggiorna, e che in dev
non gira mai). L'helper è stato applicato a tutte le superfici super_admin che
contano scadute, al report PDF e al Fascicolo residente, chiudendo la divergenza
schermo↔PDF. In parallelo è stata preparata (ma **non ancora applicata**) la SQL di
riconciliazione del catalogo v2, e ripuliti CLAUDE.md e alcuni microcopy.

## Lavoro completato
- [x] Diagnosi read-only del flusso "Crea residenza" (mappa completa: form, wizard date, contatori, FK unità, sidebar, dual-write)
- [x] Diff catalogo v2 ↔ DB: individuato il template mancante ("Manutenzione impianto fotovoltaico") che spiega il conteggio attivi 18 vs 19 attesi
- [x] Creato helper condiviso `src/lib/maintenance-status.ts` (fonte di verità dello stato live)
- [x] Migrate le superfici super_admin: lista residenze, dettaglio residenza, lista amministratori, scheda amministratore (commit `8689c9b`)
- [x] Migrato il report PDF a calcolo live (`api/report/route.ts`, commit `8689c9b`)
- [x] Eliminato `src/lib/residence-stats.ts` (assorbito nell'helper)
- [x] Allineato il Fascicolo residente all'helper, chiusa divergenza con PDF + corretto denominatore che includeva 282 item archiviati (commit `b454d66`)
- [x] CLAUDE.md portato a versione lean (commit `bc825ed`)
- [x] Microcopy form Nuova residenza: helper "Data consegna" ed "Edificio esistente" (commit `549107e`)
- [ ] **SQL riconciliazione catalogo v2 preparata ma NON applicata** (attende esecuzione manuale di Filippo nel SQL Editor)

## File toccati
### Creati
- `src/lib/maintenance-status.ts` — fonte di verità dello stato live. Esporta: `isOverdueLive`/`overdueLive` (scaduta = `next_due_date < oggi` AND mode ≠ promemoria AND countable), `isCountable` (template `is_active` + item `activation_status='inclusa'`), `resolveCompletionMode` (`item.completion_mode ?? template.completion_mode`, mai `priority`), `countLive` (conteggi aggregati), `todayISO`, e le costanti `LIVE_STATUS_FIELDS` / `LIVE_STATUS_TEMPLATE_FIELDS` per comporre le select Supabase.
- `docs/handoffs/HANDOFF_stato_scaduta_live_07_02_15_43.md` — questo documento.

### Modificati
- `src/app/(dashboard)/admin/residences/page.tsx` — contatori "A tuo carico"/"Condominiali"/"In corso" ora da `countLive`; rinominati i campi `_count` (scadute_residente/scadute_amministratore) per riflettere la modalità, non la priorità legacy.
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — card attenzione (voci Amministratore in ritardo / unità con voci Residente in ritardo) da `overdueLive` + `resolveCompletionMode`.
- `src/app/(dashboard)/admin/administrators/page.tsx` — conteggio overdue per residenza via `overdueLive`; guadagna l'esclusione promemoria e i filtri attivazione. `.lt('next_due_date', today)` tenuto come pushdown di efficienza, non come definizione.
- `src/app/(dashboard)/admin/administrators/[id]/page.tsx` — idem per la scheda del singolo amministratore.
- `src/app/api/report/route.ts` — conformità e elenco voci scadute calcolati live con lo stesso helper; le due liste ora derivano dallo stesso set `overdue`. Campi `n2n3Total`/`n2n3Ok` di `ReportData` non rinominati (cleanup separato).
- `src/app/(app)/fascicolo/page.tsx` — conformità/scadute live come il PDF; rimosso commento falso sul trigger `czero_recalc_due` (inesistente in `pg_trigger`).
- `src/app/(dashboard)/admin/residences/new/page.tsx` — solo microcopy (helper Data consegna + testo Edificio esistente).
- `CLAUDE.md` — riscritto in versione lean (−305/+79 righe). **Attenzione**: cita `docs/spec.md` e `docs/catalogo-manutenzioni-v2.md`, entrambi inesistenti (vedi Domande aperte).

### Eliminati
- `src/lib/residence-stats.ts` — `effPriority`/`ScaduteRow` assorbiti nell'helper.

### Letti (contesto)
- `src/app/(dashboard)/admin/residences/new/actions.ts` — server action creazione residenza; nessuno dei tre campi (completion_mode/obligation_type/priority) scritto sugli item → modello "NULL = eredita dal template".
- `src/app/api/cron/daily/route.ts` — unico posto che avanza `status` a 'scaduta' (riga 92); gira solo su Vercel con `CRON_SECRET`.
- `docs/catalogo-manutenzioni-casazero-v2.md` — fonte per il diff catalogo e i dati del template FV mancante.

## Decisioni chiave
- **`status` salvato resta nel DB, ma non è più fonte di verità per "scaduta"**: la definizione live vive solo nell'helper. `status` continua a servire per `in_corso` (ciclo Amministratore, stato esplicito legittimo) e per il cron notifiche. Alternativa scartata: far girare il cron in locale — non risolve il buco tra un run e l'altro in produzione.
- **Mode risolto via join, mai da `priority`**: `item.completion_mode ?? template.completion_mode`. Necessario perché i due assi sono desincronizzati (es. template sort 11/15: `completion_mode='promemoria'` ma `priority` legacy 'N2') — usare priority conterebbe promemoria come scadute.
- **Invariante promemoria esteso a tutte le superfici**: una voce Promemoria non è MAI scaduta. Le pagine Amministratori, che prima escludevano solo via priority legacy, ora rispettano l'invariante anche per i template desincronizzati.
- **Item `in_corso` con scadenza passata → bucket "In corso", non "scadute"**: cambio semantico voluto. Un lavoro Amministratore preso in carico e non finito non rende più "rosso" l'amministratore.
- **`.lt('next_due_date')` come pushdown, non come definizione**: le query Amministratori mantengono il filtro SQL per efficienza ma passano comunque per `overdueLive`; commento esplicito nel codice.

## Stato attuale
### Funziona
- `npm run build` e `npx tsc --noEmit` verdi su tutti i commit.
- Verifica dati reali (Residenza Cavaccio, unica con overdue): 17 voci overdue-per-data grezze → 11 su item archiviati (escluse), 1 promemoria (esclusa) → i contatori mostrano **5** invece dello **0** precedente.
- Verifica coerenza Fascicolo↔PDF per Unità 1 di Cavaccio: denominatore 14, scadute 3, conformità **79%** identici su entrambe le superfici (per costruzione: stesso helper, stesso perimetro).

### Non funziona / da verificare
- **SQL catalogo v2 non applicata**: `SELECT is_active, count(*) FROM maintenance_templates` dà ancora `true=18`. Il template "Manutenzione impianto fotovoltaico" non esiste ancora nel DB. Il codice non ne dipende (gli item ereditano dal template quando NULL), ma il test case FV va rifatto dopo l'applicazione.
- **Nessun test UI reale eseguito**: il dev server gira in finestra separata; verifiche fatte via query SQL replicando la logica dell'helper, non via browser.
- **Migrazione colonne v2 non versionata**: `completion_mode`/`obligation_type`/`activation_status`/`is_active`/`is_conditional` esistono nel DB remoto ma il DDL non è in `supabase/migrations/`.

## Prossimi passi
1. Applicare a mano la SQL di riconciliazione catalogo v2 nel SQL Editor di Supabase (testo completo sotto), poi verificare `is_active count = 19` e che nessuna voce Promemoria compaia nei conteggi scadute.
2. Decidere il nome canonico del catalogo: rinominare `docs/catalogo-manutenzioni-casazero-v2.md` → `docs/catalogo-manutenzioni-v2.md` (nome citato dal nuovo CLAUDE.md) **oppure** correggere il link in CLAUDE.md. Committare il file (oggi è untracked).
3. Creare `docs/spec.md` o rimuovere il riferimento in CLAUDE.md (oggi è un link rotto).
4. Versionare la migrazione delle colonne catalogo v2 in `supabase/migrations/`.
5. (Cleanup separato) Rinominare `n2n3Total`/`n2n3Ok` in `ReportData` con nomi neutri rispetto alla priorità legacy.

## Comandi da rilanciare
```bash
# Verifica type + build (da fare prima di ogni commit)
npx tsc --noEmit
npm run build

# Il dev server gira in finestra PowerShell separata e persistente:
#   cd C:\progetti\casazero ; npm run dev
```

SQL di riconciliazione catalogo v2 (da eseguire a mano nel SQL Editor):
```sql
-- Fix 1 — priority legacy allineata a completion_mode='promemoria' → N1
UPDATE maintenance_templates
SET priority = 'N1'
WHERE sort_order IN (11, 15)
  AND completion_mode = 'promemoria';

-- Fix 2 — template FV consolidato mancante (idempotente)
INSERT INTO maintenance_templates
  (title, category, description, frequency_months, priority, scope,
   sort_order, completion_mode, obligation_type, is_active, is_conditional)
SELECT
  'Manutenzione impianto fotovoltaico',
  'Fotovoltaico',
  'Inverter, moduli, pulizia e verifiche elettriche in un''unica voce. '
    || 'Amministratore se impianto condominiale, residente se di unità. '
    || 'Se potenza > 11,08 kW: controllo interfaccia inverter-rete obbligatorio ogni 5 anni (Tipo A, Delibera ARERA 786/2016).',
  12, 'N3', 'condominium', 29, 'amministratore', 'B', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM maintenance_templates WHERE title = 'Manutenzione impianto fotovoltaico'
);

SELECT is_active, count(*) FROM maintenance_templates GROUP BY is_active;
-- atteso: true=19, false=10
```

## Domande aperte
- Il template FV ha modalità condizionale ("Amministratore o Residente" secondo l'impianto), ma il modello ha un solo `completion_mode` per template: default 'amministratore' con override per residenza a livello di item, oppure serve un modello diverso?
- I template sort 22/23 (muri esterni / idrorepellente) restano Promemoria nel DB ma il catalogo v2 li vorrebbe "Amministratore · Tipo C" — è il "punto aperto" del catalogo, decisione di prodotto rimandata.
- Il pallino colorato della timeline nel Fascicolo usa ancora `effectivePriority` legacy: display puro sulle completions storiche, va bene o si allinea alla modalità?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: "La definizione di 'scaduta' è UNA sola e vive in `src/lib/maintenance-status.ts`. Scaduta = `next_due_date < oggi` calcolata live, MAI letta dal campo `status` salvato (lo aggiorna solo il cron, che non gira in locale e lascia buchi in produzione tra un run e l'altro). Il campo `status` resta legittimo solo per `in_corso` (ciclo Amministratore) e per il cron notifiche. Ogni nuova superficie che conta scadute/conformità DEVE usare questo helper."

- **Sezione Invarianti**: "La modalità di una manutenzione si risolve SEMPRE `item.completion_mode ?? template.completion_mode` (join), mai da `priority`. I due assi sono desincronizzati a livello di dato (esistono template Promemoria con priority legacy 'N2'). Una voce Promemoria non è MAI scaduta, su nessuna superficie."

- **Sezione Invarianti**: "I conteggi live devono filtrare `template.is_active = true` e `item.activation_status = 'inclusa'`. Gli item archiviati (activation_status ≠ 'inclusa') non entrano in denominatore conformità né in conteggio scadute — dimenticarlo gonfia il denominatore con centinaia di item disattivati."

- **Sezione Regole di codice**: "Schermo e PDF che mostrano gli stessi numeri (es. Fascicolo ↔ `/api/report`) devono condividere lo stesso helper E lo stesso perimetro di query (residence_id + unit_id). Toccarne uno solo riapre la divergenza schermo↔PDF."

- **Sezione Metodo di lavoro**: "Prima di scrivere in un commento del codice che un trigger/funzione DB esiste, verificalo in `pg_trigger`/`pg_proc`. In questa sessione un commento citava un trigger `czero_recalc_due` inesistente, usato come giustificazione per leggere lo `status` salvato."

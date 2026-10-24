# Scenari di accettazione — date di consegna e scadenze

Matrice di accettazione del blocco "le scadenze partono dalla consegna dell'unità".
Scritta il 24/10/2026, con **identificativi reali** del DB demo: ogni scenario è
eseguibile senza inventare dati.

**Come leggere lo stato di ogni scenario**

- `OGGI` — eseguibile subito, il codice che serve è già in `main`.
- `C8` — serve il commit 8 (viste "In attesa di consegna"), pronto ma non committato.
- `C10` — serve la modale "Registra consegna", non ancora implementata.

Le precondizioni in SQL le applica **Filippo** nel SQL Editor: Claude non scrive mai
sul DB (CLAUDE.md). Ogni blocco di setup ha accanto il suo **ripristino**, così la
residenza demo torna allo stato di partenza.

---

## Dati di partenza (verificati il 24/10/2026)

**Residenza Portello** `adf97f32-859a-493e-b145-915979f1ae09` · `delivery_date` **2026-06-01** · 4 unità · 38 voci

| unità | id |
|---|---|
| A1 | `4818141d-242c-4351-8dcd-005337afeb2b` |
| A2 | `28019fa2-785e-492d-b35b-40cc86ce8056` |
| B1 | `a3362b7e-22f5-4591-8eaf-2d826ff20047` |
| B2 | `9c351ea9-9162-478f-9692-7769e82ab92d` |

Tutte e quattro con `delivery_date` = 2026-06-01 (backfill della 041).

**Voci usate negli scenari** (unità A1 e parti comuni)

| voce | id | freq | modalità | scadenza oggi |
|---|---|---|---|---|
| Controllo e lubrificazione serramenti | `455c918f-1ad6-450a-a773-0eee899a3320` | 12m | residente | **2026-08-01** → già scaduta |
| Manutenzione impianto climatizzazione | `9cf70ab8-9814-403e-9053-d6ef3f6b0940` | 12m | residente | 2027-06-01 |
| VMC: sostituzione filtri | `5869a8b0-9bf1-4e1b-ad31-7a6a8f2d70d8` | 12m | residente | 2027-06-01 |
| VMC: pulizia condotti | `72546177-c40b-417d-b429-64aad6f3da70` | 36m | residente | 2029-06-01 |
| Test del differenziale (tasto T) | `f885cfab-cfcf-411c-9afb-75a6b5af6172` | 6m | **promemoria** | 2026-12-01 |
| Pulizia grondaie (parti comuni) | `ea6870dc-0aff-415f-8433-a96a9e21fcb3` | 12m | amministratore | 2027-06-01 |
| Verifica linee vita (parti comuni) | `2291f54a-2e18-4d17-92c0-6c23a197fa23` | 12m | amministratore | 2027-09-19 **[nel fascicolo]** |

Serramenti su A1 scade 2026-08-01 e non 2027-06-01 perché `passo1.sql:135` l'ha
forzata a mano per avere una voce scaduta nella demo. È l'unica voce di Portello
fuori dalla regola "consegna + frequenza".

**Attori** — super_admin `99b90ec5-6a80-4ec3-8884-377163c5510b` (pippoloro02) ·
admin `7a210c85-7816-4d5f-b802-176505947469` (filippoloro02, assegnato a Portello)

**Un limite da sapere prima di iniziare:** in Portello l'unico completamento è su
una voce di **parti comuni** (`2291f54a`). Nessuna voce **di unità** di Portello è
nel fascicolo, quindi lo scenario 6 al livello unità richiede di registrarne uno
prima (il passo è incluso). Tutti i completamenti su voci di unità del DB stanno
in Residenza Cavaccio, che è demo usa-e-getta.

---

## 1. Unità invenduta — `C8`

Il piano di un'unità senza data di consegna non parte, e nessuna scadenza compare.

**Precondizione**
```sql
UPDATE units SET delivery_date = NULL
 WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';   -- A1
UPDATE maintenance_items SET next_due_date = NULL, status = 'in_attesa'
 WHERE unit_id = '4818141d-242c-4351-8dcd-005337afeb2b';
```

**Passi** — da `pippoloro02`: Residenze → Portello → Manutenzioni, espandere A1.
Poi `/admin/manutenzioni` (come `filippoloro02`). Poi la PWA come residente di A1,
se esiste un account.

**Atteso a schermo**
- Piano di Portello, righe di A1: **"In attesa di consegna"** al posto di "Scade …".
  Nessun rosso, nessun "Scaduta".
- Le promemoria di A1 restano **"Promemoria · ogni 6 mesi"** in blu: la data non
  c'entra, non devono mostrare "In attesa di consegna".
- Le voci di A2, B1, B2 restano con le loro date: una sola unità ferma non ferma
  le altre.
- Zona attenzione della residenza: A1 **non** compare tra i ritardi.
- Home residente di A1: card neutra **"Il piano di manutenzione parte dalla data di
  consegna"**, nessun conteggio, nessun colore d'allarme.
- Banner home: **da decidere** (vedi "Questioni aperte").

**Verifica**
```sql
SELECT count(*) FILTER (WHERE next_due_date IS NULL)  AS senza_data,
       count(*) FILTER (WHERE next_due_date IS NOT NULL) AS con_data
  FROM maintenance_items WHERE unit_id = '4818141d-242c-4351-8dcd-005337afeb2b';
-- Atteso: tutte senza data (9 voci di A1)

SELECT count(*) AS altre_unita_con_data FROM maintenance_items mi JOIN units u ON u.id = mi.unit_id
 WHERE u.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09'
   AND u.id <> '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.next_due_date IS NOT NULL;
-- Atteso: > 0 (le altre tre unità non si fermano)
```

**Ripristino**: scenario 2, che riporta A1 a 2026-06-01.

---

## 2. Consegna di una singola unità — `C10`

**Precondizione**: lo stato finale dello scenario 1 (A1 senza data).

**Passi** — da `pippoloro02`, pagina Unità di Portello → riga A1 → "Registra
consegna" → data **2026-10-24** → l'anteprima mostra le scadenze risultanti →
Conferma.

**Atteso a schermo**
- Nell'anteprima, **prima** di confermare: 12m → 2027-10-24, 36m → 2029-10-24,
  e il conteggio delle voci che verranno ricalcolate.
- Nessuna promemoria nell'anteprima.
- Dopo la conferma: A1 mostra le date nuove; "In attesa di consegna" scompare.
- Una riga nel registro attività della residenza.

**Verifica**
```sql
SELECT u.delivery_date FROM units u WHERE u.id = '4818141d-242c-4351-8dcd-005337afeb2b';
-- Atteso: 2026-10-24

SELECT mi.next_due_date, COALESCE(mi.frequency_months, mt.frequency_months) AS freq,
       COALESCE(mi.completion_mode, mt.completion_mode) AS modalita, mt.title
  FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
 ORDER BY mi.next_due_date;
-- Atteso: ogni voce non-promemoria = 2026-10-24 + la sua frequenza
--         (12m → 2027-10-24, 36m → 2029-10-24)

SELECT event_type, payload, actor_name, created_at FROM activity_events
 WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09'
   AND event_type = 'data_consegna_modificata' ORDER BY created_at DESC LIMIT 1;
-- Atteso: payload {"livello":"unita","vecchio":null,"nuovo":"2026-10-24", …}
--         actor_name congelato = nome del super_admin
```

---

## 3. Consegna in blocco — `C10`

**Precondizione**
```sql
UPDATE units SET delivery_date = NULL WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09';
UPDATE maintenance_items SET next_due_date = NULL, status = 'in_attesa'
 WHERE unit_id IN (SELECT id FROM units WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09');
```

**Passi** — selezionare A1, A2, B1 (non B2) → "Registra consegna" → 2026-09-01 →
anteprima → Conferma.

**Atteso a schermo**
- L'anteprima dice su quante unità e quante voci sta agendo.
- Dopo: tre unità con le date nuove, **B2 resta "In attesa di consegna"**.
- **Tre righe** nel registro, una per unità, ognuna con il suo `unit_id`: l'atto è
  per unità (043, commento sul valore nuovo). Non una riga sola.

**Verifica**
```sql
SELECT label, delivery_date FROM units
 WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09' ORDER BY label;
-- Atteso: A1/A2/B1 = 2026-09-01, B2 = NULL

SELECT count(*) AS righe_registro FROM activity_events
 WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09'
   AND event_type = 'data_consegna_modificata'
   AND created_at > now() - interval '5 minutes';
-- Atteso: 3
```

---

## 4. Data di consegna nel passato, con voci che nascono già scadute — `C10`

Il caso che il costruttore incontrerà per primo: unità vendute mesi prima che
CasaZero esista.

**Passi** — A1 → "Registra consegna" → **2024-01-15**.

**Atteso a schermo**
- L'anteprima **avvisa** che alcune voci risulteranno già scadute, e dice quante:
  12m → 2025-01-15 (passata), 36m → 2027-01-15 (futura). L'avviso non blocca la
  conferma: la data è un fatto, non un errore.
- Dopo la conferma: le voci a 12m compaiono in rosso come scadute; quelle a 36m no.
- Zona attenzione della residenza e contatore "In ritardo" aumentano.
- Il residente di A1 vede il banner rosso con il conteggio.

**Verifica**
```sql
SELECT mt.title, COALESCE(mi.frequency_months, mt.frequency_months) AS freq, mi.next_due_date,
       mi.next_due_date < CURRENT_DATE AS gia_scaduta
  FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
   AND COALESCE(mi.completion_mode, mt.completion_mode) <> 'promemoria'
 ORDER BY mi.next_due_date;
-- Atteso: 12m → 2025-01-15 gia_scaduta = true · 36m → 2027-01-15 false
```

**Nota sul cron**: in locale non gira (CLAUDE.md), quindi `status` resterà
`in_attesa` mentre lo schermo dirà "Scaduta". È corretto: lo stato si calcola live
da `next_due_date` (`maintenance-status.ts:85-93`), mai dal campo salvato.

---

## 5. Data di consegna nel futuro, e il clamp di fine mese — `C10`

**Passi** — A1 → "Registra consegna" → **2027-03-01**. Poi di nuovo con
**2028-02-29** (anno bisestile).

**Atteso a schermo**
- Con 2027-03-01: nessuna voce scaduta, nessun avviso; 12m → 2028-03-01.
- Con 2028-02-29: la voce a 12m va a **2029-02-28**, non al 1 marzo. È il clamp di
  `nextDueFrom` (`maintenance-due.ts`), la stessa semantica di `interval` Postgres
  usata dalle RPC e dal trigger di ricalcolo.

**Verifica**
```sql
SELECT mi.next_due_date FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.id = '9cf70ab8-9814-403e-9053-d6ef3f6b0940';  -- climatizzazione, 12m
-- Atteso: 2029-02-28 con consegna 2028-02-29
```

---

## 6. Correzione della data dopo che esistono completamenti — `C10`

**Il fascicolo vince sul modello.** Le voci già completate non si ricalcolano mai:
la loro data viene da un fatto reale, non dalla cascata.

### 6a — livello parti comuni, eseguibile su Portello così com'è

`2291f54a` (Verifica linee vita) ha un completamento e scadenza 2027-09-19,
derivata da `completed_at` dal trigger `czero_recalc_due`.

**Passi** — cambiare la data di consegna della **residenza** Portello (o la data di
categoria "Coperture") → Conferma.

**Atteso a schermo**
- L'anteprima dice: *N voci ricalcolate, 1 saltata perché già nel fascicolo*, con
  il motivo in chiaro.
- `2291f54a` resta a **2027-09-19**.
- `ea6870dc` (grondaie, nessun completamento) si ricalcola.

**Verifica**
```sql
SELECT mi.id, mt.title, mi.next_due_date,
       EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id) AS nel_fascicolo
  FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09' AND mi.unit_id IS NULL
 ORDER BY nel_fascicolo DESC;
-- Atteso: la riga con nel_fascicolo = true ha ANCORA 2027-09-19

SELECT count(*) AS completamenti FROM completions
 WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09';
-- Atteso: invariato prima e dopo. completions non si tocca MAI.
```

### 6b — livello unità, serve prima un completamento

Nessuna voce di unità di Portello è nel fascicolo. Per provarlo:

**Passi** — come residente di A1 (o come amministratore sulla voce giusta),
completare `9cf70ab8` (climatizzazione). Poi A1 → "Registra consegna" → 2026-05-01.

**Atteso**: la voce completata conserva la data derivata dal completamento;
le altre voci di A1 si ricalcolano da 2026-05-01.

---

## 7. Override manuale su una singola voce — `C10`

**Passi** — A1 → "Registra consegna" → sezione avanzata → per la sola voce
`5869a8b0` (VMC filtri, 12m) data **2025-11-10** → Conferma.

**Atteso a schermo**
- `5869a8b0` → 2026-11-10, le altre voci di A1 dalla data dell'unità.
- Il dettaglio della voce dice che la data viene da un **override di voce**, non
  dalla data dell'unità (`resolveDueBasis` restituisce anche il livello).

**Verifica**
```sql
SELECT mi.due_basis_override, mi.next_due_date FROM maintenance_items mi
 WHERE mi.id = '5869a8b0-9bf1-4e1b-ad31-7a6a8f2d70d8';
-- Atteso: due_basis_override = 2025-11-10, next_due_date = 2026-11-10

SELECT payload FROM activity_events
 WHERE event_type = 'data_consegna_modificata' AND payload->>'livello' = 'voce'
 ORDER BY created_at DESC LIMIT 1;
-- Atteso: {"livello":"voce","item_id":"5869a8b0-…","vecchio":null,"nuovo":"2025-11-10"}
```

**Caso speciale, da provare esplicitamente**: l'override su un'unità **senza** data
di consegna **fa partire** quella singola voce, mentre le sue sorelle restano in
attesa. È l'unica cosa che apre il cancello (`maintenance-due.ts`, blocco
"LA DATA DELL'UNITA E UN CANCELLO").

---

## 8. Data di categoria su unità consegnata — `C10`

**Precondizione**: A1 consegnata (scenario 2). Prendere la categoria reale della
voce da usare:
```sql
SELECT mt.category FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.id = '5869a8b0-9bf1-4e1b-ad31-7a6a8f2d70d8';
```

**Passi** — fissare per Portello una data di categoria **2026-03-20** su quella
categoria.

**Atteso a schermo**: le voci di quella categoria, su **tutte le unità
consegnate**, partono da 2026-03-20 e non dalla data della loro unità. La categoria
scavalca la data dell'unità.

**Verifica**
```sql
SELECT u.label, mt.category, mi.next_due_date
  FROM maintenance_items mi
  JOIN maintenance_templates mt ON mt.id = mi.template_id
  LEFT JOIN units u ON u.id = mi.unit_id
 WHERE mi.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09'
   AND mt.category = '<CATEGORIA>' ORDER BY u.label;
-- Atteso: 2026-03-20 + frequenza per ogni unità CONSEGNATA
```

---

## 9. Data di categoria su unità NON consegnata — `C10`

**Il caso che distingue il cancello dal fallback.**

**Precondizione**: A1 senza data (scenario 1), A2/B1/B2 consegnate, più la data di
categoria dello scenario 8.

**Atteso a schermo**
- A2, B1, B2: le voci di quella categoria partono dalla data di categoria.
- **A1: restano "In attesa di consegna".** Una data di categoria non fa partire
  un'unità non consegnata: riguarda le unità consegnate, non le altre.

**Verifica**
```sql
SELECT u.label, u.delivery_date, mi.next_due_date
  FROM maintenance_items mi JOIN units u ON u.id = mi.unit_id
  JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mt.category = '<CATEGORIA>'
   AND u.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09' ORDER BY u.label;
-- Atteso: A1 delivery_date NULL e next_due_date NULL;
--         le altre tre con la data di categoria + frequenza
```

Se A1 avesse una data qui, la cascata è tornata a fare fallback: è la regressione
che `verify:basis` copre con tre casi anti-regressione.

---

## 10. Unità aggiunta dopo la creazione della residenza — `C10`

**Passi** — Portello → Unità → aggiungere "C1" → osservare le sue voci prima di
registrare una consegna.

**Atteso a schermo**: C1 nasce **senza data di consegna**, quindi le sue voci sono
"In attesa di consegna". Non eredita la data della residenza.

> Questo è il comportamento **voluto** ma richiede la 044: oggi
> `czero_add_unit_with_items` (013) usa `COALESCE(delivery_date, CURRENT_DATE)`
> della residenza come base (`013_add_unit_atomic.sql:46-47`), quindi un'unità
> aggiunta ora eredita 2026-06-01. **Scenario che deve FALLIRE prima della 044 e
> passare dopo**: è la prova che la 044 serve davvero.

**Verifica**
```sql
SELECT u.label, u.delivery_date, count(mi.id) AS voci,
       count(mi.id) FILTER (WHERE mi.next_due_date IS NULL) AS senza_data
  FROM units u LEFT JOIN maintenance_items mi ON mi.unit_id = u.id
 WHERE u.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09' AND u.label = 'C1'
 GROUP BY u.label, u.delivery_date;
-- Atteso DOPO la 044: delivery_date NULL, senza_data = voci
-- Atteso OGGI (prima della 044): delivery_date 2026-06-01, senza_data = 0
```

---

## 11. Le promemoria non entrano mai in questa storia — `C8`

**Passi** — con A1 senza data (scenario 1), guardare le promemoria di A1:
`f885cfab` (Test differenziale, 6m) e `699aa01c` (Imbiancatura, 36m).

**Atteso a schermo**
- **"Promemoria · ogni 6 mesi"** in blu, come sempre.
- **Mai** "In attesa di consegna", mai "Scaduta", mai una data.
- Non compaiono nell'anteprima della modale e non entrano nei conteggi delle voci
  ricalcolate.

È garanzia strutturale, non cosmetica: `isAwaitingDelivery`
(`maintenance-status.ts`) esclude le promemoria, e `activityBucket` non può
metterle in nessun bucket perché `isAdminActivity` le scarta prima.

**Verifica**
```sql
SELECT mt.title, COALESCE(mi.completion_mode, mt.completion_mode) AS modalita, mi.next_due_date
  FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
 WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
   AND COALESCE(mi.completion_mode, mt.completion_mode) = 'promemoria';
-- La data qui può essere qualsiasi cosa, anche passata: lo schermo non la legge.
```

---

## 12. L'admin non scrive le date di consegna — `OGGI`

**Passi** — entrare come `filippoloro02` (admin, assegnato a Portello).

**Atteso a schermo**
- Pagina Unità di Portello: **nessun** pulsante "Registra consegna", nessun campo
  data di consegna. L'admin **legge** le date, non le scrive.
- Le date di categoria sono visibili ma non modificabili.
- Il resto delle sue azioni funziona come prima: presa in carico, sollecito,
  configurazione voce con `next_due_date`.

**Verifica** — i blocchi di test RLS in coda a
`supabase/migrations/042_cascata_date_consegna.sql`: negativi 1-5 (admin che scrive
l'override, che inserisce o aggiorna una data di categoria, che legge fuori
perimetro, super_admin fuori dal proprio builder) e **positivo 5**, che prova che il
guard non si è allargato per sbaglio e l'admin scrive ancora tutta l'allowlist della
021, `next_due_date` compreso.

La difesa è su tre livelli e va verificata su tutti e tre: policy RLS su `units`
(`002_rls.sql:168-176`, solo super_admin), policy su `residence_category_dates`
(042), guard per colonne su `maintenance_items.due_basis_override` (042 sezione 5).
Nascondere il pulsante non è una difesa.

---

## Questioni aperte

1. **Banner della home residente.** Con tutte le voci in attesa di consegna,
   `urgentCount` è 0 e il banner dice **"Tutto in ordine · Nessuna manutenzione in
   scadenza"**, sopra la card neutra che dice che il piano non è partito. Le due
   frasi si contraddicono: niente è "in ordine", semplicemente niente è iniziato.
   Difetto preesistente, non introdotto dal commit 8. Da decidere se il banner
   taccia o cambi parole quando non c'è nessuna voce datata.

2. **Lista manutenzioni del residente.** `ListItem`
   (`(app)/manutenzioni/ManutenzioniList.tsx:12-22`) non porta `next_due_date`: la
   sezione "In programma" non mostra date a nessuna voce, quindi non dice niente di
   sbagliato, ma non dice nemmeno perché quelle voci non hanno una scadenza.
   Lasciata fuori dal commit 8 di proposito.

3. **Unità consegnata senza residente.** Registrare la consegna non crea un
   account: un'unità può avere la data e nessun residente che veda le scadenze. Il
   cron avanza date e stati comunque, le notifiche vanno a zero destinatari
   (`api/cron/daily/route.ts:89-99`). Da decidere se la pagina Unità mostri quel
   divario come fa già per "unità senza account".

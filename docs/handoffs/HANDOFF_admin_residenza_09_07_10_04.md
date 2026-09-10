# Handoff — Vista amministratore sulla residenza · 07/09/2026 10:04

## Sommario
L'amministratore di condominio (ruolo `admin`) aveva un solo punto d'ingresso
in dashboard (`/admin/manutenzioni`, cross-residenza) e nessuna pagina di
dettaglio per la singola residenza che segue, pur avendo già permessi
applicativi/RLS su alcune superfici (fornitori, upload documenti) mai
raggiungibili per assenza di rotta. Sessione divisa in FASE 0 (diagnosi) +
3 commit chiusi + commit 4 in tre parti (a/b/c) non ancora iniziato.

## Lavoro completato
- [x] Migrazione 036: policy RLS che concede all'`admin` scrittura su
      `suppliers` per le residenze che segue (applicata e verificata da
      Filippo nel SQL Editor)
- [x] Commit 2: `/admin/residences/[id]` ora accetta anche il ruolo `admin`,
      con un ramo di rendering separato e sola lettura
- [x] Commit 3: card di `followedResidences` in `/admin/manutenzioni` ora
      sono `Link` cliccabili verso `/admin/residences/[id]`; blocco contatti
      costruttore ("Furlan") separato in sezione propria con intestazione
- [ ] Commit 4a — Fascicolo: `requireRole` + gate hardcoded in
      `api/fascicolo-pdf/route.ts:35` (NON iniziato)
- [ ] Commit 4b — Manutenzioni: `requireRole` + nascondere "Configura" e
      "Escludi/Includi dal piano" all'admin + fix modal silenzioso
      (NON iniziato)
- [ ] Commit 4c — Documenti: `requireRole` + riscrittura
      `getAuthorizedSuperAdmin` (NON iniziato)
- [ ] Commit 5 — sidebar admin: solo proposta di struttura, mai discussa
      nel dettaglio (NON iniziato)

## File toccati
### Creati
- `supabase/migrations/036_suppliers_admin_write_policy.sql` — policy
  `"suppliers: admin gestisce quelli delle residenze assegnate"` (FOR ALL,
  USING+WITH CHECK su `czero_user_role()='admin' AND
  czero_can_access_residence(residence_id)`). Applicata da Filippo, footer
  compilato con l'esito reale.

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — `requireRole`
  allargato a `['admin','super_admin']`; aggiunto ramo `AdminResidenceView`
  (testata sola lettura, tabella unità sola lettura, porte verso
  Manutenzioni/Fascicolo/Documenti/Fornitori, NON Unità). Estratti tre
  helper/componenti condivisi tra i due rami per non duplicare calcolo e
  markup: `summarizePlan` (ritardi/prossime scadenze), `buildUnitSummary`
  (conteggio unità, gap account, righe tabella), `PlanSummarySection`
  (l'intero blocco JSX "Piano manutenzioni", prima duplicato carattere per
  carattere nei due rami).
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` —
  aggiunta prop `readOnly?: boolean` (default `false`): quando true, la
  riga non è più `clickable` e non ha `onClick` (niente navigazione verso
  `.../units`, porta esclusa per l'admin).
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — le card di
  `followedResidences` sono diventate `Link` verso
  `/admin/residences/${r.id}` (erano `<div>` senza navigazione); il blocco
  contatti costruttore è uscito da "Residenze che segui" ed è ora una
  `<section>` con `<h2>Il tuo costruttore</h2>` propria.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/[id]/fornitori/page.tsx` e
  `actions.ts` — unica sotto-pagina già aperta ad `admin` prima di questa
  sessione; il suo link "indietro" punta a `/admin/residences/${id}`, prova
  che quell'URL doveva restare unico e non biforcarsi
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx`,
  `ManutenzioniClient.tsx`, `ItemConfigForm.tsx` — mappate tutte le
  scritture: "Configura" (`updateMaintenanceItemConfig`,
  `fornitori/actions.ts:82-153`) e "Escludi/Includi dal piano"
  (`setTemplateActivationForResidence`, `fornitori/actions.ts:159-244`)
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` — nessuna
  scrittura, ma il link "Scarica fascicolo (PDF)" chiama
  `api/fascicolo-pdf/route.ts`, che ha un gate proprio
- `src/app/api/fascicolo-pdf/route.ts` — riga 35:
  `if (!profile || profile.role !== 'super_admin')`, indipendente dalla RLS
  e dalla pagina; va allineato o il bottone resta un vicolo cieco per l'admin
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — tutte
  e 5 le action (`createUploadUrl`, `confirmDocument`,
  `confirmClassification`, `setChecklistException`,
  `clearChecklistException`) passano da `getAuthorizedSuperAdmin`
  (righe 16-30), che rifiuta categoricamente l'admin
- `supabase/migrations/002_rls.sql` — policy citate durante la FASE 0:
  righe 296-301 (`"items: admin aggiorna stato"`, FOR UPDATE, nessuna
  restrizione di colonna), 286-293 (`"items: super_admin gestisce tutto"`),
  350-360 (`"documents: admin e super_admin gestiscono"`, FOR ALL, ammette
  già l'admin — in contraddizione con `getAuthorizedSuperAdmin`)
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — tutte le
  scritture passano da `createServiceClient()` (bypassa RLS): `createUnit`
  e `updateUnitLabel` sono super_admin-only, `createInvite`/
  `createBulkInvites` ammettono già `admin` a livello applicativo,
  `revokeInvite` non ha alcun controllo di ruolo (bug trovato, fuori scope)
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — flusso di
  registrazione completamento dell'admin (`completeN3`, `takeChargeN3`),
  già corretto e in produzione, indipendente dalle pagine toccate in
  questa sessione

## Decisioni chiave
- **URL unico con ramo per ruolo, non pagina separata**: `/admin/residences/[id]`
  resta l'unica rotta per il concetto "residenza", branch di rendering per
  ruolo dentro lo stesso `page.tsx`. Alternativa scartata: una rotta
  dedicata all'admin (es. `/admin/residenza/[id]`) — avrebbe duplicato la
  nomenclatura per lo stesso concetto (rischio simile a N1/N2/N3) e rotto
  il link "indietro" già hardcoded in `fornitori/page.tsx`.
- **Porte aggiunte prima dell'apertura delle sotto-pagine (commit 2 prima
  del commit 4)**: decisione esplicita di Filippo, accettando che
  Manutenzioni/Fascicolo/Documenti reindirizzino l'admin a
  `/admin/manutenzioni` finché il commit 4 non le apre. Non è un link
  rotto (redirect, non 404), ma un soft dead-end temporaneo tra i commit.
- **Calcolo E markup condivisi tra i due rami, non solo il calcolo**: prima
  versione del commit 2 duplicava il blocco JSX "Piano manutenzioni" tra i
  due rami dopo aver già condiviso il calcolo — stessa bug class (CLAUDE.md,
  "helper condiviso obbligatorio") applicata alla presentazione. Corretto
  estraendo `PlanSummarySection`.
- **`UnitsSummaryTable` riusata con un solo prop `readOnly`**, non una
  variante separata: l'unica differenza reale è la navigazione della riga
  (`clickable`/`onClick`), non la resa. Evitato di "snaturare" il
  componente aggiungendo prop multiple.
- **Eccezioni checklist di consegna restano super_admin-only** (decisione
  di Filippo, non riaprire): sono una dichiarazione del costruttore
  sull'edificio, non compito dell'amministratore.
- **Inviti residenti da `.../units` NON aperti all'admin, porta Unità
  esclusa per intero** (decisione di Filippo, non riaprire): anche se il
  codice ammette già `admin` a livello applicativo per
  `createInvite`/`createBulkInvites`, la pagina resta chiusa come blocco
  unico.

## Stato attuale
### Funziona
- Migrazione 036 applicata e verificata (3 policy su `suppliers`, la nuova
  con `with_check` valorizzato, le altre due invariate)
- `/admin/residences/[id]` per ruolo `admin`: testata sola lettura, tabella
  unità sola lettura, riepilogo piano, porte verso le 4 sotto-pagine
  (Manutenzioni/Fascicolo/Documenti raggiungibili ma redirette a
  `/admin/manutenzioni` finché il commit 4 non le apre; Fornitori già
  funzionante da prima di questa sessione)
- Card residenza in `/admin/manutenzioni` cliccabili, tastiera e nuova
  scheda funzionanti (next/link nativo)
- `tsc --noEmit` verde su tutti e 3 i commit

### Non funziona / da verificare
- Fino al commit 4a: pulsante "Scarica fascicolo (PDF)" bloccato per
  l'admin anche dopo l'apertura della pagina Fascicolo (gate hardcoded in
  `api/fascicolo-pdf/route.ts:35`)
- Fino al commit 4b: se un admin raggiungesse `.../manutenzioni` oggi (non
  raggiunge, redirect attivo), vedrebbe "Configura" e "Escludi/Includi dal
  piano" — azioni del costruttore da nascondere prima di aprire la pagina
- Modal di conferma "Escludi/Includi dal piano"
  (`ManutenzioniClient.tsx:640-702`) resta aperto senza messaggio quando
  `setTemplateActivationForResidence` rifiuta l'azione (`handleConfirm`,
  riga 119-126, non gestisce `res.error`) — da verificare/correggere nel
  commit 4b
- Fino al commit 4c: upload documenti e conferma classificazione AI restano
  bloccati per l'admin nonostante la RLS li ammetta già
  (`"documents: admin e super_admin gestiscono"`)

## Prossimi passi
1. **Commit 4a — Fascicolo**: allargare `requireRole` in
   `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` a
   `['admin','super_admin']`; allineare il gate in
   `src/app/api/fascicolo-pdf/route.ts:35` (oggi
   `profile.role !== 'super_admin'`) così il pulsante PDF funzioni anche
   per l'admin sulle residenze che segue. Diff nel messaggio, stop prima di
   committare.
2. **Commit 4b — Manutenzioni**: allargare `requireRole` in
   `.../manutenzioni/page.tsx`; nascondere all'admin il bottone "Configura"
   (`ItemConfigForm`, montato in `ManutenzioniClient.tsx:765-774`) e i
   bottoni "Escludi dal piano"/"Includi nel piano"
   (righe 556-566, 621-632); verificare/correggere il modal che oggi resta
   aperto in silenzio su errore (`handleConfirm`, riga 119-126).
3. **Commit 4c — Documenti**: allargare `requireRole` in
   `.../documenti/page.tsx`; riscrivere `getAuthorizedSuperAdmin` in
   `actions.ts` (righe 16-30, nome da cambiare perché non descrive più cosa
   fa) per ammettere `admin` su `createUploadUrl`, `confirmDocument`,
   `confirmClassification` — NON su `setChecklistException`/
   `clearChecklistException`, che restano super_admin-only.
4. Dopo il commit 4c: proporre struttura sidebar admin (commit 5) e
   fermarsi prima di scrivere codice (richiesta esplicita di Filippo).
5. Segnalazione in sospeso di Filippo (non in commit 4): la stat card "Voci
   attive" in `/admin/residences/[id]/page.tsx` mostra un numero grezzo
   (es. 80, 115) poco leggibile in entrambi i rami — quando si affronta va
   corretta in un punto solo (probabilmente dentro `StatCard`/
   `summarizePlan`, non duplicata tra i rami).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit
```

## Domande aperte
- Nessuna verso Filippo in questo momento: il piano del commit 4 (a/b/c) è
  già confermato e ordinato esplicitamente nella conversazione precedente.

## Leggi emerse (candidate per CLAUDE.md)
Ci sono 2 leggi candidate.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug
  class note)** — aggiungere:
  > La bug class "helper condiviso obbligatorio" copre anche il markup, non
  > solo il calcolo: se lo stesso dato derivato produce lo stesso JSX in più
  > superfici (es. due rami di ruolo sulla stessa pagina), estrarre un
  > componente condiviso per la resa, non solo una funzione per il calcolo
  > — altrimenti il primo ritocco visivo fa divergere le due superfici senza
  > errore di tipo a segnalarlo.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug
  class note)** — aggiungere:
  > Prima di concedere FOR ALL (quindi anche DELETE) su una tabella via
  > RLS, inventariare le foreign key entranti e la loro clausola ON DELETE:
  > un ON DELETE CASCADE non dichiarato esplicitamente nel testo della
  > migrazione può cancellare a catena righe che si credevano protette. Se
  > una FK risulta CASCADE, fermarsi e segnalarlo prima di procedere — cambia
  > la forma della migrazione.

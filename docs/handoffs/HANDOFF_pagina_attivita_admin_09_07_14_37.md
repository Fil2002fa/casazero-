# Handoff — Pagina Attività amministratore · 07/09/2026 14:37

## Sommario
La sessione ha trasformato `/admin/manutenzioni` da home dell'amministratore (card delle residenze seguite, blocco "Il tuo costruttore", contatori e tabella in fondo) in una pagina "Attività": una sola lista di cose da fare ordinata per urgenza su tutte le residenze seguite, con contatori e righe che partizionano lo stesso array tramite helper condivisi in `src/lib/maintenance-status.ts`. Prima della riscrittura sono stati committati i due lavori della sessione precedente rimasti in working tree (elenco residenze admin e sidebar a due voci). Quattro commit sono chiusi e verificati; il quinto, cosmetico sullo stato attivo dei contatori, è in working tree con `tsc` verde in attesa della verifica visiva di Filippo.

## Lavoro completato
- [x] FASE 0 — diagnosi read-only di `/admin/manutenzioni`: struttura, contatori, liste, calcolo scadenze, promemoria, multi-residenza
- [x] 5a — Elenco residenze per l'admin (`272f980`, scritto nella sessione precedente, committato qui)
- [x] 5b — Sidebar admin a due voci Residenze / Attività (`8a4571e`, idem)
- [x] A — Rimozione card residenze e blocco costruttore, titolo "Attività" (`da70b45`)
- [x] B — Lista unica per urgenza con helper condiviso per contatori e righe, fix badge di riga (`fbe42b4`)
- [x] C — Dettaglio voce: stato dal calcolo live, residenza come link alla sua pagina (`fe2a58b`)
- [ ] D — Cosmetico: stato attivo dei contatori con colore pieno invece del contorno. Scritto, `tsc` verde, NON committato, NON verificato

## File toccati

### Creati
Nessuno. Nuove funzioni aggiunte a un helper esistente, nessun file nuovo.

### Modificati

**Committati**
- `src/app/(dashboard)/admin/residences/page.tsx`, `ResidencesTable.tsx`, `ResidencesEmptyState.tsx` (5a, `272f980`) — vista admin dell'elenco residenze, descritta nell'handoff `HANDOFF_accesso_admin_residenza_09_07_13_08.md`.
- `src/components/AdminSidebar.tsx` (5b, `8a4571e`) — `ADMIN_ITEMS` con due voci: Residenze → `/admin/residences`, Attività → `/admin/manutenzioni`.
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` (A, `da70b45`) — rimosse le query su `admin_assignments`, `units` (count per residenza, N+1) e `builders`, i tipi `FollowedResidence` e `BuilderContact`, le due sezioni di card. Titolo "Attività" in serif come la pagina Residenze, sottotitolo "Interventi a tuo carico su tutte le residenze che segui", metadata allineato. `requireRole` non assegna più il profilo perché serviva solo alla query rimossa.
- `src/lib/maintenance-status.ts` (B) — nuovo blocco "Attività dell'amministratore": tipo `ActivityBucket` (`in_ritardo | in_corso | in_arrivo`), `isAdminActivity` (conteggiabile + modalità amministratore + non completata), `activityBucket` (scaduta via `isOverdueLive`, poi `isInCorso`, altrimenti in arrivo, voci senza data comprese), `compareActivityUrgency` (bucket, poi `next_due_date` crescente, senza data in coda).
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` (B) — un solo array `rows` filtrato con `isAdminActivity`, ordinato con `compareActivityUrgency`, mappato in righe; i contatori sono un conteggio per bucket su quell'array, la lista è lo stesso array eventualmente filtrato per bucket. Sparito l'`.order` SQL (l'ordine è per urgenza, non per sola data). `.in('status', [scaduta, in_corso, in_attesa])` sostituito dall'equivalente `.neq('status','completata')`. Parametri URL e etichette dei contatori: `?filter=in_ritardo|in_corso|in_arrivo`, "In ritardo / In corso / In arrivo". Nuovo empty state per filtro attivo con bucket vuoto ("Nessuna attività in ritardo." ecc.). Colonna scadenza calcolata dal bucket: "scaduta il …", "presa in carico · scaduta il …", oppure `formatRelativeDue` per il futuro.
- `src/app/(dashboard)/admin/manutenzioni/ManutenzioniTable.tsx` (B) — `ManutenzioneRow` sostituito da `ActivityRow` senza campo `status`: l'unico stato è `bucket`, da cui derivano badge (`BUCKET_BADGE`), colore della scadenza (`BUCKET_DUE_CLASS`) e presenza di "Prendi in carico" (solo `in_ritardo`). Colonne: Residenza (prima, in enfasi), Voce, Tipo, Stato, Scadenza, Azione.
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` (C, `fe2a58b`) — `effectiveStatus` da `resolveLiveStatus(liveItem, today)` invece di `overdueNow ? 'scaduta' : item.status`; il nome della residenza è un `Link` a `/admin/residences/[residence_id]`.

**In working tree, NON committato (D)**
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — `Stat` riceve `tone: 'overdue' | 'inprogress' | 'neutral'` e prende le classi dalla mappa `STAT_TONES`; attivo = sfondo pieno della tinta (rosso, ambra, brand-dark per la neutra) con testo bianco, senza ring. Aggiunto il focus ring standard ai tre `Link` dei contatori, che prima non avevano stile di focus.

### Letti (rilevanti per il contesto)
- `src/lib/maintenance-status.ts` — helper live preesistenti: `isCountable`, `isOverdueLive` (guardia promemoria a riga 88), `isInCorso`, `resolveLiveStatus`, `formatRelativeDue`. Il nuovo blocco si appoggia a questi.
- `supabase/migrations/002_rls.sql` righe 278-284 — policy SELECT su `maintenance_items`: lo scoping per residenze assegnate della pagina Attività è tutto della RLS via `czero_can_access_residence`, nessun filtro applicativo.
- `supabase/migrations/003_m2.sql` righe 10-32 — trigger `on_completion_inserted`: dopo un completamento riporta `status` a `in_attesa` con la nuova data. Prova che un item non resta mai `completata`, quindi `resolveLiveStatus` copre tutti i casi reali del dettaglio (C).
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` righe 60-79 e `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` righe 141-142, 278-330 — superfici gemelle per confronto dei predicati (stesso helper `isOverdueLive`, scope diverso) e per lo stile dei contatori attivi (lì un ring tinta; D fa diversamente su richiesta di Filippo).
- `src/app/(dashboard)/admin/residences/page.tsx` righe 96-110 — stile dell'header serif copiato in A.
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — `takeChargeN3` e `completeN3`, invariati; letti per confermare cosa scrive `completeN3` sull'item (nulla: lo fa il trigger).

## Decisioni chiave

- **Un array, una partizione**: contatori e lista non usano due predicati "uguali" ma lo stesso array `rows`, partizionato da `activityBucket`. Alternativa scartata: tre filtri separati (`scadute`, `inCorso`, `upcoming`) più una lista costruita da quelli, come prima. Era coerente oggi ma restava coerente solo per disciplina, non per costruzione.

- **La riga non ha uno `status`**: `ActivityRow` porta solo `bucket`. Prima `toRow` calcolava `overdueNow ? 'scaduta' : item.status`, leggendo il campo DB nel ramo non scaduto: un item con `status='scaduta'` stantio dal cron ma data spostata nel futuro finiva contato in "Pianificate" con badge "Scaduta". Con il bucket come unico stato la divergenza è irrappresentabile. Lo stesso pattern nel dettaglio è stato sostituito in C con `resolveLiveStatus`.

- **Promemoria escluse per costruzione, non per filtro di pagina**: `isAdminActivity` richiede modalità amministratore, e sta nell'helper, non nella pagina. Nessun bucket può contenere una promemoria qualunque cosa dica `status`. Nota di dominio: le voci "Amministratore · Consiglio" (muri esterni, catalogo v2 righe 88-89) sono modalità amministratore, non promemoria, quindi in Attività scadono. È coerente col modello, ma è il punto aperto del catalogo (riga 106).

- **Nessuna finestra per "in arrivo"**: decisione di Filippo. "In arrivo" è tutto il futuro, voci senza data in coda. Il criterio è che il contatore coincida sempre con la lista; una finestra a 60 giorni avrebbe reso il contatore un sottoinsieme.

- **La riga resta sul dettaglio `/admin/manutenzioni/[id]`**: decisione di Filippo. È l'unica superficie dove l'admin agisce (presa in carico, completamento); la pagina manutenzioni della residenza non ha ancore per voce. Il "ritorno dentro la residenza" è il link sul nome della residenza nel dettaglio (C), non la destinazione della riga.

- **Etichette e parametri URL rinominati sui bucket**: "In ritardo / In corso / In arrivo" e `?filter=in_ritardo|in_corso|in_arrivo` al posto di "Scadute / In corso / Pianificate". Nessun link nel prodotto usava i vecchi parametri (verificato con grep). Filippo ha visto e non ha obiettato, ma non è stata una scelta esplicita sua.

- **Card neutra attiva in brand-dark**: in D la card "In arrivo" attiva usa il verde brand-dark perché in palette non esiste un grigio pieno e il verde è già il colore di selezione (sidebar). Da confermare a vista.

- **Tono come tipo chiuso**: `Stat` prende `tone` fra tre valori e legge una mappa, invece di due stringhe di classi libere dal chiamante. Stessa logica delle prop di gating obbligatorie dell'handoff precedente: le combinazioni possibili sono enumerate.

## Stato attuale

### Funziona
Verificato da Filippo con l'account admin (`filippoloro02`):
- A: titolo "Attività", nessuna card residenze, nessun blocco costruttore, contatori e tabella invariati, filtri da URL funzionanti.
- B: contatore 25 coincide con le righe; filtri con bucket vuoto mostrano il testo; ordine corretto; dettaglio raggiungibile dalla riga; colonna scadenza con "tra X · data" per le voci future.
- C: badge del dettaglio coerente con la riga; nome residenza cliccabile verso la pagina della residenza.

### Non funziona / da verificare
- **D non è verificato**: in working tree con `tsc` verde. Da guardare: card che si riempie del suo colore senza bordo al click, testi leggibili, secondo click la riporta chiara, ring di focus solo con Tab.
- **Casi "in ritardo" e "in corso" di B e C non verificati**: nella demo attuale nessuna voce amministratore è scaduta, quindi non si è visto: badge rosso/ambra in lista, "scaduta il …" e "presa in carico · scaduta il …", pulsante "Prendi in carico" solo sulle righe in ritardo e riga che scende in In corso dopo il click, blocco azioni nel dettaglio. Filippo li verifica dopo aver popolato lo scenario demo.
- Nessuna migrazione applicata in questa sessione. Il DB è quello di partenza.
- Limite implicito multi-residenza: nessun `.limit` né paginazione sulla query di Attività; il max-rows PostgREST di Supabase (1000 righe) troncherebbe in silenzio oltre circa 100 residenze. Non è un problema oggi, va tenuto a mente.
- `[id]/page.tsx` ha ancora un ramo `profile.role === 'super_admin'` (righe ~207-214) irraggiungibile perché la pagina fa `requireRole(['admin'])`. Codice morto, non toccato: fuori scope.

## Prossimi passi
1. Verificare D a vista, poi committarlo da solo con messaggio `attivita amministratore: stato attivo dei contatori con colore pieno invece del contorno`.
2. Popolare lo scenario demo con almeno una voce amministratore scaduta e una presa in carico su due residenze diverse, poi chiudere le verifiche residue di B e C elencate sopra.
3. Decidere se le etichette "In ritardo / In arrivo" vanno bene o si torna a "Scadute / Pianificate" (una riga per etichetta, parametri URL inclusi).
4. Riprendere i punti aperti dell'handoff precedente: residuo informativo delle eccezioni checklist per l'admin, unificazione dell'autorizzazione admin-su-residenza dietro service client in `src/lib/auth.ts`, pagina Impostazioni per l'admin.
5. Valutare se rimuovere il ramo super_admin morto in `admin/manutenzioni/[id]/page.tsx`, in un commit di pulizia separato.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica prima di ogni commit
npx tsc --noEmit

# oppure production
npm run build && npm start
```

## Domande aperte
- La card neutra "In arrivo" attiva in brand-dark è la scelta giusta, o serve un tono neutro pieno da aggiungere alla palette?
- "In ritardo / In corso / In arrivo" come etichette definitive dei contatori, o si preferisce il lessico "Scadute / Pianificate" usato nella pagina manutenzioni della residenza? Oggi le due pagine usano vocabolari diversi per lo stesso concetto.
- Le voci "Amministratore · Consiglio" del catalogo (muri esterni) devono davvero comparire in ritardo nella pagina Attività, o vanno spostate a modalità promemoria? È il punto aperto del catalogo v2 (riga 106), reso più visibile da questa pagina.
- La voce "Attività" in sidebar punta a `/admin/attivita` (demo, badge "test") per il super_admin e a `/admin/manutenzioni` per l'admin: va bene a regime? Ereditata dall'handoff precedente.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice**: Quando un contatore e una lista devono coincidere, non basta che usino lo stesso helper predicato: devono leggere lo stesso array, partizionato una volta sola da una funzione che assegna a ogni voce un bucket e uno solo (es. `activityBucket`). Tre filtri "equivalenti" applicati separatamente restano coerenti solo per disciplina; una partizione unica resta coerente per costruzione.

- **Sezione Regole di codice**: Il tipo di una riga di lista non porta un campo `status` libero: porta il bucket calcolato dal server con l'helper live, e il componente deriva badge, colori e azioni da quello con mappe chiuse (`Record<Bucket, …>`). Un campo `status: MaintenanceStatus` sulla riga permette per tipo la combinazione "contato in un bucket, mostrato con il badge di un altro", che è esattamente la divergenza contatore/lista.

- **Sezione Regole di codice**: Le classi di stile che dipendono da uno stato (attivo/inattivo, tono) si passano come tipo chiuso (`tone: 'overdue' | 'inprogress' | 'neutral'`) risolto da una mappa dentro il componente, mai come stringhe di classi libere dal chiamante. Le combinazioni possibili devono essere enumerate, non infinite.

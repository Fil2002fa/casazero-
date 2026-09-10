# Handoff — Batch FASE 0: cosmetici Documenti/Login/Residenza/Sidebar · 09/09/2026 10:49

## Sommario
Sessione interamente condotta col metodo FASE 0 (diagnosi read-only con subagent dedicati, STOP, approvazione esplicita, poi implementazione un-concern-per-commit). Sette commit indipendenti su superfici diverse: revisione documenti, badge di classificazione, sidebar demo, login Google, ordinamento unità, e chiusura di un refactor rimasto a metà da una sessione precedente. Un ottavo task (allineamento badge colonna Residente, "B1") è stato investigato due volte e chiuso **senza modifiche al codice**: la prima diagnosi si è rivelata contraddittoria ed è stata corretta dall'utente; la seconda, con misura live via estensione Chrome, ha escluso il disallineamento.

## Lavoro completato
- [x] `canReview` in `DocumentiClient.tsx` esteso a `fallita`/`non_classificato` (era limitato a `da_revisionare`/`completata`)
- [x] Badge di `doc_type='altro'` non usa più il trattamento visivo di successo (poi rinominata l'etichetta su richiesta)
- [x] Voce "Attività" nascosta dalla sidebar super_admin per la demo Furlan (reversibile, commentata non cancellata)
- [x] Bottone login Google disabilitato durante il redirect OAuth (`googleLoading`)
- [x] Lista unità nel dettaglio residenza ordinata con criterio naturale (floor, poi label con `numeric: true`), non più puramente alfabetico
- [x] Refactor sospeso `Stat` (color/bg → tone) in `admin/manutenzioni/page.tsx` verificato completo e committato
- [x] Etichetta badge `'altro'` rinominata da "Fuori checklist" a "Nessuna categoria"
- [x] B1 (disallineamento badge colonna Residente) — investigato due volte, chiuso **senza modifiche**: misura live conferma bordo sinistro identico (1359.201px) su 6 righe consecutive, screenshot originale non riproducibile

## File toccati

### Creati
Nessuno (oltre a questo handoff).

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — `canReview` esteso a 4 stati con commento riscritto (righe ~1132-1141); ramo `'completata'` di `classificationBadgeInfo` branch su `doc_type === 'altro'` con badge neutro "Nessuna categoria" (righe ~1093-1102)
- `src/components/AdminSidebar.tsx` — voce "Attività" di `SUPER_ADMIN_ITEMS` commentata, import `Activity` rimosso; `ADMIN_ITEMS` invariato
- `src/app/auth/login/LoginForm.tsx` — nuovo stato `googleLoading`, `disabled` sul bottone Google; `handleMagicLink` invariato
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — `buildUnitSummary` ordina `unitRows` con comparator floor+label naturale prima del `return`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — chiusura refactor pre-esistente: componente `Stat` locale passa da prop `color`/`bg` a `tone: 'overdue'|'inprogress'|'neutral'` con tabella `STAT_TONES`; focus ring aggiunto ai 3 `Link` dei contatori

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — confermato che `confirmClassification` non ha gate server sullo stato di partenza, quindi estendere `canReview` lato client è sufficiente
- `src/lib/document-checklist.ts` — match per uguaglianza `doc.doc_type !== exp.docType`, nessuna riga BASE attende `'altro'` (confermato via query DB da Filippo)
- `src/lib/document-classification.ts` — `DocType` include già `'altro'` come union member, nessun cast necessario
- `src/components/ui/Table.tsx`, `src/components/ui/Badge.tsx` — `PILL_BASE` è condiviso da 3 superfici (Documenti/Badge/attivita demo), non toccato — motivo per cui il fix B1 (poi annullato) sarebbe dovuto restare scoped
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` — vera `<table>` HTML, header e righe generati dagli stessi componenti condivisi, nessuna duplicazione tra vista costruttore/admin
- `src/types/database.ts`, `supabase/migrations/001_schema.sql` — `units` non ha campo ordinale dedicato, solo `floor` (INTEGER nullable) + `label` (TEXT libero)
- `src/app/(dashboard)/admin/residences/new/page.tsx`, `src/lib/formatUnitLabel.ts` — confermato che le label libere sono un caso reale possibile (form senza validazione di formato)
- `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` (`_handleProviderSignIn`) — confermato che `signInWithOAuth` fa `window.location.assign(url)` in modo sincrono subito dopo la costruzione locale dell'URL, nessuna attesa di rete visibile prima del redirect

## Decisioni chiave
- **`canReview` esteso contro l'intento originale documentato**: il commento preesistente escludeva `'fallita'` deliberatamente ("errore tecnico da riclassificare, non da rivedere"). Filippo ha ribaltato la decisione esplicitamente: `'fallita'` è un errore di merito dell'AI, l'unica uscita reale è la revisione umana, non un retry che fallirebbe di nuovo per definizione. Il commento è stato riscritto con la nuova motivazione, non solo il codice.
- **Badge `'altro'` scoped nel solo ramo di rendering**: `DOC_TYPE_LABELS` è condivisa da prompt AI, checklist e select — verificato con grep prima di toccare nulla, poi lasciata intatta. Il fix vive solo dentro `classificationBadgeInfo`.
- **Nessun feature flag inventato per nascondere "Attività"**: il repo non ha alcun pattern di demo-mode/feature-flag. Invece di introdurne uno per un caso d'uso singolo e throwaway (residenza demo Cavaccio), la voce è stata commentata in-place con un commento che spiega motivo e riattivazione — reversibilità banale senza nuova astrazione.
- **Nessun testo di attesa sul bottone Google**: verificato nel sorgente `@supabase/auth-js` che il redirect OAuth è sincrono (nessuna finestra temporale in cui un testo sarebbe visibile) — solo `disabled` per bloccare il doppio click.
- **Ordinamento naturale risolto nell'helper condiviso, non nella query**: `buildUnitSummary` è l'unico punto usato da entrambi i rami di ruolo (invariante "helper condiviso obbligatorio"). Evitato di toccare la query Supabase o lo schema — `floor` resta primo criterio invariato, `localeCompare(..., { numeric: true })` è il secondo, gestisce nativamente il misto label numerate/libere senza escluderle né spingerle in fondo.
- **B1 chiuso senza fix dopo autocorrezione**: la prima diagnosi (analisi statica) proponeva un `min-w` per correggere uno "zigzag orizzontale" attribuendolo alla larghezza variabile del pill — ma quella spiegazione sposta solo il bordo *destro*, non il sinistro, mentre lo zigzag descritto era sul bordo sinistro. Filippo ha colto la contraddizione e ha sospeso il commit. Riaperta con misura live (`getBoundingClientRect` via estensione Chrome connessa in sessione): bordo sinistro identico a 1359.201px su 6 righe miste attivo/in attesa. Nessuna causa reale trovata — probabile artefatto dello screenshot originale, non un bug.

## Stato attuale

### Funziona
- Tutti e 7 i commit passano `npm run verify` individualmente (tsc + lint puliti, unico warning preesistente non correlato in `reconcile-documents/route.ts:12`)
- Ordinamento naturale verificato live sulla Residenza Cavaccio (15 unità, unità numerate + label rinominate libere interfogliate correttamente)
- Sidebar super_admin verificata: "Attività" assente, altre 3 voci invariate (verifica visiva via screenshot durante il lavoro su B1, non un test dedicato)

### Non funziona / da verificare
- Il disallineamento badge B1 segnalato nello screenshot originale non è stato riprodotto live — se ricompare, la causa resta sconosciuta (vedi Domande aperte)
- Nessun test automatico esiste per nessuna di queste superfici (confermato: nessun file `*.test.*`/`*.spec.*`/`__snapshots__` nel repo fuori da `node_modules`)

## Prossimi passi
1. Se il disallineamento B1 ricompare in un nuovo screenshot, chiedere il contesto esatto (browser, zoom, OS, eventuale scaling del monitor) prima di ogni nuova ipotesi — la misura live su Chrome desktop a zoom 100% non lo ha riprodotto
2. Nessun'altra azione nota in sospeso — working tree pulito salvo handoff non tracciati

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Gate pre-commit
npm run verify

# oppure production
npm run build && npm start
```

## Domande aperte
- Lo screenshot originale di B1 va rivisto con chi lo ha scattato: browser/zoom/scaling diversi da quelli usati per la misura live (Chrome, tab standard, nessuno zoom) potrebbero spiegare la discrepanza
- Nessuna migrazione SQL toccata in questa sessione — nessuna domanda aperta lato schema

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** (nuovo punto, dopo l'attuale punto 4 sulle discrepanze di conteggio):
  > **Difetti visivi (CSS/layout): misurare, non dedurre.** Prima di proporre un fix per un disallineamento/zigzag/scarto visivo segnalato da screenshot, se l'estensione Chrome è connessa misurare le coordinate reali (`getBoundingClientRect` o equivalente) sulla pagina live invece di dedurre la causa dalla sola lettura statica del JSX/CSS. Un'ipotesi plausibile dal codice può essere autocontraddittoria (es. attribuire un disallineamento del bordo sinistro alla larghezza variabile di un elemento, che sposta solo il bordo destro) e produrre un fix che cura un sintomo non capito. Se l'estensione non è connessa, dichiararlo esplicitamente e fermarsi prima di ipotizzare.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** (nuovo punto):
  > **Nascondere una voce di UI per una demo senza inventare un feature flag.** Se nel repo non esiste già un pattern di feature-flag/demo-mode, non introdurne uno per un caso d'uso singolo e throwaway: commentare (non cancellare) la voce con un commento che spiega motivo e come riattivare, rimuovendo gli import diventati inutilizzati per non introdurre warning lint. Riservato a elementi genuinamente temporanei (demo, residenza throwaway) — non usare per logica di prodotto permanente.

Ci sono **2 leggi candidate** per CLAUDE.md — vuoi promuoverle?

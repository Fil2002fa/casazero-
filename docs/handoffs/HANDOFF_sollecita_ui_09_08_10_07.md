# Handoff — Sollecita: cablaggio UI · 08/09/2026 10:07

## Sommario
Il blocco Sollecita ha sei commit chiusi (dallo stato live in UnitRow alla server action `sollecitaItem`) e un settimo — il cablaggio dei due pulsanti UI alla server action — **scritto e verificato ma non ancora committato**: resta modificato in working tree. La verifica funzionale in locale ha coperto cinque rami di rifiuto/non-applicabilità; il percorso felice con invio reale resta rinviato alla preview per un limite d'ambiente (login Google del residente).

## Lavoro completato
- [x] Verifica funzionale in locale dei rami di rifiuto della server action (commit 6)
- [x] Riavvio del dev server in una finestra fresca per rendere leggibili le righe `[DEV EMAIL → ...]`
- [x] Cancellata `src/app/api/dev-sollecita/route.ts` (route usa-e-getta, mai stata tracciata)
- [x] Zona attenzione (`ManutenzioniClient.tsx`) e `UnitRow` collegati a `sollecitaItem`, non più stub
- [x] Helper condivisi `sollecitaVisible` (gate di visibilità) e `sollecitoToast` (mapping esito→toast), unica fonte per le due superfici
- [x] Gating di ruolo: l'admin non vede più il pulsante sugli item `completion_mode: 'amministratore'`
- [x] `npm run verify` pulito (tsc + lint, warning preesistente non toccato)
- [ ] **Commit 7 non eseguito** — il diff è stato mostrato e approvato nel messaggio, ma nessun `git commit` è stato lanciato in questa sessione

## File toccati
### Creati
- *(nessuno — `dev-sollecita/route.ts` creato in sessione precedente, cancellato in questa)*

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — i due pulsanti Sollecita (zona attenzione ~riga 570, `UnitRow` ~riga 865) chiamano `sollecitaItem` invece di mostrare un toast/stub ottimistico; aggiunti `sollecitaVisible()` e `sollecitoToast()` a livello di modulo; stato di pending per-item (`Set<string>` in zona attenzione, booleano locale in `UnitRow`) per disabilitare il pulsante durante la chiamata; `canManagePlan` propagato come prop a `UnitRow` per il gating di ruolo. **Non committato.**
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — modificato in working tree da prima dell'apertura di questa sessione (24 inserimenti, 13 rimozioni). Concern separato, non toccato in questa sessione, resta fuori da qualunque commit del blocco Sollecita.

### Cancellati
- `src/app/api/dev-sollecita/route.ts` — route GET usa-e-getta per invocare `sollecitaItem(itemId)` da browser durante la verifica del commit 6. Mai tracciata, va rimossa prima del commit 7 (fatto) e non deve rientrarci.

### Letti (solo quelli rilevanti per il contesto)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts` — firma di `sollecitaItem`, tipo `SollecitoResult`/`SollecitoOutcome`, logica di dedup 24h e di risoluzione destinatari, per costruire il mapping esito→toast senza duplicare la logica lato client
- `src/components/ui/Toast.tsx` — `ToastKind` ha solo `'success' | 'error'` (riga 8): ha vincolato il design del mapping (il colore segna riuscita/non-riuscita, il testo distingue simulato/reale/dedup)
- `src/lib/notifications.ts` — confermato il ramo `simulated` (righe 17-22) e localizzati i template email N1/N2/N3 (righe 62-96) per la sezione debiti

## Decisioni chiave
- **`canManagePlan` riusato come proxy di `role === 'super_admin'`** invece di aggiungere un prop nuovo: è già calcolato esattamente così in `page.tsx:103` e già propagato a `ManutenzioniClient`. Alternativa scartata: un prop `isSuperAdmin` dedicato, più esplicito ma ridondante con un valore che esiste già identico.
- **Nessun kind di toast nuovo**: `Toast.tsx` espone solo success/error. Invece di modificare l'infrastruttura toast (fuori scope), la distinzione simulato/reale/dedup/parziale passa dal testo del messaggio, non dal colore. Alternativa scartata: aggiungere un kind `'info'` a `Toast.tsx`, respinta per tenere il commit su un solo concern.
- **Esito parziale trattato come successo**: se anche un solo destinatario riceve l'email (reale o simulata), il toast è `success` con testo che segnala i mancati. Coerente col vincolo esplicito ricevuto: un esito parziale non è un fallimento.
- **`not_solicitable`/`not_overdue` mappati su toast di errore** pur essendo teoricamente irraggiungibili da UI (il gate `sollecitaVisible` li esclude a monte): trattati come race condition (stato cambiato tra render e click) e non come casi silenziosi, per non nascondere un disallineamento reale tra UI e server.

## Stato attuale
### Funziona
- `npm run verify` pulito (tsc + lint) con il diff del commit 7 applicato
- I cinque rami di rifiuto verificati in locale dalla server action (vedi sotto)
- Dev server attivo in finestra fresca, righe `[DEV EMAIL → ...]` leggibili in console per ogni invio simulato

### Non funziona / da verificare
- **Percorso felice** (invio reale/simulato con destinatario raggiunto) — non verificabile in locale: il login Google del residente non funziona sulla macchina di Filippo, quindi non è possibile popolare un'unità con un account attivo per girare il caso end-to-end. **Rinviato alla preview.**
- **Anti-spam 24h** (dedup sullo stesso item+destinatario) — stessa causa, rinviato alla preview.
- **Caso "item amministratore in ritardo"** — non esiste su Residenza Cavaccio (demo, 15 unità); nessun item `completion_mode: 'amministratore'` scaduto nel dataset attuale. Rinviato alla preview o a un dataset con un caso simile.
- **Login Google del residente rotto in locale** — non diagnosticato in questa sessione. Blocca ogni verifica end-to-end lato residente (non solo Sollecita): **da diagnosticare prima della demo**, altrimenti la PWA residente non è mostrabile a Furlan Costruzioni.

## Verifiche rimaste
- Verificati in locale (commit 6, server action diretta): `not_solicitable` sul promemoria; `not_overdue` su tre item (non ancora scaduto, archiviato, item amministratore da super_admin); `forbidden` sullo stesso item amministratore ma da `filippoloro02` (admin); più `no_recipients` osservato a schermo dalla UI.
- Non verificati, rinviati alla preview: percorso felice con invio reale, anti-spam 24h, caso "item amministratore in ritardo" (assente su Cavaccio).

## Prossimi passi
1. **Committare il commit 7** (diff già mostrato e approvato in sessione): `git add` dei due file toccati — solo `ManutenzioniClient.tsx`, **non** `admin/manutenzioni/page.tsx` — e commit con messaggio su riga singola o `git commit -F`.
2. **Modale di conferma su Sollecita** — sostituire l'invio diretto al click con una conferma che nomina il destinatario dedotto da `completion_mode` dell'item ("il residente di [unità]", "l'amministratore della residenza"), non un generico "sei sicuro?". Deciso esplicitamente di **non** rendere il pulsante Sollecita una CTA primaria: la gerarchia visiva la fa già il bordo/badge rosso della riga in ritardo, non serve rinforzarla sul pulsante.
3. Diagnosticare il login Google rotto in locale per il flusso residente, prima della demo — blocca la verifica del percorso felice e dell'anti-spam 24h di Sollecita, oltre a ogni altra verifica PWA lato residente.
4. Sulla preview: invitare un account reale su un'unità di Cavaccio, girare percorso felice + doppio sollecito ravvicinato (anti-spam) + eventualmente un caso amministratore-in-ritardo se il dataset lo permette.

## Comandi da rilanciare
```powershell
# Avvia il server di sviluppo (finestra separata)
npm run dev

# Gate pre-commit
npm run verify
```

## Domande aperte
- Il commit 7 va fatto con `page.tsx` escluso esplicitamente (`git add` mirato) o Filippo preferisce prima chiudere/scartare anche quel concern separato?
- Il modale di conferma di Sollecita (prossimo passo 2) apre un nuovo blocco di commit o resta dentro "Sollecita" come ottava voce?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti** — candidata, testo proposto:
  > **Esito di un'azione asincrona sempre discriminato, mai un toast ottimistico al click.** Quando un pulsante invoca una server action con più esiti possibili (successo pieno, parziale, simulato, rifiutato, errore), il messaggio mostrato all'utente deriva SEMPRE dalla risposta effettiva della action, mai da una stringa fissa scritta al momento del click. Un esito parziale (alcuni destinatari raggiunti, altri no) non è un fallimento. Il testo grezzo di un errore di provider esterno resta in console, mai in UI.

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti** — candidata, testo proposto:
  > **Cache dei tipi generati (`.next/types/`) può restare stale dopo la cancellazione di una route usa-e-getta.** Se `tsc --noEmit` fallisce con `Cannot find module '.../route.js'` su un file appena cancellato, il problema è l'artefatto di build in `.next/types/app/...`, non il codice sorgente: va cancellato quel percorso specifico (mai l'intera `.next/`), non ripristinato il file.

Due leggi candidate per CLAUDE.md — vuoi promuoverle?

# Handoff — Checklist eccezioni: audit trail, contatore, polish · 28/07/2026 15:37

## Sommario
Sessione di ripresa dopo 4 giorni scoperti (nessun handoff dal 24/07): il working
tree conteneva due lavori sovrapposti — la UI "segna/annulla non applicabile"
(commit 2, già smoke-testata il 25/07 ma mai committata) e una revisione "audit"
a metà (motivazione obbligatoria, tracciabilità marked_by/updated_at) che aveva
cambiato la firma di `setChecklistException` senza aggiornare la UI, con build
rossa. La sessione ha isolato i due strati con `git stash` mirato, chiuso il
commit 2 in isolamento, applicato la migrazione 028 (confermata da Filippo),
completato l'audit trail come commit 3, e chiuso due rifiniture (motivazione
duplicata nel pannello, contatore che ignorava le esclusioni). Chiusa con un
audit tecnico mirato (`/impeccable audit + polish`) sulla feature appena
costruita e la compilazione onesta del footer di verifica della 028.

## Lavoro completato
- [x] Isolato con `git stash push` (path specifici, mai globale) lo strato
      "audit" da `DocumentiClient.tsx`, portato il commit 2 (UI segna/annulla
      non applicabile) verde in isolamento
- [x] Commit e push: `d3e96e1` — UI segna/annulla non applicabile (B4 C5b)
- [x] Preparata la migrazione 028 (colonne `marked_by`/`updated_at`, trigger
      `set_updated_at`, commento sul vincolo) — solo anteprima, applicata da
      Filippo nel SQL Editor
- [x] `git stash pop`, completato l'audit trail in `ChecklistItemRow`: nota
      obbligatoria, rimosso il campo "atteso da" dal form, `markedByNames`
      ri-threadato e usato, riga audit (motivazione poi attribuzione)
- [x] Commit e push: `6b057fc` — motivazione obbligatoria e tracciabilità
      esclusioni checklist (B4 C5b)
- [x] Smoke passato da Filippo
- [x] Commit e push: `7f0a447` — rimossa la motivazione duplicata nel pannello
      info (fix A)
- [x] Commit e push: `4769f75` — contatore per scope esclude le non applicabili
      dal denominatore, aggiunta l'etichetta "N esclusa/e" (fix B)
- [x] `/impeccable audit + polish` sulla feature checklist: score 16/20,
      applicati 2 fix (colore errore, focus ring su 5 elementi) — verificati,
      **non committati**
- [x] Compilato onestamente il footer di verifica della migrazione 028 (dal
      riepilogo dato in chat da Filippo, non dall'output letterale delle query)
- [ ] Verifica visiva richiesta da Filippo dopo il fix B ("Parti comuni" deve
      leggere 3/5 con "2 escluse" a schermo) — non confermata in questa sessione

## File toccati
### Creati
- `supabase/migrations/028_checklist_exception_audit.sql` — colonne
  `marked_by`/`updated_at` su `residence_checklist_exception`, trigger
  `updated_at`, commento sul vincolo NULLS NOT DISTINCT. Applicata sul DB il
  27/07/2026 da Filippo. **File ancora non tracciato da git** (mai `git add`
  in questa sessione).

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` —
  `setChecklistException` ora richiede `note: string` obbligatoria (non più
  `{note, expectedFrom}` opzionali), scrive `marked_by`; `expected_from` non è
  più nel payload di scrittura (committato in `6b057fc`)
- `src/lib/document-checklist.ts` — `ChecklistExpectation` espone `markedBy`/
  `markedAt`, letti da `marked_by`/`updated_at` (committato in `6b057fc`)
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — calcola
  `markedByNames` (id profilo → `full_name`) solo per i marcatori realmente
  presenti tra le eccezioni della residenza (committato in `6b057fc`)
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` —
  toccato in 5 round distinti in questa sessione: UI segna/annulla (`d3e96e1`),
  audit trail (`6b057fc`), dedup motivazione (`7f0a447`), contatore per scope
  (`4769f75`), fix di polish `/impeccable` (**non committati**: colore errore
  `status-inprogress` → `status-overdue`, focus-visible ring su 5 bottoni che
  ne erano privi)

### Letti (rilevanti per il contesto)
- `docs/handoffs/HANDOFF_b4_helper_e_ui_documenti_07_24_11_10.md` — ultimo
  handoff esistente, usato per capire dove si fosse fermata la documentazione
  ufficiale (24/07) rispetto al lavoro reale nel working tree (successivo)
- `.claude/skills/impeccable/reference/{product.md,audit.md,polish.md}` — per
  eseguire l'audit tecnico mirato sulla feature appena costruita

## Decisioni chiave
- **Isolamento a strati via `git stash` su path specifici**: quando due lavori
  si sovrappongono nello stesso file e la build è rossa, `git stash push -m
  "..." -- <path1> <path2> ...` sui soli file del secondo strato (mai stash
  globale) permette di verificare il primo strato in isolamento prima di
  procedere. Alternativa scartata: patchare al volo per far tornare verde,
  che avrebbe mescolato ulteriormente i due concern.
- **Motivazione obbligatoria, "atteso da" rimosso dal form attivo**: la
  revisione "audit" rende `note` obbligatoria in `setChecklistException` e
  smette di scrivere `expected_from`. Il valore legacy di `expected_from`
  resta leggibile in sola lettura nel pannello info (mai riscritto), ma il
  form di "Segna non applicabile" non lo raccoglie più — "escludere un
  documento non significa aspettarlo da qualcuno" (motivazione nel commento
  di `actions.ts`).
- **Contatore per scope: denominatore esclude le non applicabili**
  (emendamento alla decisione precedente "l'eccezione annota un'attesa
  esistente" — vedi Leggi emerse). Alternativa scartata: nascondere le
  escluse dal conteggio senza mostrarle da nessuna parte, che avrebbe permesso
  un contatore-tutto-verde senza traccia, contro il senso dell'audit trail.
- **Footer della migrazione compilato dal riepilogo in chat, non dall'output
  letterale**: Filippo ha confermato in sessione (non incollato) che le 4
  query di verifica danno esito positivo. Il footer lo dichiara esplicitamente
  come riepilogo confermato, non come trascrizione di query eseguite, così chi
  lo legge dopo non lo scambia per un record letterale.
- **Migrazione 028 applicata il 27/07/2026**: colonne `marked_by`/`updated_at`
  presenti e leggibili, trigger creato senza errori, `NOTIFY pgrst` eseguito,
  righe di test del 25/07 su Cavaccio ripulite (tabella a 1 sola riga, altra
  residenza, `not_applicable = false`, inerte).

## Stato attuale
### Funziona
- Ciclo C5b completo e su `main`: commit `d3e96e1`, `6b057fc`, `7f0a447`,
  `4769f75` — tutti con `tsc --noEmit` ed `eslint` verdi prima del commit
- Smoke passato da Filippo dopo il commit `6b057fc` (audit trail)
- Migrazione 028 applicata e confermata sul DB (colonne, trigger, NOTIFY,
  pulizia righe di test)
- Audit tecnico `/impeccable` sulla feature checklist: 16/20 (Good), nessun
  tell da AI slop

### Non funziona / da verificare
- **Verifica visiva del contatore non confermata in questa sessione**:
  Filippo ha chiesto di ricaricare la pagina e controllare che "Parti comuni"
  legga 3/5 con "2 escluse" — passo non eseguito/riportato prima della
  chiusura di questa sessione
- **2 fix di `/impeccable polish` non committati**: colore errore
  (`text-status-overdue` invece di `text-status-inprogress`) e focus-visible
  ring su 5 elementi interattivi in `ChecklistItemRow` — verdi (`tsc`/`eslint`),
  diff mostrato, in attesa di decisione sul commit
- **`supabase/migrations/028_checklist_exception_audit.sql` non tracciato da
  git**: applicata sul DB ma il file non è mai stato aggiunto a nessun commit
- **`aria-live` assente su errore/esito azione** in `ChecklistItemRow`: gap
  segnalato dall'audit, non fixato (richiede una decisione di pattern, non un
  valore meccanico)
- **Componenti hand-rolled invece di `src/components/ui/`**: coerente col
  resto del file (1000+ righe, nessun uso di `ui/`), ma è debito sistemico
  verso il design system v2 — nota, non affrontato
- **Touch target <44px**: debito già noto ed escluso esplicitamente da un
  ciclo precedente (backlog B3), non nuovo

## Prossimi passi
1. Confermare a schermo (Cavaccio, "Parti comuni") che il contatore legga 3/5
   con "2 escluse" — se già verificato da Filippo dopo questa sessione,
   chiudere il ciclo C5b definitivamente
2. Decidere se committare i 2 fix di `/impeccable polish` in
   `DocumentiClient.tsx` (diff già mostrato, verde) o scartarli
3. `git add supabase/migrations/028_checklist_exception_audit.sql` e commit
   dedicato: la migrazione è applicata sul DB ma assente dalla storia git
4. Valutare un `aria-live`/annuncio per errore ed esito di
   `setChecklistException`/`clearChecklistException` (P2 aperto dall'audit)
5. Pass dedicato target touch 44px sull'intera pagina documenti (P3, backlog
   B3 ereditato)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Il file della migrazione 028 va committato subito (singolo commit) o
  insieme al prossimo lavoro sulla stessa area?
- I 2 fix di `/impeccable polish` vanno in un commit dedicato o assorbiti nel
  prossimo commit utile su questo file?
- Va aperto un task esplicito per la migrazione della pagina documenti ai
  componenti condivisi `ui/`, o resta una nota sparsa fino a quando qualcuno
  la riprende?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** —
  aggiungere:
  `Comandi PowerShell che accettano -Path su un percorso letterale contenente parentesi quadre (es. una cartella Next.js [id]) vanno con -LiteralPath: -Path interpreta [id] come wildcard character class e la corrispondenza fallisce silenziosamente, senza errore — sembra un no-op sui file toccati, non un fallimento visibile.`

- **Sezione CLAUDE.md di destinazione: Invarianti (mai violare)** — emendamento
  a una decisione precedente ("l'eccezione annota un'attesa esistente"), da
  sostituire/integrare con:
  `Una voce della checklist di consegna segnata non applicabile è ESCLUSA dal denominatore attivo dei contatori per scope, non solo annotata: il numero mostrato è soddisfatte/(totale − non applicabili). Le non applicabili restano comunque visibili come conteggio separato ("N esclusa/e"), mai nascoste del tutto: un contatore che le facesse sparire senza traccia vanificherebbe il senso dell'audit trail (chi, quando, perché).`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)** —
  candidata aggiuntiva, non tra le tre richieste esplicitamente ma emersa
  dall'audit `/impeccable` di questa sessione:
  `I messaggi di errore nelle superfici admin usano sempre il token status-overdue (rosso), mai status-inprogress (ambra, riservato a "in corso"): un errore colorato come "in corso" comunica la severità sbagliata a chi legge.`

Nota metodologica: il fatto che la migrazione 028 sia applicata (27/07/2026)
è STATO, non LEGGE — è già in "Decisioni chiave" e "Stato attuale" sopra, non
ripetuto qui perché non è una regola valida oltre questa sessione.

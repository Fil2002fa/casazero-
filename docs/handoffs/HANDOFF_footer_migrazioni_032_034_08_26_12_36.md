# Handoff — Footer migrazioni 032 e 034 · 26/08/2026 12:36

## Sommario
Sessione di ripresa dopo quasi un mese scoperto (ultimo handoff 28/07,
ultimi commit applicativi 25/08 senza documentazione di sessione): il primo
passo è stata una panoramica completa dello stato del progetto, poi due
concern sequenziali, entrambi mirati a chiudere il debito dei footer
"ESITO REALE" lasciati vuoti nelle migrazioni del ciclo catalogo
condizionato (030-034). La 034 (RPC di creazione condizionale) è stata
verificata con uno smoke test in transazione con ROLLBACK; la 032
(hardening grants `anon`) era ferma al secondo tentativo fallito (1
istruzione su 18 applicata) ed è stata applicata per intero al terzo
tentativo, eseguendo lo script senza selezione parziale nel SQL Editor.

## Lavoro completato
- [x] Panoramica iniziale: letti tutti gli handoff recenti (per mtime e per
      storia git), le 5 migrazioni 030-034 per intero, `docs/fase0-fase-b-status.md`,
      verificato che nessun file `.env` sia mai finito in git
- [x] Compilato il footer "ESITO REALE" della migrazione 034
      (`czero_create_residence_with_units` a 8 argomenti) con i dati forniti
      da Filippo: firma/permessi (1 overload, `service_role`-only, `SECURITY
      DEFINER` intatto), smoke test ramo A (filtro condizionale attivo) e
      ramo B (retrocompatibilità con `p_features` NULL), non-regressione
      confermata (nessuna residenza `__SMOKE_034__` residua, ROLLBACK ha
      agito)
- [x] Commit e push: `660e218` — "compila esito reale footer migrazione 034"
- [x] Compilato il footer della migrazione 032 (hardening grants `anon`):
      aggiunto TENTATIVO 3 al registro (applicata per intero il 26/08,
      causa dei fallimenti 1-2 confermata: selezione parziale nel SQL
      Editor), sostituito integralmente il blocco ESITO REALE (era "resta
      VUOTO"), aggiunta CONCLUSIONE in coda
- [x] Corretta la riga residua nella sezione "VERIFICA POST-APPLY" della 032
      (riga 111) che diceva ancora "footer ESITO REALE, che resta vuoto:
      Claude non applica DDL" — ora riflette lo stato compilato
- [x] Commit e push: `a989ad5` — "compila esito reale footer migrazione 032"
- [x] Verificato working tree pulito a fine sessione (il commit `9e5051a`
      "ignora i file env" su `.gitignore` è stato fatto direttamente da
      Filippo fuori da questa sessione, non da Claude)

## File toccati
### Creati
- Nessuno (solo edit di footer in file esistenti)

### Modificati
- `supabase/migrations/034_rpc_creazione_condizionale.sql` — sostituito il
  placeholder "da compilare da Filippo dopo l'apply" nel blocco ESITO REALE
  (righe finali) con l'esito reale riportato da Filippo: auto-verifica in
  coda, smoke test A/B, non-regressione. Nessuna riga di SQL eseguibile
  toccata (commit `660e218`)
- `supabase/migrations/032_grants_hardening_anon.sql` — aggiunto TENTATIVO
  3 al registro tentativi, riscritto il blocco ESITO REALE (era vuoto/falso
  dal 01/08), aggiunta CONCLUSIONE, corretta la riga 111 della sezione
  VERIFICA POST-APPLY. Nessuna riga di SQL eseguibile toccata (commit
  `a989ad5`)

### Letti (rilevanti per il contesto)
- Tutti gli handoff in `docs/handoffs/` (elenco per nome e per mtime) — per
  ricostruire la cronologia dell'ultimo mese e capire dove si fosse fermata
  la documentazione ufficiale rispetto ai commit reali
- `supabase/migrations/030_residence_features_condition_key.sql`,
  `031_grants_hardening.sql`, `032_grants_hardening_anon.sql`,
  `033_seed_voci_catalogo_condizionate.sql`,
  `034_rpc_creazione_condizionale.sql` — lette per intero, per capire il
  modello di condizionalità del catalogo e lo stato reale del DB prima di
  qualsiasi modifica ai footer
- `docs/fase0-fase-b-status.md` — per i rischi aperti della Fase B
  (Pilastro Consegna) e il loro stato

## Decisioni chiave
- **Un footer per commit, mai un commit cumulativo su più migrazioni**:
  034 e 032 sono stati due commit separati anche se entrambi "solo footer",
  perché toccano due concern distinti (verifica RPC condizionale vs.
  hardening grants anon) applicati in sessioni DB diverse. Coerente con la
  regola "un concern per commit" di CLAUDE.md.
- **Causa dei fallimenti 032 tentativo 1 e 2 confermata come selezione
  parziale nel SQL Editor**: il file stesso lo ipotizzava dal tentativo 2
  ("COSA FARE: NON selezionare nulla"); il tentativo 3, eseguito
  deselezionando tutto prima del Run, ha prodotto per la prima volta output
  dall'auto-verifica in coda (assente nei tentativi 1 e 2) — conferma diretta,
  non più solo ipotesi.
- **Nessun dato trascritto senza fonte esplicita**: in entrambi i footer, i
  numeri riportati sono testualmente quelli forniti da Filippo in chat
  (eseguiti nel SQL Editor il 26/08/2026), mai inventati o dedotti. Dove un
  numero derivava da un confronto interno al file (es. `attesi_incondizionati`
  in 034), è stato segnalato esplicitamente come trascrizione del dato
  fornito, non come verifica indipendente di Claude.

## Stato attuale
### Funziona
- Migrazione 030 (modello EAV `residence_features` + `condition_key`) —
  applicata e verificata dal 28/07, footer completo
- Migrazione 031 (hardening grants `authenticated`) — applicata e
  verificata dal 28/07, footer completo
- **Migrazione 032 (hardening grants `anon`) — applicata per intero il
  26/08/2026 al terzo tentativo, footer ora completo**: 0 residui
  TRUNCATE/TRIGGER/REFERENCES per `anon` su tutte le 17 tabelle public
  (erano 51 dopo il tentativo 1, 48 dopo il tentativo 2), default privileges
  corretti (`anon` da `arwdDxtm` ad `arwdm`)
- Migrazione 033 (seed 16 voci catalogo P1-P16 + condition_key su 5
  condizionali preesistenti) — applicata e verificata dal 01/08, footer
  completo, impatto zero sulle residenze esistenti (`is_active=false`)
- **Migrazione 034 (RPC `czero_create_residence_with_units` a 8 argomenti
  con filtro condizionale) — footer ora completo**: smoke test in
  transazione con ROLLBACK conferma sia il ramo filtro attivo sia il ramo
  di retrocompatibilità (`p_features` NULL), nessuna residenza esistente
  toccata
- Working tree pulito, in sync con `origin/main`, nessun file `.env`
  tracciato

### Non funziona / da verificare
- **Nessun codice applicativo usa ancora il modello di condizionalità**:
  zero riferimenti a `residence_features`, `condition_key`, `is_conditional`
  o `p_features` in `src/` — il DB è pronto (030-034 tutte applicate e
  verificate), ma wizard, RPC caller (`actions.ts`) e pipeline AI B5 non lo
  sanno ancora
- **`WIZARD_CATEGORIES`** (`src/app/(dashboard)/admin/residences/new/page.tsx:8`)
  non contiene le 4 categorie nuove (Ascensore, Antincendio, Idrico,
  Accessi) — prerequisito esplicito prima di accendere le 16 voci spente,
  altrimenti non ricevono mai una data di ultima esecuzione personalizzata
  (la RPC fa `COALESCE` su `p_delivery_date`)
- **Commit 035 previsto e non ancora fatto**: le 19 `feature_key` come union
  type TS, fonte di verità unica per wizard e pipeline AI B5 — chiude il
  rischio del typo silenzioso già documentato nel debito aperto della 034
  (`'ascensre'` scrive una riga valida che non combacia con nessun
  `condition_key`, la voce sparisce dal piano senza errore)
- Verifica visiva mai confermata dall'handoff del 28/07: contatore "Parti
  comuni" deve leggere 3/5 con "2 escluse" nella pagina documenti — non
  riverificato in questa sessione (fuori scope, non toccato)
- Debiti noti e invariati da `docs/fase0-fase-b-status.md`: limite body
  5mb vs 50MB dichiarati, `maintenance_items.template_id NOT NULL` blocca
  B5, enum `document_category` a 5 valori fissi, dual-write `priority`

## Prossimi passi
1. **Commit 035** (lato TS): definire le 19 `feature_key` come union type,
   unica fonte di verità condivisa da wizard e pipeline AI B5 — chiude il
   debito del vocabolario non vincolato lasciato esplicitamente aperto
   dalla 034
2. Aggiungere le 4 categorie nuove (Ascensore, Antincendio, Idrico, Accessi)
   a `WIZARD_CATEGORIES` — prerequisito bloccante prima di accendere
   qualunque delle 16 voci spente
3. Costruire il wizard UI per dichiarare le dotazioni (`p_features`) in
   creazione residenza, che è il chiamante reale di `czero_create_residence_with_units`
   (oggi in `src/app/(dashboard)/admin/residences/new/actions.ts:45`, ancora
   a 7 parametri — il ramo NULL/retrocompatibilità della 034)
4. Valutare se il commit 035 va per prima o dopo il wizard: il tipo TS è
   prerequisito logico per evitare che il wizard stesso introduca typo nel
   vocabolario
5. Riprendere i fili aperti dell'handoff del 28/07 non ancora chiusi:
   verifica visiva contatore "Parti comuni" 3/5 con "2 escluse",
   `aria-live` su esito azioni checklist (P2), pass touch target 44px (P3)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Il commit 035 (union type `feature_key`) va fatto come ciclo isolato
  lato TS puro, o insieme al primo pezzo di wizard UI che lo consuma?
- Il ciclo separato di sicurezza ipotizzato nell'appendice della 032
  (rimozione di SELECT/INSERT/UPDATE/DELETE per `anon` dove nessuna policy
  RLS li usa) va aperto ora che TRUNCATE/TRIGGER/REFERENCES sono chiusi per
  entrambi i ruoli, o resta backlog fino a una sessione dedicata a
  sicurezza?
- La query di verifica "item condizionali per residenza esistente
  (invariati)" della 034 (sezione VERIFICA POST-APPLY, punto 1) è stata
  eseguita da Filippo come confronto qualitativo ("identici riga per riga")
  ma non è stato incollato l'output letterale in questa sessione — va bene
  così o serve un output verbatim per il fascicolo del progetto?

## Leggi emerse (candidate per CLAUDE.md)

Nessuna. Questa sessione ha applicato la metodologia esistente (footer
"ESITO REALE" compilato solo da dati forniti da Filippo, mai da Claude;
"solo anteprima" per DDL; un concern per commit) senza scoprire nuove
classi di bug o convenzioni non già scritte. La causa dei due tentativi
falliti della 032 (selezione parziale nel SQL Editor) era già stata
diagnosticata e documentata nel file stesso alla sessione precedente — qui
solo confermata, non è una legge nuova.

# Handoff — B2 doppio flusso creazione residenza · 21/07/2026 01:47

## Sommario
Sessione in due tempi: FASE 0 diagnosi read-only del doppio flusso creazione residenza (wizard → documenti), poi implementazione approvata da Filippo in 2 commit funzionali (redirect con onboarding opzionale; mitigazione back-button/bfcache), ciascuno seguito da un commit di polish emerso da `/impeccable audit`. B2 si chiude in questa sessione con 4 commit totali, tutti verificati con `npx tsc --noEmit` e approvati da smoke manuale.

## Lavoro completato
- [x] FASE 0 diagnosi read-only (wizard oggi, nodo del tempo RPC/policy 022, riuso B1, rischi) — presentata e approvata prima di scrivere codice
- [x] Pre-check 2a chiuso a runtime via MCP Supabase (`execute_sql`, sola lettura): isolata la clausola `EXISTS` condivisa da entrambi i rami della policy INSERT di `022_storage_documents_scoped_rls.sql` — con un UUID casuale inesistente `EXISTS` → `false`, con l'id di una residenza reale → `true`. Conferma a runtime, non solo testuale, che la policy nega l'INSERT per una residenza inesistente
- [x] Commit 1 (`341277a`): redirect di successo del wizard da `/admin/residences/${id}` a `/admin/residences/${id}/documenti?onboarding=1` + banner informativo (mai un gate) nella pagina documenti
- [x] Commit polish (`532268b`): colore del link "Salta per ora" corretto da `text-brand-dark` a `text-brand-medium` (ruolo "link secondari" documentato in DESIGN.md)
- [x] Commit 2 (`c7efc26`): mitigazione back-button/bfcache sul wizard — listener `pageshow`/`event.persisted` che azzera form e stato dopo un vero tentativo di submit
- [x] Commit polish (`7cc22d5`): banner di reset spostato da `semantic-blue`/`semantic-blue-bg` (riservati per costruzione a componenti legacy diversi) a `bg-brand-light`/`text-brand-dark`; `resetNotice` ora si azzera a ogni nuovo tentativo di submit, coerente con `error`/`listError`
- [x] `/impeccable audit` + `/impeccable polish` eseguiti dopo ciascun commit funzionale
- [x] Smoke manuale di Filippo su entrambi i commit: nessuna duplicazione di residenza dopo back del browser; Test B (mai premuto "Crea residenza") senza falsi positivi — `submitAttemptedRef` non scatta il reset a torto

## File toccati
### Modificati
- `src/app/(dashboard)/admin/residences/new/actions.ts` — redirect di successo cambiato da `/admin/residences/${id}` a `/admin/residences/${id}/documenti?onboarding=1`; `revalidatePath('/admin/residences')` invariato
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — legge `searchParams.onboarding`; se `=== '1'` mostra un banner informativo (`bg-brand-light`/`text-brand-dark`, stesso pattern di "Tutto in ordine") con link "Salta per ora" verso la scheda residenza. Nessun gate: pagina identica senza il param
- `src/app/(dashboard)/admin/residences/new/page.tsx` — aggiunto `submitAttemptedRef` (si arma solo al vero avvio di `createResidence`, non ai passaggi tra step) e un listener `pageshow` che, solo se `event.persisted && submitAttemptedRef.current`, azzera `form.reset()` + tutto lo stato React (step, unità, errori, generatore, modali) e mostra un banner (`resetNotice`, `bg-brand-light`) spiegando perché il form è vuoto; `resetNotice` si azzera a ogni nuovo submit

### Letti (rilevanti per il contesto)
- `docs/handoffs/HANDOFF_chiusura_b1_07_21_00_07.md` — stato B1 chiuso, `DocumentiClient`/`createUploadUrl`/`confirmDocument` come infrastruttura da riusare
- `docs/fase0-fase-b-status.md` — rischi aperti B1-B6
- `supabase/migrations/022_storage_documents_scoped_rls.sql` — verifica testuale poi runtime della policy INSERT scoped-residenza
- `supabase/migrations/012_create_residence_atomic.sql` — confermato che `czero_create_residence_with_units` ritorna solo `residenceId` (non gli ID delle unità create), transazione singola committata prima che la RPC ritorni
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `createUploadUrl`/`confirmDocument`, non toccate, confermato che prendono `residenceId` come parametro esplicito (riusabili senza spostarle)
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — non toccata, verificato l'accoppiamento a props (`residenceId`/`docs`/`units` con ID reali, non ricostruibili dalla sola risposta della RPC)
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — confermata la porta "Documenti" già presente per ogni residenza esistente, indipendente da `docCount`
- `src/lib/auth.ts` — `requireRole`
- `src/components/ui/Button.tsx`, DESIGN.md (via `context.mjs`) — ruoli colore per il polish (link secondari = `brand-medium`; `semantic-*`/`status-reminder` riservati a componenti nominati)

## Decisioni chiave
- **Redirect a `/documenti?onboarding=1` invece di uno step interno al wizard**: la RPC non restituisce gli ID delle unità create, quindi uno step "Documenti" dentro `/new` avrebbe richiesto una query aggiuntiva o avrebbe perso il contesto a un refresh (nessun URL da cui recuperare `residenceId`). Il redirect riusa `DocumentiClient` verbatim, è refresh-safe e deep-linkable per costruzione.
- **`pageshow`/`event.persisted` invece di un flag di stato**: è l'unico segnale esplicito e cross-browser per "pagina ripristinata dal bfcache". Un flag che sopravvive per il solo fatto che il bfcache congela l'intero heap JS funzionerebbe per caso, non perché lo intercettiamo — più fragile da verificare come comportamento intenzionale.
- **`submitAttemptedRef` armato solo al vero avvio della RPC**: distingue un tentativo di creazione reale da un semplice passaggio tra step 1/2, per non azzerare la compilazione di chi torna indietro senza aver mai premuto "Crea residenza".
- **Nessuna idempotency key lato RPC/DB**: vincolo esplicito del prompt di implementazione — la mitigazione resta interamente client-side, coerente con "nessuna migrazione prevista in B2".
- **Banner reset su `bg-brand-light` non `semantic-blue`**: DESIGN.md riserva `semantic-*` ai soli componenti legacy nominati e `status-reminder` esclusivamente a `PromemoriaBadge` — un banner nuovo generico non può usare nessuno dei due. `brand-light`/`brand-dark` è il pattern già stabilito per messaggi informativi non di errore ("Tutto in ordine").

## Stato attuale
### Funziona
- B2 chiuso: 4 commit (`341277a`, `532268b`, `c7efc26`, `7cc22d5`), `npx tsc --noEmit` verde su ciascuno, working tree pulito
- Pre-check 2a chiuso a runtime (vedi sopra)
- Smoke di Filippo: nessuna duplicazione di residenza dopo back del browser; nessun falso positivo del reset per chi non ha mai submittato
- `DocumentiClient`, `createUploadUrl`, `confirmDocument`: non toccate, riuso verbatim confermato

### Non funziona / da verificare
- **Banner di reset non osservato nel Test A di Filippo** — nota esplicita di Filippo: probabile mancato ingaggio del bfcache nell'ambiente di sviluppo (`npm run dev`/localhost spesso non idoneo al bfcache). Non blocca: nessuna duplicazione si è comunque verificata in quel test, ma significa che il ramo `pageshow`+`persisted` della mitigazione **non è stato esercitato visivamente** in questa sessione — solo il codice e la logica di guardia (`submitAttemptedRef`) sono stati verificati. Da confermare in un ambiente più vicino a produzione (`npm run build && npm start`, o un deploy preview) prima di considerare la mitigazione verificata end-to-end.
- Backlog pre-esistente da B1, invariato (non riaperto qui): `src/app/(app)/documenti/actions.ts:35` ha ancora `52428800` hardcoded invece di `MAX_DOCUMENT_SIZE` da `src/lib/document-upload.ts`, nessun controllo MIME lato server nella PWA

## Prossimi passi
1. Confermare visivamente il reset da bfcache in un ambiente dove il bfcache è più affidabilmente attivo (build di produzione o deploy preview), per chiudere la verifica lasciata aperta in dev
2. Micro-commit separato ancora in sospeso da B1: migrare `(app)/documenti/actions.ts` a `MAX_DOCUMENT_SIZE`/`ALLOWED_DOCUMENT_MIME` + controllo MIME lato server, oggi assente nella PWA
3. Decidere la prossima milestone (B3 wiring classificazione AI sulle colonne inerti di `documents`, o altro punto aperto in `docs/fase0-fase-b-status.md`)
4. Pulizia facoltativa autorizzata da Filippo, non ancora eseguita in questa sessione: residenze di test ("test freccia", "Test bfcache", "test documenti") — dev, eliminabili quando comodo

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (utile per il punto 1 sopra: verificare il bfcache reale)
npm run build && npm start
```

## Domande aperte
- Il redirect wizard→documenti è ora il comportamento permanente per ogni creazione, incluse le residenze senza intenzione di caricare documenti subito: nessun segnale che questo infastidisca il flusso reale, ma va osservato nell'uso quotidiano se il tap extra su "Salta per ora" sia percepito come attrito
- Se in un ambiente dove il bfcache è confermato attivo la mitigazione risultasse comunque inaffidabile (es. header cache-control del framework che disabilitano il bfcache per questa route, rendendo il punto 1 sopra non verificabile mai), l'unica vera protezione contro la duplicazione resterebbe il caso limite già chiuso — nessuna idempotency key, per scelta esplicita fuori scope B2. Da tenere presente se il problema si ripresentasse in produzione.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti (bug class note)**:
  `Redirect server-side (redirect() dentro una server action) e bfcache: quando un redirect chiude un flusso, il client non riceve mai un callback di successo su cui agire prima della navigazione (redirect() lancia lato server). Per proteggere un form da un ri-submit involontario se il browser lo ripristina dalla bfcache dopo un successo (form ancora compilato, pulsante non più disabilitato), usare un listener pageshow con controllo event.persisted, armato solo dopo un vero tentativo di submit — mai un flag di stato che sopravvive "per caso" al bfcache senza intercettare esplicitamente l'evento. Nessuna idempotency key lato RPC non sostituisce questa mitigazione client-side se la migrazione è fuori scope.`

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti**:
  `Step multi-fase dopo una RPC atomica di creazione: se un wizard deve continuare dopo un'azione che crea un ID lato server tramite una RPC atomica e quella RPC non restituisce anche gli ID delle entità figlie create nella stessa transazione (es. unità di una residenza), preferire un redirect verso una route esistente scoped sull'ID appena creato (refresh-safe, deep-linkable, fa una query fresca per i figli) piuttosto che aggiungere uno step client-side nella stessa route del wizard, che perderebbe lo stato a un refresh senza un URL da cui recuperarlo.`

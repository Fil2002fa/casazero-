# Handoff — Classificazione documenti (servizio vs documento) e login Google · 08/09/2026 11:42

## Sommario

Sessione FASE 0 → commit su due fronti indipendenti. Primo: la classificazione
AI dei documenti trattava ogni errore (chiave API vuota, rate limit, PDF
illeggibile) come "documento non classificabile", mostrando badge fuorvianti
e perdendo la coda di retry — tre commit distinguono ora l'errore di servizio
da quello sul singolo documento, con un banner di pagina per il primo caso.
Secondo: sospetto bug sul login Google del residente, risultato un falso
allarme (sessione sporca), da cui è emerso un difetto reale e minore —
`handleGoogle` non mostrava errori — corretto con un commit di allineamento
a `handleMagicLink`.

## Lavoro completato
- [x] FASE 0: diagnosi del badge rosso di classificazione e della non
      distinzione servizio/documento in `classify-document/route.ts`
- [x] Commit `f1091d1`: `route.ts` distingue `service_unavailable` (per tipo
      di eccezione SDK) da `document_error`, rollback a `non_classificato`
      invece di `fallita` per il primo caso
- [x] Commit `ac42880`: banner unico di pagina in `DocumentiClient.tsx`
      quando il batch incontra `service_unavailable`, batch interrotto
      invece di continuare a contare fallimenti per documento
- [x] Commit `6a292a6`: `pendingClassification` include anche `'fallita'`
      (rientra in coda), label badge da "Errore, riprova" a "Non
      classificabile, riprova"
- [x] FASE 0 di verifica: accertato che nessun percorso reale rilancia la
      route su un documento già `completata`/`da_revisionare` — difetto
      strutturale (stato precedente non salvato prima di `'in_corso'`)
      documentato come **latente**, nessun commit (non sfruttabile oggi)
- [x] FASE 0: diagnosi login Google residente — chiusa come falso allarme
      (sessione sporca lato browser), nessun bug di autenticazione
- [x] Commit `0218743`: `handleGoogle` in `LoginForm.tsx` mostra ora
      l'errore di `signInWithOAuth`, simmetrico a `handleMagicLink`
- [ ] Verifica funzionale end-to-end del blocco classificazione (chiave
      API vuota → un solo banner, nessun documento in `'fallita'`): a carico
      di Filippo, non ancora confermata in questa sessione

## File toccati

### Creati
- Nessuno (oltre a questo handoff e agli script diagnostici temporanei,
  creati ed eliminati nello scratchpad/root durante la sessione)

### Modificati
- `src/app/api/classify-document/route.ts` — pre-flight su
  `ANTHROPIC_API_KEY` assente/vuota (corto circuito, non unico
  discriminante); nel `catch`, `isServiceUnavailableError()` distingue
  `Anthropic.AuthenticationError` / `RateLimitError` / `APIConnectionError`
  / `InternalServerError` / `APIError` con `status >= 500` (→
  `service_unavailable`, rollback a `non_classificato`) da tutto il resto
  (→ `document_error`, invariato a `fallita`). Risposta JSON porta ora il
  campo `cause`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx`
  — nuovo stato `serviceUnavailable`; `classifyDocuments` si ferma al primo
  `cause === 'service_unavailable'` invece di continuare il batch; banner
  di pagina intera (`bg-neutral-600/7`) quando attivo; `pendingClassification`
  ora filtra `non_classificato | fallita`; label badge `'fallita'`
  aggiornata.
- `src/app/auth/login/LoginForm.tsx` — `handleGoogle` cattura l'`error` di
  `signInWithOAuth` e lo scrive nello stesso stato `message` già usato da
  `handleMagicLink` (stessa forma `{ text, ok: false }`, nessun pattern
  nuovo, nessun messaggio di successo perché il browser naviga via).

### Letti (rilevanti per il contesto)
- `node_modules/@anthropic-ai/sdk/core/error.js`, `client.js`,
  `internal/utils/env.js` — per verificare (non assumere) come l'SDK legge
  `ANTHROPIC_API_KEY` (trim di stringa vuota → `undefined`) ed espone le
  classi di errore (`Anthropic.AuthenticationError` ecc. come proprietà
  statiche sul default export già importato)
- `src/lib/document-classification.ts` — 5 stati reali di
  `classification_status` (`non_classificato · in_corso · completata ·
  da_revisionare · fallita`), fonte unica del type TS
- `src/lib/document-checklist.ts` — conferma che la presenza in checklist
  di consegna dipende esclusivamente da `classification_status='completata'`
  (`da_revisionare` non conta come presente)
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` —
  `confirmClassification` corregge manualmente `doc_type`/`sistema` e forza
  `'completata'`, ma non richiama mai la route AI
- `src/app/auth/callback/route.ts` — `exchangeCodeForSession`, verifica
  `profiles`/`unit_members` prima di assegnare l'home, nessuna creazione
  automatica del profilo (demandata al trigger DB + accettazione invito)
- `src/middleware.ts` — stesso `/auth/login` per residente e admin/
  super_admin, nessuna route di login separata sotto `(dashboard)`
- `src/lib/supabase/client.ts` — `createBrowserClient`, legge
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Decisioni chiave

- **Discriminante per tipo di eccezione, non solo per config mancante**:
  la prima proposta (solo pre-flight sulla chiave) è stata corretta da
  Filippo in FASE 0 — la vera discriminante vive nel `catch`, sul tipo di
  eccezione SDK. Il pre-flight resta come corto circuito (evita anche di
  scrivere `'in_corso'` per un tentativo mai partito), ma non è l'unico
  segnale di "servizio giù".
- **Rollback esplicito a `non_classificato`, mai `'in_corso'` appeso**: un
  documento che entra nel flusso e incontra un errore di servizio deve
  tornare in coda, non restare bloccato a metà.
- **`'fallita'` ridefinito**: dopo i tre commit, questo stato significa
  esclusivamente "questo documento non è classificabile nel merito"
  (contenuto/formato), mai più "il sistema ha avuto un problema" — per
  questo ora rientra in `pendingClassification` ed è stata cambiata la
  label. Colore badge lasciato invariato (neutro) su richiesta esplicita.
- **Banner di pagina intera, non badge per-documento, per la causa
  servizio**: il batch si interrompe al primo `service_unavailable`
  invece di richiamare un servizio già noto down per ogni documento
  restante.
- **Fuori scope deliberato**: componente `<PageBanner>` condiviso nel
  design system — non esiste oggi un pattern riusabile (verificato: solo
  `Badge/BottomSheet/Button/Input/Modal/Table/Toast` in `components/ui/`),
  introdurlo sarebbe un secondo concern estraneo a questo blocco di commit.
- **Fuori scope deliberato**: stato di loading/disabled sul bottone
  "Continua con Google" — manca oggi, ma trattarlo insieme al fix
  dell'errore avrebbe mescolato due concern nello stesso commit.
- **Difetto latente non corretto**: `route.ts` non salva
  `classification_status` prima di scriverci sopra `'in_corso'` (riga
  178); il rollback alla cieca (`non_classificato`/`fallita`)
  distruggerebbe uno stato `completata`/`da_revisionare` preesistente SE
  un chiamante rilanciasse la route su quel documento. Verificato che
  **nessun chiamante reale lo fa oggi** (unico call-site è
  `classifyDocuments`, sempre filtrato su `non_classificato`/`fallita`;
  `ReviewPanel` scrive `'completata'` via `confirmClassification` senza
  mai toccare la route AI) — non implementato per non progettare contro
  un requisito ipotetico, ma documentato per quando servisse.
- **Login Google: falso allarme**: la UI non usa variabili d'ambiente per
  costruire `redirectTo` (deriva da `window.location.origin` a runtime),
  quindi il sospetto iniziale (config/ambiente locale) è stato smontato
  dal codice stesso; la causa reale era una sessione sporca lato browser,
  non riproducibile nel codice.

## Stato attuale

### Funziona
- I 4 commit di sessione (`f1091d1`, `ac42880`, `6a292a6`, `0218743`) sono
  passati singolarmente da `npm run verify` (tsc + lint puliti, solo un
  warning preesistente e non correlato in
  `src/app/api/reconcile-documents/route.ts:12`)
- Login Google confermato funzionante da Filippo dopo pulizia sessione

### Non funziona / da verificare
- Verifica funzionale end-to-end del blocco classificazione (svuotare
  `ANTHROPIC_API_KEY`, lanciare "Classifica documenti", controllare che
  compaia un solo banner e che nessun documento finisca in `'fallita'`):
  dichiarata a carico di Filippo, esito non ancora riportato in sessione
- Documento `048c2295-0c64-4714-a341-bc60e1ddc049` ("Coursera
  EMKMOKPE9U8K") su Residenza Cavaccio resta in stato `'fallita'` —
  lasciato deliberatamente (Filippo ha scelto "niente, lascialo com'è"),
  rientra comunque in coda col commit `6a292a6`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` ha modifiche non
  committate (polish visivo dei contatori `Stat`: da `color`/`bg`
  separati a un sistema `tone`-based con stato attivo pieno) — **non
  toccate in questa sessione**, presenti già all'apertura. Non è chiaro
  se sia lavoro in corso da riprendere o da scartare.

## Prossimi passi
1. Filippo esegue la verifica funzionale del blocco classificazione
   (chiave vuota → un banner, nessun `'fallita'` da errore di servizio) e
   riporta l'esito.
2. Decidere se/quando aggiungere lo stato di loading/disabled al bottone
   "Continua con Google" (commit separato, indipendente da `0218743`).
3. Decidere il destino di `src/app/(dashboard)/admin/manutenzioni/page.tsx`
   (commit, scarto, o ripresa in altra sessione).
4. Se in futuro nasce un chiamante che rilancia la classificazione su un
   documento già `completata`/`da_revisionare`, implementare il
   salvataggio dello stato precedente in `route.ts` prima della riga 178
   e il suo ripristino nei due rami d'errore (vedi difetto latente sopra).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Gate pre-commit (tsc + lint + stato git)
npm run verify
```

## Domande aperte
- Le leggi emerse sotto vanno promosse in CLAUDE.md?
- Il documento "Coursera EMKMOKPE9U8K" va eliminato manualmente (sembra
  materiale di test su una residenza demo) o lasciato per verificare il
  nuovo comportamento di retry dal bottone "Classifica documenti"?
- `manutenzioni/page.tsx`: committare, scartare, o è lavoro di un'altra
  sessione da non toccare?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti** —
  «**Errore di servizio esterno vs errore sul singolo elemento**: quando
  il codice chiama un servizio terzo (AI, email, storage) dentro un loop
  o su un singolo elemento, il `catch` deve distinguere per TIPO di
  eccezione (auth/rate-limit/connessione/5xx = servizio) da un errore sul
  contenuto/formato dell'elemento — mai far confluire entrambi nello
  stesso stato "fallito". Un errore di servizio si comunica con un banner
  di pagina e lo stato dell'elemento torna neutro/riprovabile; un errore
  sul contenuto resta un badge per-elemento. Prima di scrivere il branch,
  verificare con `node -e` o lettura diretta come l'SDK installato espone
  le classi di errore — non assumerlo dal nome usato in altri SDK
  (es. `APIStatusError` di OpenAI non esiste nell'SDK Anthropic, la
  classe è `APIError`).»

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti** —
  «**Stato asincrono: salvare il valore precedente prima di sovrascriverlo
  per iniziare un'operazione.** Se un campo di stato viene impostato a un
  valore transitorio (es. `'in_corso'`) prima di un'operazione asincrona
  che può fallire, il rollback in caso di errore deve ripristinare il
  valore precedente — non un valore fisso — a meno che sia stato
  verificato ed esplicitamente documentato che nessun chiamante reale può
  invocare l'operazione su un elemento già in uno stato "avanzato"
  (es. confermato/rivisto). Se tale garanzia non è verificabile in modo
  duraturo, salvare lo stato precedente è economico e va fatto subito.»

- **Sezione CLAUDE.md di destinazione: Regole di codice ricorrenti** —
  «**Handler gemelli nello stesso componente devono gestire l'esito allo
  stesso modo.** Quando due funzioni nello stesso file wrappano azioni
  simili verso lo stesso tipo di provider (es. due metodi di login,
  due chiamate a un'API esterna), verificare che condividano la gestione
  di successo/errore (stesso stato, stessa forma). Un handler che dimentica
  la gestione errore già presente nel gemello è una classe di bug silenziosa:
  nessuna eccezione, nessun crash, solo "non succede niente" per l'utente.»

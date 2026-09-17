# Handoff — Service worker RSC e rifiniture units · 14/09/2026 15:57

## Sommario
La pagina Unità e inviti, solo su Vercel, dopo ogni azione ricaricava l'intera pagina: l'unità aperta si richiudeva e lo scroll tornava in cima. La FASE 0 ha individuato la causa in `public/sw.js`, che serviva dalla cache i payload RSC di tutta la dashboard; Filippo l'ha confermata in DevTools su produzione. Sono seguiti tre commit per questo bug e altri tre che chiudono punti aperti dell'handoff precedente: trim del token nel flusso invito, finta pillola "Nessun invito" e errori scartati nel bulk.

## Lavoro completato
- [x] FASE 0 read-only (subagent Explore + verifica diretta delle righe) sul reset di stato/scroll della pagina units.
- [x] Punto 0 confermato da Filippo in produzione: `units?_rsc=…` servita "(ServiceWorker)" in 1 ms, seguita da una richiesta document "(ServiceWorker)" da 1,28 s; stesso comportamento su `residences`, `administrators`, `fornitori` e `settings`.
- [x] `54511c1` — sw: le richieste RSC (`_rsc` o header `RSC: 1`) non passano mai dalla cache; `CACHE` passa a `casazero-v3`.
- [x] `1c34209` — units: tolte 5 chiamate `router.refresh()` e `useRouter`; resta `revalidatePath` nelle action.
- [x] `0401ce0` — units: `handleAddUnit` senza `window.location.reload()`.
- [x] `3bce02b` — welcome: token ripulito una volta sola nella landing (query + CTA) e dentro `checkInviteForUser`.
- [x] `c1f1f5c` — units: la nota "Nessun invito — generane uno" diventa testo semplice (niente sfondo, padding, icona).
- [x] `8f0c887` — units: `createBulkInvites` legge `error` sulle due select anti-doppione e si ferma con messaggio tecnico.
- [ ] Test PWA offline su iPhone dopo `54511c1` — non eseguito (sostituito da simulazione, vedi Stato attuale).
- [ ] Test su Vercel che l'unità resti aperta dopo Genera/Revoca/Aggiungi unità — non eseguito.
- [ ] Test nel browser dei commit `3bce02b`, `c1f1f5c`, `8f0c887` — non eseguito.

## File toccati
### Creati
- `docs/handoffs/HANDOFF_sw_rsc_units_09_14_15_57.md` — questo handoff.
- (fuori repo, scratchpad di sessione) `sw-harness.js` — esegue `public/sw.js` in una sandbox Node `vm` con `self`/`caches`/`fetch` finti; 9 casi (offline → `offline.html`, RSC non intercettate, pagine network-first, icone cache-first, `/_next/` escluso). Non è nel repo: se serve come test permanente va ricreato.

### Modificati
- `public/sw.js` — uscita anticipata `if (url.searchParams.has('_rsc') || e.request.headers.get('RSC') === '1') return` prima del ramo navigate; `CACHE = 'casazero-v3'`, così l'`activate` esistente cancella la cache v2 con le voci RSC salvate.
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — rimossi `useRouter` e le chiamate `router.refresh()` in generate/save label/revoke/bulk (commit 2); rimosso `window.location.reload()` in `handleAddUnit` (commit 3); `<div>` con sfondo+icona `UserPlus` → `<p className="self-center text-xs text-text-secondary">` (commit 5).
- `src/app/welcome/[token]/page.tsx` — `const token = (await params).token.trim()` in cima; query e i due CTA `/auth/login?invite=${token}` usano lo stesso valore.
- `src/app/welcome/[token]/accept/accept-invite.ts` — `checkInviteForUser`: `.eq('token', token.trim())`; copre sia `accept/page.tsx` sia `confirmInvite` in `accept/actions.ts`.
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — `createBulkInvites`: destrutturati `existingError` (select `invites`) e `memberError` (select `unit_members`), `console.error` con `residenceId` e ritorno `{ count: 0, skipped: 0, error: 'Errore temporaneo nella verifica …, riprova.' }` prima di qualsiasi insert.
- `CLAUDE.md` — **modificato ma non da questa sessione** (+10 righe già presenti a inizio sessione): non committato, non toccato.

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_sicurezza_flusso_invito_09_14_15_16.md` — handoff precedente; da qui i tre fix della seconda parte (Prossimi passi 4 e 5, rilievo pillola).
- `src/components/PwaInit.tsx` — registra `/sw.js` solo con `NODE_ENV === 'production'`, in dev lo disinstalla (:8-14): spiega "solo su Vercel".
- `src/app/layout.tsx` (:48) — `PwaInit` montato nel root layout, quindi il service worker controlla anche la dashboard.
- `src/app/(dashboard)/layout.tsx` (:22) — lo scroll è su `<main className="flex-1 overflow-auto">`, non sulla finestra.
- `src/app/(dashboard)/admin/residences/[id]/loading.tsx` (:48-51) — skeleton trasmesso durante il ricarico completo.
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` (:37-43, :79-84) — fetch units+members+invites, nessuna `key` su `UnitsManager`.
- `src/app/welcome/[token]/accept/page.tsx`, `accept/actions.ts` — percorso del token dopo la landing.
- `src/app/auth/login/LoginForm.tsx` (:24) — `nextPath = /welcome/${invite}/accept`, il token passa di qui.

## Decisioni chiave
- **Causa corretta nel service worker, non nello stato React**: `expandedUnit` (`UnitsManager.tsx:30`) è già in cima al componente con key stabili, e un soft refresh l'avrebbe conservato. Alternative scartate: stato persistito in URL/sessionStorage (cura il sintomo; `router.replace` genera un'altra GET RSC intercettata), copia locale della lista (due fonti di verità), `useOptimistic` (non evita il ricarico, serve un placeholder senza token).
- **Esclusione RSC con doppio criterio** (`_rsc` o header `RSC: 1`): copre `router.refresh`, `<Link>` e prefetch anche se una delle due firme cambia tra versioni di Next.
- **Bump a `casazero-v3`** invece di pulire la cache per chiave: riusa la pulizia già presente in `activate`, che elimina le voci RSC avvelenate sui dispositivi già installati.
- **`router.refresh()` rimosso e non corretto**: le action chiamano già `revalidatePath` e l'albero aggiornato torna nella risposta della POST, che il service worker non intercetta (`sw.js:20`). Il refresh era una seconda richiesta ridondante.
- **Trim del token in due punti, non in tutti i passaggi**: nella landing, perché query e CTA devono coincidere, e in `checkInviteForUser`, unico punto di controllo per accept/page e confirmInvite. Scartato il trim anche in `accept/page.tsx` e `actions.ts` (il suggerimento dell'handoff precedente): sarebbero copie ridondanti della stessa pulizia.
- **Commit con pathspec e stash temporaneo**: i fix 2 e 3 erano modificati insieme; `actions.ts` è stato messo in stash per dare al fix 2 un `npm run verify` isolato, poi ripristinato senza conflitti.
- **`next build` non eseguito**: sovrascriverebbe `.next` rompendo il dev server; verifica offline sostituita dalla simulazione del service worker.

## Stato attuale
### Funziona
- `npm run verify` verde su tutti e 6 i commit, ognuno con il proprio diff mostrato. Unico warning pre-esistente: `src/app/api/reconcile-documents/route.ts:12`.
- Simulazione Node di `public/sw.js` post-fix: 9/9 PASS (offline `/` e `/manutenzioni` → `offline.html`; v2 eliminata, v3 presente; tre varianti di richiesta RSC non intercettate; pagine network-first; icone cache-first; `/_next/` escluso).
- Git: `main` è **avanti di 3 commit su `origin/main`** (`3bce02b`, `c1f1f5c`, `8f0c887` non pushati). I tre commit del service worker e di units (`54511c1`, `1c34209`, `0401ce0`) risultano già su origin.

### Non funziona / da verificare
- **PWA offline su iPhone dopo `54511c1`: NON verificata su dispositivo.** La simulazione copre il codice del service worker, non Safari/iOS. Il nuovo worker si installa solo dopo un'apertura online.
- **Comportamento su Vercel non ancora osservato**: che l'unità resti aperta e che in Network non ci siano più GET `_rsc` "(ServiceWorker)" né richieste document dopo le azioni.
- **Assunzione non provata a runtime**: la risposta della server action con `revalidatePath` aggiorna la lista senza `router.refresh()`. Se dopo Genera invito l'invito non compare, la causa è questa.
- **Commit `c1f1f5c` non visto nel browser**: la nota è ora `self-center` nella riga `flex gap-2` accanto a Genera invito.
- **Ancora aperti dall'handoff precedente**: causa del "Permessi insufficienti" nel bulk ignota (serve la riga di log `createBulkInvites: …`); `unit_members.ended_at` mai scritto; `used_at` non atomico; `InviteUsedBanner` irraggiungibile; nessun logout in dashboard; onboarding PWA non scritto.
- `LoginForm.tsx:24` interpola `invite` in un path senza `encodeURIComponent`: innocuo con token esadecimali, non verificato per altri formati.

## Prossimi passi
1. `git push` dei commit `3bce02b`, `c1f1f5c`, `8f0c887`, poi attendere il deploy Vercel.
2. iPhone: aprire la PWA online una volta, poi modalità aereo e riaprire → deve comparire `offline.html`. Da Safari su Mac (Sviluppo → dispositivo) verificare che il service worker usi la cache `casazero-v3`.
3. Vercel, DevTools → Application: service worker attivo con cache `casazero-v3`. Poi, con un'unità aperta a metà pagina, Genera invito → unità aperta, invito visibile, scroll invariato, in Network solo la POST. Ripetere con Revoca, rinomina, Aggiungi unità e bulk.
4. Link invito con `%20` in coda (`/welcome/<token>%20`): landing ok → login → conferma → nessun redirect muto a `/`.
5. Rilanciare il bulk su Residenza Cavaccio da pippoloro02 guardando i log server: ora può comparire anche `createBulkInvites: errore lettura inviti esistenti` o `… errore lettura membri unità`.
6. Poi i filoni in sospeso: logout dashboard, onboarding PWA, `used_at` atomico.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (attiva anche il service worker: fermare prima il dev server)
npm run build && npm start

# gate pre-commit
npm run verify
```

## Domande aperte
- Ci sono altri `router.refresh()` o `window.location.reload()` nel resto della dashboard dopo action che chiamano già `revalidatePath`? Non verificato fuori da `UnitsManager.tsx`: stessa classe di ridondanza, ora innocua dopo `54511c1`.
- Il ramo cache-first di `sw.js` risponde ancora con `offline.html` (HTML) a qualunque GET non di navigazione fallita, per esempio un'immagine non in cache. Va ristretto a un elenco esplicito di statici (icone, manifest)?
- Serve un test automatico permanente per `public/sw.js` (l'harness della sessione non è nel repo)?
- Rimuovere `InviteUsedBanner`/`inviteUsed` irraggiungibili in `welcome/[token]/page.tsx` in un commit di pulizia?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"**:

  ```
  - **Il service worker non intercetta mai payload RSC.** `public/sw.js` esce
    subito per richieste con `_rsc` o header `RSC: 1`, oltre a `/_next/`,
    `/api/`, `/auth/`. Un payload RSC servito dalla cache fa ripiegare Next su
    una navigazione completa (stato client perso, scroll in cima) su tutta
    l'app. Il SW si registra solo in produzione (`PwaInit.tsx`): un bug "solo
    su Vercel, in locale no" va prima controllato in DevTools Network cercando
    richieste "(ServiceWorker)". Ogni modifica a cosa il SW mette in cache
    richiede il bump di `CACHE`. Trovata il 14/09 su tutta la dashboard.
  ```

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"**:

  ```
  - **Dopo una server action che chiama `revalidatePath`, nessun refresh
    lato client.** L'albero aggiornato torna già nella risposta della action:
    `router.refresh()` è una seconda richiesta ridondante e
    `window.location.reload()` distrugge lo stato client (sezioni aperte,
    scroll, form). Se una superficie non si aggiorna, si corregge il
    `revalidatePath` nella action, non si aggiunge un refresh nel client.
  ```

- **Sezione CLAUDE.md di destinazione: "Regole di codice ricorrenti (bug class note)"**:

  ```
  - **Ciò che non è cliccabile non ha l'aspetto di un bottone.** Niente
    sfondo, padding a pillola o icona d'azione su testo informativo accanto a
    un bottone reale: due elementi per la stessa azione, uno solo funzionante.
    Le note di stato vuoto sono testo semplice (`text-xs text-text-secondary`).
  ```

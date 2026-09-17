# Handoff — PWA: diagnosi navigazione + fix LCP foto residenza · 16/09/2026 14:25

## Sommario
Sessione iniziata con una FASE 0 di sola diagnosi sulla lentezza percepita nella navigazione tra le sezioni della bottom nav (Home, Documenti, Fascicolo, Manutenzioni, Profilo), da cui è uscito un piano a 4 commit approvato da Filippo ma non ancora scritto. A metà sessione è arrivata una priorità nuova con una misura reale di produzione (LCP 4,66s sulla Home, elemento = foto della residenza), diagnosticata e in parte risolta: la foto ora passa da `next/image` invece di un `<img>` nudo. In coda, un fix minore su un refuso di pluralizzazione nel contatore documenti.

## Lavoro completato
- [x] FASE 0 — diagnosi navigazione bottom nav: 9 riscontri (F1-F9) su doppia chiamata d'autenticazione (middleware + layout), catena sequenziale getUser→profiles→builders nel layout, `/profilo` che bypassa la cache d'auth, l'intero layout `(app)` reso dinamico da `cookies()`, prefetch che porta solo lo skeleton, nessuna cache cross-navigazione (`staleTimes.dynamic=0` di default), query ridondanti/duplicate di membership
- [x] Piano a 4 commit su questa diagnosi **approvato da Filippo** (profilo→cache condivisa, documenti→query condizionale, home→teaser in Suspense, helper membership condiviso) — **non ancora implementato**, vedi "Non funziona / da verificare"
- [x] Verifica approfondita di `staleTimes.dynamic` (Next 15.5.19) leggendo il codice compilato del router: confermato il meccanismo (cache prefetch client-side, in memoria, per tab), confermato il comportamento su redirect di una Server Action (con/senza revalidation). Filippo approva logica e valore (30s) ma pone come gate un test empirico di logout+back che farà lui — **non scritto**, resta un commit 5 in sospeso
- [x] Commit 5 originale del piano navigazione (passare la sessione dal middleware alla pagina via header) **scartato esplicitamente** da Filippo: cambio del modello di fiducia dell'autenticazione, non accettabile a pochi giorni dalla demo
- [x] FASE 0 nuova priorità: diagnosi LCP 4,66s sulla Home (foto residenza) — 6 riscontri (F10-F15): `<img>` nudo senza `next/image`, bucket Storage pubblico senza trasformazione, nessun resize in upload (tetto solo sui byte, 5MB, nessun limite pixel), contenitore reale ~464×144px, infrastruttura `next/image` già pronta (remotePattern Supabase già in `next.config.ts`)
- [x] Commit A: `src/app/(app)/page.tsx` — `<img>` sostituito con `next/image` (`fill`, `sizes`, `priority`) per l'hero della Home
- [x] Commit B (resize all'upload) **rimandato in backlog** su richiesta esplicita di Filippo: non serve per la demo, la foto verrà ricaricata comunque
- [x] Fix minore: contatore documenti mostrava "documentos" (suffisso inglese/spagnolo su parola italiana) invece di passare dall'helper `pluralize` — corretto
- [x] `npm run verify` verde prima di ogni commit (unico warning noto, invariato, su `src/app/api/reconcile-documents/route.ts:12`)
- [x] `git push origin main`: `f383e39..a56fd29`, fast-forward, nessun conflitto

## File toccati
### Modificati
- `src/app/(app)/page.tsx` — `<img src={photoUrl} className="w-full h-full object-cover" />` sostituito con `<Image fill sizes="(min-width: 560px) 464px, calc(100vw - 3rem)" priority className="object-cover" />`, contenitore passato a `relative`. Import di `Image` da `next/image` aggiunto
- `src/app/(app)/documenti/DocumentiList.tsx` — `{visible.length} documento{visible.length !== 1 ? 's' : ''}` sostituito con `{pluralize(visible.length, 'documento', 'documenti')}`, import di `pluralize` da `@/lib/pluralize` aggiunto

### Letti (solo quelli rilevanti per capire il contesto)
- `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/whitelabel.ts`, `src/app/(app)/layout.tsx`, `src/components/BottomNav.tsx` — catena di autenticazione e struttura del layout `(app)`, base della diagnosi F1-F6
- `src/app/(app)/{page,documenti/page,fascicolo/page,manutenzioni/page,profilo/page}.tsx`, `src/lib/supabase/server.ts`, `next.config.ts` — query per sezione, uso di `cookies()`, assenza di config PPR/staleTimes
- `node_modules/next/dist/client/components/router-reducer/{prefetch-cache-utils,reducers/navigate-reducer,reducers/server-action-reducer}.js`, `node_modules/next/dist/server/config-shared.js` — verifica diretta nel codice compilato di Next 15.5.19 del meccanismo `staleTimes` e del comportamento della prefetch cache su redirect di Server Action (logout)
- `src/app/(dashboard)/admin/residences/[id]/{ResidencePhotoUpload.tsx,actions.ts,constants.ts}`, `supabase/migrations/014_residence_photos_bucket.sql` — pipeline di upload/serving della foto residenza, base della diagnosi F10-F15
- `docs/handoffs/HANDOFF_dashboard_responsive_09_15_19_56.md`, `HANDOFF_verifica_push_pwa_09_16_12_06.md` — continuità con la sessione precedente

## Decisioni chiave
- **Ordine di priorità cambiato a metà sessione**: la diagnosi navigazione (round trip di rete/auth) era in corso quando è arrivata una misura reale di produzione (LCP 4,66s) che si è rivelata un problema più grande di quanto stimato per i round trip. Il piano a 4 commit sulla navigazione resta approvato ma è stato sospeso, non abbandonato.
- **Modello di fiducia dell'autenticazione non negoziabile vicino alla demo**: sia il commit "header dal middleware" (piano navigazione) sia qualunque scorciatoia che riduca la verifica JWT sono fuori discussione. La via scelta per la cache (`staleTimes.dynamic`) è deliberatamente quella che NON tocca l'auth.
- **`staleTimes.dynamic=30` approvato in linea di principio, gate empirico**: la lettura del codice compilato di Next non basta a garantire con certezza cosa succede alla prefetch cache lato client dopo un logout (parte della logica è in codice minificato non sorgente). Filippo verificherà lui stesso con un test manuale (login → visita sezioni → logout → back del browser) prima che la riga venga scritta.
- **Commit B (resize upload) rimandato, non scartato**: differenza esplicita rispetto al commit 5 della navigazione (quello è scartato per motivi di sicurezza/fiducia). Qui è solo backlog perché non serve per la demo imminente.
- **`ResidencePhotoUpload.tsx` escluso dai commit A/B**: stessa bug class (`<img>` nudo) ma superficie diversa (dashboard, thumbnail più piccola). Va in un commit a sé se e quando richiesto.

## Stato attuale
### Funziona
- `npm run verify` verde su HEAD `a56fd29`.
- `origin/main` allineato: push `f383e39..a56fd29` confermato (2 commit: foto `next/image`, pluralizzazione documenti).
- Diagnosi documentata con evidenze a riga di codice reale per entrambi i blocchi (navigazione F1-F9, LCP F10-F15).

### Non funziona / da verificare
- **Piano a 4 commit navigazione — approvato ma MAI scritto in questa sessione**: nessun codice toccato per (1) `/profilo` che riusa `getProfile()`/`getUser()` cache-ati invece della chiamata locale, (2) `uploadResidenceId` condizionale a `canUpload` in `documenti/page.tsx`, (3) teaser fascicolo della Home in un confine `<Suspense>`, (4) helper `getMembership()` condiviso in `lib/auth.ts` al posto delle 4 query hand-rolled.
- **Commit 5 navigazione (`staleTimes.dynamic=30`) in sospeso**: valore e logica approvati, ma **non scrivere `next.config.ts`** finché Filippo non conferma l'esito del test di logout+back (nessun contenuto autenticato residuo dopo il redirect a `/auth/login`).
- **Verifica dal vivo del commit A**: Filippo deve ri-misurare l'LCP della Home in produzione con lo stesso strumento che ha dato 4,66s, per confermare il miglioramento reale. Da controllare anche visivamente: nessun layout shift/artefatto con `fill`+`object-cover` a 320px e su viewport larghi.
- **Commit B (resize all'upload) e commit a sé per `ResidencePhotoUpload.tsx`**: backlog, nessun dettaglio di implementazione deciso (limite di lato in pixel da proporre quando torna prioritario).
- **Pendenze pregresse, ancora aperte** (non toccate in questa sessione): `CLAUDE.md` modificato (+10 righe, dalla legge sull'`error` scartato da Supabase) non committato; ora **10 handoff non tracciati** (i 9 precedenti + questo) da committare o scartare.

## Prossimi passi
1. Filippo esegue il test empirico di logout+back per sbloccare o scartare definitivamente il commit 5 (`staleTimes.dynamic=30`).
2. Se la priorità torna sulla navigazione: riprendere il piano a 4 commit nell'ordine già approvato (profilo → documenti → home Suspense → helper membership), ciascuno con verify+diff separato.
3. Filippo ri-misura l'LCP della Home dopo il commit A per confermare il numero reale.
4. Quando torna prioritario: proporre un limite di lato massimo in pixel per il commit B (resize all'upload in `(dashboard)/admin/residences/[id]/actions.ts`), oggi il tetto è solo sui byte (`MAX_PHOTO_BYTES=5MB`).
5. Valutare un commit a sé per `ResidencePhotoUpload.tsx` (stessa bug class `<img>` nudo, superficie dashboard).
6. Chiudere la pendenza pregressa: decidere il destino di `CLAUDE.md` (+10 righe) e dei 10 handoff non tracciati.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (serve per il service worker)
npm run build && npm start

# gate pre-commit
npm run verify

# commit di questa sessione
git log --oneline f383e39..HEAD
```

## Domande aperte
- Il test di logout+back per `staleTimes`: va ripetuto anche su Safari/iOS (dove gira la PWA), o basta il browser desktop di Filippo?
- Se il commit 5 passa il test, la scelta del valore (30s) va documentata come legge in CLAUDE.md o resta solo config silenziosa?
- Il calcolo di `sizes="464px"` nel commit A si basa su `max-w-lg` (32rem) e `p-6` del layout `(app)` attuali: va ricontrollato se un futuro intervento tocca questi valori (finora il lavoro di responsive del 15/09 ha toccato solo `(dashboard)`, non `(app)`).
- Con quale urgenza il piano a 4 commit sulla navigazione va ripreso rispetto ad altri item di backlog vicino alla demo?

## Leggi emerse (candidate per CLAUDE.md)

- **Regole di codice ricorrenti**: `Ogni <img> che carica un asset da Storage/upload utente e può finire above-the-fold va sostituita con next/image (il remotePattern per il bucket Supabase è già in next.config.ts): fill + sizes calcolati sul contenitore reale, priority solo sull'elemento davvero misurato come LCP. Bug class trovata due volte nella stessa sessione con lo stesso eslint-disable-next-line @next/next/no-img-element: hero foto residenza in (app)/page.tsx (corretto) e thumbnail in ResidencePhotoUpload.tsx lato dashboard (non ancora corretto).`

- **Metodo di lavoro**: `Quando la pagina mostra immagini caricate da utente, misurare l'elemento LCP reale (Network/Performance) prima di investire in ottimizzazioni di round-trip/query di rete: un asset non ridimensionato in upload può pesare in secondi più dell'intera catena di autenticazione e query messe insieme. In questa sessione: 4,66s sull'immagine contro una stima di poche centinaia di ms per i round trip diagnosticati in precedenza sulla stessa pagina.`

Ci sono **2 leggi candidate** per CLAUDE.md — vuoi promuoverle?

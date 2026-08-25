# Handoff — Campagna residente: stato live, colonna shell, scala z-index · 14/07/2026 16:40

## Sommario
Quattro FASE 0 consecutive sul profilo residente (shell `(app)`, account `lorofilippo2002`,
Residenza Cavaccio · Unità 1), ciascuna chiusa con un commit. Due bug di correttezza (la home
mostrava "Tutto in ordine" mentre Manutenzioni e Fascicolo mostravano una voce scaduta; la card
della home derivava la sigla dalla colonna legacy `priority`), uno di layout (la PWA si stirava
a piena larghezza su desktop), e uno strutturale che ne nascondeva un altro: la scala z-index
semantica di `globals.css` non ha mai generato una sola utility, perché il namespace era sbagliato
per Tailwind v4 — motivo per cui la bottom nav copriva il pulsante di submit del CompletionSheet.
Nessuna migrazione, nessuna scrittura sul DB, `completions` mai toccata.

## Lavoro completato
- [x] FASE 0 — divergenza a tre superfici (home / Manutenzioni / Fascicolo) sulla stessa voce "VMC: sostituzione filtri": root cause provata con path+riga e con query sul DB reale
- [x] Commit `553126a` — home residente: stato scaduta derivato live da `next_due_date`, non più dallo stored `status`
- [x] Commit `bcf83eb` — home residente: sigla della card da `modeToPriority(resolveCompletionMode(i))`, non più dalla colonna legacy `priority`
- [x] FASE 0 — layout desktop della shell `(app)`: censimento container, bottom nav, max-width locali
- [x] Commit `85bf7a9` — shell `(app)`: colonna centrata `max-w-lg mx-auto` nel `<main>` del layout, allineata alla bottom nav
- [x] FASE 0 — submit invisibile nel CompletionSheet: root cause provata sul CSS compilato, non sul sorgente
- [x] Commit `91153a1` — riparata la scala z-index semantica (namespace `--z-index-*`) e bottom nav portata su `z-sticky`
- [x] Diagnosi read-only Admin API Supabase: guasto scoped a `listUsers`, nessun impatto sul prodotto (vedi "Stato attuale")

## File toccati
### Creati
- Nessuno. (Gli harness di verifica — script `tsx` e pagine HTML per Playwright — erano temporanei e sono stati cancellati: non è rimasto nulla nel working tree.)

### Modificati
- `src/app/(app)/page.tsx` — **commit `553126a`**: la query urgenti scarta in SQL solo ciò che non può mai essere urgente (`.neq('status','completata')` + `.eq('activation_status','inclusa')`, join `maintenance_templates!inner` con `is_active`) e deriva lo stato in JS con `isOverdueLive(i, today) || isInCorso(i)`. Banner e card leggono la **stessa lista filtrata** (`urgentCount = urgent.length`, card = `urgent.slice(0,3)`): il conteggio non può più divergere da ciò che si vede. Rimosso il `count: 'exact'` con `.limit(3)`, che era la sorgente strutturale della divergenza. Alle `MaintenanceCard` passa `resolveLiveStatus(i, today)`. **Commit `bcf83eb`**: `priority={modeToPriority(resolveCompletionMode(i))}`; rimossi dalla select e dal tipo i campi `priority` (item e template) diventati inutili.
- `src/app/(app)/layout.tsx` — **commit `85bf7a9`**: `<main className="flex-1 pb-20">` → `<main className="flex-1 w-full max-w-lg mx-auto pb-20">`. Unica riga toccata; nessuna pagina modificata, perché nessuna aveva un max-width locale da rimuovere.
- `src/app/globals.css` (righe 42-51) — **commit `91153a1`**: namespace della scala z-index da `--z-*` a `--z-index-*`, i sei valori invariati (20/30/40/50/60/70). È il namespace da cui Tailwind v4 genera le utility `z-*`; con `--z-*` non ne generava nessuna.
- `src/components/BottomNav.tsx` (riga 20) — **commit `91153a1`**: `z-50` → `z-sticky` (ora classe reale, valore 30). Il `z-50` letterale era esattamente il valore che la scala riserva a `--z-index-modal`: nav e modale collidevano.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/lib/maintenance-status.ts` — fonte di verità dello stato live (`isOverdueLive`, `isInCorso`, `resolveLiveStatus`, `isCountable`, `modeToPriority`, `LIVE_STATUS_FIELDS`). Esisteva già ed era completa: **nessun helper nuovo è stato creato**, la home semplicemente non la usava per gli urgenti.
- `src/app/(app)/manutenzioni/page.tsx` (righe 74, 83, 91-95) e `src/app/(app)/fascicolo/page.tsx` (righe 104-105) — le due superfici che già derivavano lo stato live correttamente. Sono state il modello a cui allineare la home.
- `src/components/ui/BottomSheet.tsx` (righe 70, 80) e `src/components/ui/Modal.tsx` (righe 76, 85) e `src/components/ui/Toast.tsx` (riga 52) — le classi `z-modal-backdrop` / `z-modal` / `z-toast` erano già scritte e corrette: erano stringhe morte. Dopo `91153a1` prendono vita da sole, senza toccare i file.
- `src/app/(app)/manutenzioni/actions.ts` (righe 7-89) — `completeN2`: l'INSERT in `completions` usa il client RLS (non il service client) con `performed_by_profile_id: user.id`. Solo lettura, invariante rispettato.
- `src/middleware.ts` — conferma che ogni route non-`/auth` richiede sessione: è il motivo per cui le verifiche visive non hanno potuto usare l'app autenticata.

## Decisioni chiave
- **La home si allinea agli helper esistenti, non nasce un helper nuovo.** `maintenance-status.ts` era già la fonte di verità usata da Manutenzioni e Fascicolo; il bug era che la home filtrava su `status IN ('scaduta','in_corso')` **in SQL** (riga 71 pre-fix), cioè leggeva un campo che avanza solo il cron — che in locale non gira e in produzione lascia buchi tra un run e l'altro. Alternativa scartata: aggiungere una vista o un contatore DB, che avrebbe creato una seconda definizione di "scaduta".
- **Banner e card dalla stessa lista, non da due query.** Il `count: 'exact'` + `.limit(3)` era corretto in teoria (il limit non tocca il count) ma manteneva due percorsi per lo stesso fatto. Ora il conteggio è `urgent.length`: la divergenza count/list è impossibile per costruzione, non per disciplina.
- **`max-w-lg` (512px) e non `max-w-2xl`** (decisione esplicita di Filippo): il profilo residente è un prodotto mobile destinato a un wrapper App Store, il desktop non è un target. 512px è già la larghezza del contenuto della `BottomNav`, quindi allinearsi a quel valore rende la nav coerente **senza toccarla** — qualunque altro valore avrebbe richiesto di modificare anche `BottomNav.tsx`, allargando lo scope.
- **La riparazione del namespace batte il fix locale sulla nav.** La mia prima proposta (`z-50` → `z-30` sulla sola nav) era **tecnicamente sbagliata** ed è stata respinta da Filippo con la specifica CSS alla mano: `z-index: auto` partecipa al livello di impilamento 0, quindi *qualsiasi* z-index positivo dipinge sopra un backdrop ad `auto`, e l'ordine DOM decide solo i pareggi. Una nav a `z-30` sarebbe rimasta sopra lo sheet. Il fix corretto è far esistere davvero la scala.
- **Nessuna scrittura su `auth` per aggirare l'Admin API rotta.** Sarebbe stato possibile crearsi una sessione residente via `generateLink` (che scrive un token in `auth.users`) per screenshottare l'app vera. Scartato: è una scrittura DB non approvata. Le verifiche visive girano su harness con CSS compilato reale — con il limite dichiarato qui sotto.

## Stato attuale
### Funziona
- `npx tsc --noEmit` a zero errori e `npm run build` verde dopo ciascuno dei 4 commit.
- **Le tre superfici concordano.** Verifica eseguita con gli helper **reali** importati da `maintenance-status.ts` sui dati reali di Supabase, sul perimetro del residente (Cavaccio · Unità 1): `urgentCount = 1`, card "VMC: sostituzione filtri", `stored status = in_attesa` ma `next_due_date = 2026-07-10 < today = 2026-07-14` → `status LIVE = scaduta`. Controprova sugli stessi dati: il predicato pre-fix restituiva `0` → "Tutto in ordine". È esattamente il bug riprodotto e chiuso.
- **Layout desktop.** Misure Chromium headless: prima `main = 1900px`, nav a `[694..1206]` (disallineati); dopo `main = 512px [694..1206]`, **identico alla nav**. Numero del banner da x=1849 → x=1155; gap "Vedi tutte"↔titolo da 1708px → 320px; hero da 1852px → 464px. A 375px (iPhone SE) tutte le misure sono **identiche bit per bit** prima e dopo: `max-w-lg` non morde sotto i 512px, nessuna regressione mobile.
- **Scala z-index viva.** Inventario delle utility nel CSS compilato dopo il fix: `.z-dropdown` `.z-sticky` `.z-modal-backdrop` `.z-modal` `.z-toast` `.z-tooltip` (prima: solo `.z-10` e `.z-50`). Computed style con sheet aperto, ai due viewport del bug: `nav=30 backdrop=40 panel=50`. `document.elementFromPoint` al centro del pulsante restituisce il **pulsante**, un click reale di Playwright arriva al listener, e sondando il centro della nav davanti c'è il pannello. Il submit "Registra completamento" è visibile **e raggiungibile**; la nav è oscurata dal backdrop.
- Effetto collaterale voluto di `91153a1`: anche `Modal.tsx` e `Toast.tsx` smettono di avere z-index inesistenti.
- Il flusso di completamento è integro e non è stato toccato: `completeN2` fa l'INSERT in `completions` via client RLS; la policy `completions: inserimento autorizzato` ammette `role = 'client'` su unità accessibile con `performed_by_profile_id = auth.uid()`.

### Non funziona / da verificare
- **Admin API Supabase: `listUsers` rotto, guasto scoped, zero impatto sul prodotto.** `auth.admin.listUsers()` → `500 unexpected_failure`, "Database error finding users". Ma `auth.admin.getUserById()` — la chiamata che il codice usa davvero per le email da `auth.users` — **funziona** su entrambi gli account di test e restituisce `404 user_not_found` pulito su un UUID inesistente: l'endpoint è sano. La service key è valida (PostgREST risponde). `listUsers` **non compare da nessuna parte nel codice del prodotto**: l'ho usata solo io in uno script di verifica. Nessun flusso di CasaZero è affetto. Se si vuole indagare: log del progetto `kuvekkseclhhcamojysj` dal dashboard; il sospetto è qualcosa che rompe l'enumerazione su `auth.users` senza impedire il lookup per chiave primaria. **Non verificato oltre, nessuna riparazione tentata.**
- **NESSUNA VERIFICA È STATA FATTA SULL'APP AUTENTICATA.** Il middleware richiede una sessione e l'Admin API rotta impedisce di crearsene una via magic link. Le verifiche girano su: (a) gli helper reali eseguiti sui dati reali — prova piena per il bug dello stato live; (b) harness Playwright con il **CSS di produzione appena buildato** e il markup copiato dai componenti reali — prova piena per il comportamento di impilamento e di larghezza, che è puro CSS e non dipende da dati né da auth, ma **non è uno screenshot dell'app loggata**. Chi ha una sessione residente dovrebbe confermare a occhio in `npm run dev`.
- Il `.z-50` resta nel CSS compilato: qualche altro componente lo usa ancora (non indagato, fuori scope).

## Prossimi passi
1. **R2-bis — CompletionSheet, solo estetica.** Il punto funzionale ("nav sopra il backdrop", submit irraggiungibile) è **chiuso** da `91153a1`: resta solo il redesign estetico dello sheet, esplicitamente tenuto fuori come concern separato.
2. **R3 — card cliccabili + verifica della destinazione delle card in home.** Controllare dove puntano davvero le card (la home linka `/manutenzioni/${id}`) e rendere cliccabile l'intera superficie dove non lo è, senza annidare interattivi (hydration error).
3. **R4 — commenti.** `addComment` esiste già in `src/app/(app)/manutenzioni/actions.ts:91`; da verificare la superficie residente che la usa.
4. **Verifica F3 manuale** — riportarne l'esito (non eseguita in questa sessione).
5. **`/impeccable polish` sulla home residente** — passata estetica, ora che la colonna è centrata e i dati sono corretti.
6. Passata visiva in `npm run dev` con una sessione residente reale sui 4 commit (vedi "Non funziona").

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Build di verifica prima di ogni commit
npm run build

# Prova di esistenza di una utility Tailwind: grep sul CSS COMPILATO, non sul sorgente
npm run build
grep -o '\.z-[a-z0-9-]*' .next/static/css/*.css | sort -u
```

## Residui nel working tree (preesistenti a questa sessione)
Nessuno di questi è stato prodotto dalla sessione — sono tutti antecedenti (date 3–9 luglio) ed
erano già nel `git status` all'avvio. **Non li ho toccati**: sono lavoro in corso di Filippo e
cancellarli o committarli sarebbe stato distruttivo. Vanno decisi da lui.
- `CLAUDE.md` — **modificato**: aggiunta in coda la sezione "Wiki Knowledge Base" (path `C:\progetti\CasaZeroVault\wiki` e ordine di lettura hot.md → index.md → sub-index). 12 righe, mai committata.
- `docs/spec.md` — **cancellato dal disco ma ancora tracciato in git** (261 righe). Va deciso: `git rm` per formalizzare, o `git restore` per recuperarlo. Nota: `CLAUDE.md` lo cita ancora come "spec estesa".
- Non tracciati: `DESIGN.md`, `PRODUCT.md`, `.impeccable/` (config e cache dell'hook), `.claude/skills/`, `docs/Nuovo File PY.py`.

## Domande aperte
- `docs/spec.md`: si formalizza la cancellazione (`git rm`) o si recupera? Finché resta in questo stato, `CLAUDE.md` punta a un file che non esiste su disco.
- `DESIGN.md` e `PRODUCT.md` sono documenti di progetto da committare, o scratch locali da tenere fuori?
- Il dual-write su `priority` regge ancora: la home non la legge più (`bcf83eb`), ma le viste admin sì. Vale la pena censire chi resta a leggerla, per capire quanto manca alla rimozione della colonna legacy?
- Vale la pena aprire un ticket sul 500 di `listUsers`, dato che non impatta il prodotto?

## Leggi emerse (candidate per CLAUDE.md)

Due leggi, entrambe pagate con bug reali di questa sessione — la seconda con un mio errore, corretto da Filippo.

- **Sezione Regole di codice ricorrenti**: "Tailwind v4: le utility custom nascono solo dal namespace corretto (`--z-index-*`, non `--z-*`). Una classe che compila senza errori può essere una stringa morta — la prova di esistenza è il `grep` sul CSS compilato, mai la presenza nel sorgente. È la generalizzazione di CK1 (l'annotazione non è prova, solo l'output lo è) applicata al CSS: `globals.css` dichiarava una scala z-index semantica che non ha mai generato una sola utility, e `z-modal`/`z-toast` sono rimaste `z-index: auto` per l'intera vita del progetto — con la bottom nav sopra i modali e il submit del CompletionSheet irraggiungibile. Né `tsc` né `npm run build` lo vedono."

- **Sezione Regole di codice ricorrenti**: "Stacking CSS: `z-index: auto` è livello 0, non 'sotto tutti'. Qualsiasi z-index positivo dipinge sopra un elemento ad `auto`; l'ordine DOM decide solo i pareggi, e un portale in coda al `<body>` non basta a far salire un backdrop senza z-index. Corollario: un elemento sticky di shell (bottom nav) non deve mai avere un z-index nella fascia dei modali — la scala semantica esiste per questo, e va usata (`z-sticky`), non aggirata con valori letterali."

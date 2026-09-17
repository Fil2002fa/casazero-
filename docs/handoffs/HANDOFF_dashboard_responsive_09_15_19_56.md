# Handoff — Dashboard responsive (super_admin e admin) · 15/09/2026 19:56

## Sommario
La dashboard `(dashboard)` era desktop-only: a 390px la sidebar fissa lasciava circa 102px al contenuto, con card tagliate e scroll orizzontale. La premessa nuova è che costruttore e amministratore devono usarla per intero dal browser del telefono. In questa sessione ci sono stati una FASE 0 di inventario e 37 commit su `main`, ancora non pushati: shell a due stati (sidebar da `lg`, drawer sotto `lg`), griglie, testata condivisa, tabelle che diventano card, rotture locali, email e nomi lunghi a capo, toast, documentazione di design allineata.

## Lavoro completato
- [x] FASE 0: inventario delle superfici per ruolo, primitive di layout, divergenze fra ruoli, confine con la PWA, rotture a 390px. Decisioni D1–D12 prese da Filippo
- [x] PASSO 0: `bfb4a96` zoom del browser sbloccato · `9bb7fa5` controllo di ruolo sul wizard `residences/new` · `44adc73` la shell senza profilo va al login invece di presumere admin
- [x] PASSO 1: baseline screenshot fatta da Filippo a mano. L'automazione Playwright è stata tolta su sua richiesta
- [x] PASSO 2 (refactor puro, identico a 1280): `0403b2d` elenco residenze a vista unica · `cc1a92a` `ResidencePhotoUpload` con `readOnly` · `18fa683` pagina residenza unica con parti del costruttore come prop
- [x] PASSO 3 shell: `278cd21` hook `useDialogFocus` estratto da `Modal` · `bbee5cc` padding `px-4 lg:px-6` · `0c898b2` sidebar solo da `lg`, drawer con hamburger nell'header sotto `lg`
- [x] PASSO 4–6: `e9a974a` griglie con base a 320 · `9493f22` `PageHeader` condiviso (titolo serif ovunque, ritorno con nome della destinazione) · `3ef5989` `ui/Table` a card sotto soglia (`stack` `lg`/`xl`, valore su 2 righe, etichetta mai a capo)
- [x] `8e6d110` Impostazioni senza ritorno, come le altre voci di menu
- [x] `3b583b6` sotto `lg` scorre il documento e l'header è sticky, da `lg` resta tutto com'era
- [x] PASSO 7, rotture locali: `96870a1` azioni della testata unità · `b5e2e66` invito amministratore sotto il testo · `cc17c1f` skeleton residenza fluido, senza "Numeri chiave" · `a68afd0` email dei fornitori a capo · `6984591` componente `FilterCounters` in Attività admin · `cd5b359` contatori nel piano residenza · `cbe08a1` schede di Impostazioni impilate sotto `sm`
- [x] Email mai troncate: `3392e35` elenco amministratori · `360636b` scheda amministratore · `bf1aa93` modale amministratore · `5861684` profilo account
- [x] Nomi residenza senza spazi (es. `__TEST_ACCENSIONE__`): `e221565` `PAGE_TITLE` · `01b8317` card di tabella · `4647d75` ritorno delle sottopagine · `446a74b` card di attenzione amministratori · `842c573` scheda amministratore · `039b6a4` dettaglio voce · `22a8ac2` lavori dei fornitori · `6730f98` proposta fornitore in Documenti · `159df11` modale di conferma del piano
- [x] PASSO 8: `855fccf` toast della dashboard in basso al centro sotto `lg` · `03b26e2` DESIGN.md allineato · `d866710` PRODUCT.md allineato
- [x] `npm run verify` verde prima di ogni commit, sempre con il solo warning già noto su `src/app/api/reconcile-documents/route.ts:12`
- [ ] Verifica funzionale di Filippo su tutti i commit dopo le card di tabella: vedi "Non funziona / da verificare"
- [ ] Push su `origin/main`: il branch è avanti di 37 commit

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/new/layout.tsx` — `requireRole(['super_admin'], '/admin/manutenzioni')` prima del wizard, che è un componente client
- `src/components/ui/useDialogFocus.ts` — focus iniziale, Tab intrappolato, Escape, blocco dello scroll, ripristino del focus. Lo usano `ui/Modal` e il drawer della dashboard
- `src/components/PageHeader.tsx` — `PageHeader` (ritorno, titolo, descrizione, azioni che vanno a capo sotto `sm`), `BackLink`, costante `PAGE_TITLE` (serif 3xl con `break-words`)
- `src/components/FilterCounters.tsx` — contatori-filtro a righe compatte, un solo contenitore, tre colonne da `sm`. Link se il filtro è nell'URL, bottone se è stato client. Colori `status-*`
- `docs/handoffs/HANDOFF_dashboard_responsive_09_15_19_56.md` — questo documento

### Modificati
- `src/app/layout.tsx` — tolti `maximumScale` e `userScalable: false` (vale anche per la PWA)
- `src/app/(dashboard)/layout.tsx`:
  - `requireProfile()` al posto del fallback `'admin'`;
  - shell `bg-background lg:flex lg:h-dvh lg:overflow-hidden`, `<main className="lg:flex-1 lg:overflow-auto">`;
  - `BuilderIdentityBar` con `sticky top-0 z-sticky lg:static lg:z-auto` e hamburger passato in `leading`;
  - `ToastProvider placement="dashboard"` annidato.
- `src/components/AdminSidebar.tsx` — `NavContent` condiviso (voce attiva via `usePathname`), sidebar `hidden lg:flex`, nuovo `MobileNav` con hamburger e drawer. Il drawer non usa un portal, perché altrimenti perderebbe `--wl-brand-dark`. Voci `h-11 lg:h-9`. Si chiude se la finestra supera `lg`
- `src/components/BuilderIdentity.tsx` — prop `leading` renderizzata prima dell'identità
- `src/lib/layout.ts` — `CONTENT_GRID = 'px-4 lg:px-6'`
- `src/components/ui/Modal.tsx` — usa `useDialogFocus`
- `src/components/ui/Table.tsx`:
  - `'use client'`, prop `stack: 'lg' | 'xl'` obbligatoria, mappe di classi `STACK`;
  - `TableCell` con `label`: nella card l'etichetta non va a capo e il valore ha `line-clamp-2`, `items-start`, `break-words`;
  - il titolo `emphasis` è avvolto in `min-w-0 break-words`.
- `src/components/ui/Toast.tsx` — prop `placement: 'app' | 'dashboard'` (`PLACEMENT_STYLES`). `app` resta il comportamento della PWA
- `src/components/FornitoriManager.tsx` — email con `break-all` e icona allineata alla prima riga. Nome residenza nei lavori da `shrink-0` a `min-w-0 break-words`
- `src/app/(dashboard)/admin/residences/page.tsx` + `ResidencesEmptyState.tsx` — vista unica con `canManage`, `PageHeader`
- `src/app/(dashboard)/admin/residences/ResidencesTable.tsx` — `stack="lg"` ed etichette per cella
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — vista unica (query del costruttore solo con `canManage`, porte `managerOnly`), griglia porte `grid-cols-1 sm:grid-cols-2 …`, `BackLink` (per l'admin l'etichetta è "Attività")
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx` — prop `readOnly`, blocco identità condiviso, titolo `PAGE_TITLE`
- `src/app/(dashboard)/admin/residences/[id]/UnitsSummaryTable.tsx` — `stack="lg"`, `label="Residente"`
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — stato vuoto in colonna sotto `sm`. Email nella modale con `break-all`
- `src/app/(dashboard)/admin/residences/[id]/loading.tsx` — griglia porte ricalibrata, barre fluide con `max-w-*`, rimosso lo skeleton "Numeri chiave"
- `src/app/(dashboard)/admin/residences/[id]/{units,fascicolo,fornitori,manutenzioni,documenti,attivita}/page.tsx` — `PageHeader` con `back={{ href, label: residence.name }}` al posto della testata copiata sei volte
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` — tabella scritta a mano migrata a `ui/Table` con `stack="xl"`
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — testata con `flex-wrap`
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — `FilterCounters`. Modale di conferma con `break-words`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — blocco della proposta fornitore con `break-words`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — `PageHeader`, `FilterCounters` (rimossi `Stat` e `STAT_TONES`)
- `src/app/(dashboard)/admin/manutenzioni/ManutenzioniTable.tsx` — `stack="xl"` ed etichette
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — `PageHeader` (badge in `actions`, categoria come descrizione), link alla residenza con `break-words`
- `src/app/(dashboard)/admin/loading.tsx` — skeleton dei contatori a righe
- `src/app/(dashboard)/admin/administrators/page.tsx` — `PageHeader`. Nelle card di attenzione email e righe con `break-words`/`break-all`
- `src/app/(dashboard)/admin/administrators/[id]/page.tsx` — `PageHeader` (rimosso `BackHeader`), email con `break-all`, nome residenza con `min-w-0 break-words`
- `src/app/(dashboard)/admin/fornitori/page.tsx`, `attivita/page.tsx` — `PageHeader`
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — `PageHeader` senza ritorno. Schede impilate sotto `sm` (selezionata `bg-brand-dark text-white`), in riga sottolineate da `sm`
- `src/app/(dashboard)/admin/settings/AccountTab.tsx` — email con `break-all`
- `DESIGN.md`:
  - `neutral-500 #5E5E5E`, `text-secondary #5F6E68`;
  - doppio guscio: dashboard per costruttore e amministratore, anche da telefono;
  - ruolo del verde nella navigazione;
  - Toast per shell, Table a card mai con scroll orizzontale, Navigation a sidebar e drawer.
- `PRODUCT.md` — l'amministratore opera in `(dashboard)`, la dashboard si usa per intero anche dal telefono

### Letti (solo quelli rilevanti per capire il contesto)
- `.claude/skills/impeccable/SKILL.md`, `reference/adapt.md`, `reference/layout.md` — `/impeccable` non contiene un design system suo: rimanda a DESIGN.md e PRODUCT.md. Fonte di breakpoint 640/768/1024, touch 44px, "mai nascondere funzioni su mobile"
- `DESIGN.md`, `PRODUCT.md` — design system reale e punti superati (finding 1.4)
- `src/lib/auth.ts` — `getProfile` scarta `error` (`:23`), `requireRole` chiama `requireProfile`
- `src/middleware.ts` — controlla solo `!user`, nessun redirect da `/auth` per chi è loggato (niente loop col login)
- `public/sw.js`, `public/manifest.webmanifest`, `src/components/PwaInit.tsx` — FASE 0 su "non si può rinfrescare": `display: standalone`, rete sola per le navigazioni
- `src/app/(app)/layout.tsx` — confine con la PWA: documento che scorre (`min-h-svh`), BottomNav
- `src/lib/cn.ts` — concatena e basta, niente tailwind-merge

## Decisioni chiave
- **Navigazione dashboard (D1–D4)**: una sola shell parametrica, due stati soli. Da `lg` sidebar fissa; sotto `lg` drawer con hamburger nell'header. Scartate: bottom nav (resta la grammatica della PWA, le shell devono distinguersi) e sidebar a icone.
- **Breakpoint (D5)**: di viewport, ricalibrati dopo D2. Ogni griglia dichiara una base a 320 di 1 o 2 colonne. Container query solo se un componente resta rotto dopo la shell.
- **Testata (D6)**: componente unico, azioni a capo sotto il titolo su mobile. Niente menu "…", perché nasconde funzioni.
- **Tabelle (D7)**: card impilate sotto `lg`, mai tabella compressa né scroll orizzontale. Stesso markup, solo CSS. `xl` per Attività admin e Fascicolo.
- **Card, celle**: valore al massimo su due righe con `line-clamp-2`, allineato in alto. Etichetta mai a capo. Scartato il troncamento a una riga, che nasconde dati.
- **Touch e padding (D8, D9)**: 44px su telefono con l'attuale `h-11 md:h-9`; `Button` e `Input` non toccati perché condivisi con la PWA. Padding `px-4` sotto `lg`, `px-6` da `lg`.
- **Zoom (D11)**: `userScalable: false` rimosso anche per la PWA (WCAG 1.4.4).
- **Refactor viste admin (D12)**: fatto per primo, in commit propri, verificato identico a 1280.
- **Scorrimento sotto `lg` (A)**: scorre il documento e l'header è sticky senza bordi né ombre nuove. Nessun `overflow-x-clip`: lo scroll orizzontale è il rilevatore delle rotture residue.
- **Contatori**: righe compatte in un componente unico. A riposo il numero è colorato solo se maggiore di zero (Regola del Silenzio). Filtro attivo a tinta piena con testo bianco, come la voce attiva della sidebar; scartato l'anello, usato in sole 2 occorrenze. Colori `status-*` e non `semantic-*`, perché DESIGN.md vieta `semantic-*` nei componenti nuovi.
- **Titolo di pagina**: serif 3xl ovunque (DESIGN.md: Display per H1). I tre stili di prima erano deriva.
- **Email**: mai troncate, `break-all`, perché su telefono non c'è il `title` al passaggio del mouse.
- **Nomi senza spazi**: `break-words` e non `break-all`, con il contenitore in `min-w-0`. La regola sta nel componente condiviso dove esiste (`PAGE_TITLE`, `BackLink`, `ui/Table`).
- **Toast (D10)**: prop `placement` su `ToastProvider` con un provider annidato nella dashboard. Scartato un comportamento globale che avrebbe cambiato la PWA.
- **Impostazioni**: nessun ritorno, come Fornitori e Amministratori. Schede impilate sotto `sm`: scartato lo scroll orizzontale, che nascondeva la terza scheda.
- **Drawer senza portal**: `BrandMark` legge `--wl-brand-dark` impostato sul contenitore della shell. In un portal su `body` perderebbe il colore del costruttore.

## Stato attuale
### Funziona
- `npm run verify` è verde su HEAD `d866710`.
- **Verificato da Filippo a 390:**
  - shell senza scroll orizzontale (PASSO 3);
  - drawer funzionante, foglia CasaZero col colore del costruttore;
  - pagina residenza corretta;
  - elenco residenze a card dopo il passaggio della soglia a `lg`.
- **Verificato da Filippo a 1280:** refactor del PASSO 2 identico.
- **Verificato da me:**
  - le 13 classi nuove dei passi 3–6 generate nel CSS del dev server;
  - le regole card (`max-md:`/`max-xl:`) che vengono dopo quelle base.
  - Il controllo è stato fatto prima del passaggio a `lg`, quindi non copre le varianti `max-lg:`.

### Non funziona / da verificare
- **Non confermati esplicitamente da Filippo nel browser:**
  - `3b583b6`: documento che scorre e header sticky;
  - PASSO 7 dal 5 al 7: contatori e schede;
  - i quattro commit email;
  - i nove commit sui nomi senza spazi;
  - toast `855fccf`.
- **Non controllato nel CSS generato:** le classi dopo il cambio di soglia (`max-lg:*`, `line-clamp-2`, `break-words`, `sm:divide-x`, `z-sticky`, `lg:static`, `max-lg:w-max`, `max-lg:max-w-[calc(100vw-2rem)]`).
- **Rotture note solo a 320px, fuori tabella:**
  - banner filtro unità (`UnitsManager.tsx:206-215`);
  - pill dello skeleton del piano (`src/app/(dashboard)/admin/residences/[id]/manutenzioni/loading.tsx:15-18`).
- **Tabelle a card:** `display:flex` su `tr`/`td` può togliere la semantica di tabella ad alcuni screen reader. Nel fascicolo la voce è prima visivamente ma dopo nel DOM.
- **Card fascicolo sotto `xl`:** `line-clamp` (`overflow: hidden`) può tagliare l'anello di focus dei link allegati.
- **Ritorno da `manutenzioni/[id]`:** punta a `/admin/manutenzioni` anche per il super_admin, che ci arriva solo via redirect verso Residenze. Preesistente.
- **Non pushato:** `main` è avanti di 37 commit su `origin/main`.
- **Working tree:** `CLAUDE.md` modificato (+10 righe, da una sessione precedente, non toccato) e 8 handoff non tracciati precedenti a questa sessione.
- **Dev server:** avviato in background durante la sessione (`npm run dev` su :3000). La cache `.next` su Windows aveva dato `EPERM`/`ENOENT` una volta, risolto riavviando.

## Prossimi passi
1. **Filippo a 390, 768 e 1280, con `pippoloro02` e `filippoloro02`:**
   - `/admin/residences/<id>` con una residenza di nome `__TEST_ACCENSIONE__`: titolo e ritorno delle sottopagine vanno a capo senza scroll laterale;
   - `/admin/manutenzioni` e `/admin/residences/<id>/manutenzioni`: contatori a righe, toggle, zero neutro, riga attiva a tinta piena;
   - `/admin/settings`: schede impilate e profilo con email lunga;
   - una lista lunga per l'header sticky;
   - un'azione che mostra un toast (per esempio salvare il profilo in Impostazioni → Profilo account): in basso al centro sotto `lg`, in basso a destra da `lg`.
2. **Controllo CSS:** in DevTools, sul `<table>` delle card c'è `max-lg:block` e la regola è attiva? Stesso controllo per `line-clamp-2` sui valori.
3. **Push:** fatte le verifiche, `git push origin main` (37 commit).
4. **Pendenze fuori dal blocco:** committare o scartare le 10 righe di `CLAUDE.md` e gli 8 handoff non tracciati precedenti.
5. **Blocco a sé, da backlog approvato:**
   - scheda di Impostazioni nell'URL (`SettingsShell.tsx`, `useState` alla riga 27);
   - `user!.id` in `settings/page.tsx:22` (profilo già letto da `requireRole`);
   - `getProfile` (`src/lib/auth.ts:23`) e le pagine che scartano `error` di Supabase.
6. **Blocco `/impeccable` a blocco chiuso:** etichette maiuscole spaziate (`UnitsManager.tsx`, `FornitoriManager.tsx`, `administrators/*`, `DocumentiClient.tsx:852`, `manutenzioni/[id]/page.tsx`), bordi `border-l-4` colorati, colori esadecimali scritti a mano.
7. **Wizard `residences/new`:** blocco separato, fuori perimetro. Non ha `PageHeader` e non è stato ricalibrato.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (serve per il service worker)
npm run build && npm start

# gate pre-commit
npm run verify

# commit di questa sessione
git log --oneline f43c380..HEAD
```

## Domande aperte
- **Supporto a 320px:** va garantito anche lì? Oggi due rotture note (banner filtro unità, skeleton del piano).
- **Accessibilità delle tabelle a card:** vanno aggiunti ruoli ARIA espliciti (`role="table"`, `row`, `cell`)? `TableRow` cliccabile oggi usa `role="button"`.
- **Focus trap della PWA:** va deduplicato anche lì (`src/components/ui/BottomSheet.tsx:31-69`) con `useDialogFocus`? È fuori dal perimetro PWA di questo blocco.
- **Ritorno da `manutenzioni/[id]` per il super_admin:** deve portare alla residenza della voce?
- **`(app)/layout.tsx:12`:** lascia passare chi non ha profilo (`if (profile && …)`). Va allineato a `requireProfile`?
- **Toast in dashboard:** `max-lg:max-w-[calc(100vw-2rem)]` è un valore arbitrario. Va tenuto o sostituito con un token?

## Leggi emerse (candidate per CLAUDE.md)

- **Stack** (sostituisce la riga "Dual shell"): `Dual shell: (dashboard) per super_admin e admin, usabile per intero da desktop e dal browser del telefono (nessuna versione ridotta) · (app) per residente PWA. Dashboard a due stati: da lg sidebar fissa e <main> che scorre; sotto lg niente sidebar, drawer aperto dall'hamburger nell'header sticky, scorre il documento. Nessuna bottom nav in dashboard: è la grammatica della PWA.`

- **Regole di codice ricorrenti**: `Testo che viene dai dati (nomi di residenza, persone, email, indirizzi) dentro un flex: il contenitore ha sempre min-w-0 e il testo break-words; le email break-all. Mai truncate su email o su dati che l'utente deve leggere per intero: su telefono non esiste il title al passaggio del mouse. Una regola così vive nel componente condiviso (PAGE_TITLE, BackLink, ui/Table), non ripetuta nelle pagine.`

- **Regole di codice ricorrenti**: `Tabelle dashboard: sempre ui/Table con stack obbligatorio ('lg' di norma, 'xl' se le colonne non stanno in 736px di contenuto). Sotto la soglia ogni riga è una card: cella emphasis come titolo, ogni altra cella con label. Mai scroll orizzontale, mai overflow-x-clip per nasconderlo: lo scroll orizzontale è il rilevatore delle rotture.`

- **Regole di codice ricorrenti**: `Griglie di pagina: ogni griglia dichiara la sua base a 320 (grid-cols-1 o grid-cols-2), mai grid-cols-3 senza base. Breakpoint di viewport: sono affidabili perché sotto lg la dashboard non ha sidebar e il viewport coincide con il contenuto.`

- **Regole di codice ricorrenti**: `Un elemento che legge le variabili whitelabel (--wl-brand-dark, --wl-logo) non va in un portal su body: le variabili sono impostate inline sul contenitore della shell e fuori da lì il colore del costruttore si perde. Per overlay e drawer basta position: fixed senza antenati con transform o contain.`

- **Regole di codice ricorrenti**: `Toast: la posizione dipende dalla shell tramite ToastProvider placement ('app' nel layout radice, 'dashboard' annidato nel layout della dashboard). Mai cambiare la posizione globale per una sola shell.`

- **Metodo di lavoro**: `Una tabella delle rotture responsive calcolata sulle classi non basta: prima di dichiarare integra una superficie, verificarla con dati estremi reali (stringhe senza spazi come __TEST_ACCENSIONE__, email lunghe, nomi lunghi), perché le classi non mostrano come si comportano i dati.`

- **Metodo di lavoro**: `Quando Filippo motiva una decisione, il motivo vale come criterio anche per i casi non elencati: applicarlo e segnalare esplicitamente i casi estesi, invece di chiedere di nuovo o di limitarsi alla lettera.`

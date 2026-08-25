# Handoff — CK5: identità whitelabel, header shell dashboard · 12/07/2026 17:55

## Sommario
CK5: due problemi collegati sull'identità whitelabel del costruttore, diagnosticati in FASE 0 read-only prima di ogni modifica. Il logo del costruttore risultava rotto nell'header: root cause trovata via query dirette su `storage.buckets`/`storage.objects` — non un bug di codice, ma un valore stantio in `builders.logo_url` che punta ancora al bucket privato `documents`, caricato prima che esistesse il bucket pubblico dedicato `builder-logos` (oggi vuoto). Il nome "Furlan srl" mostrato in Impostazioni non era un residuo di cancellazione parziale: né nome né logo risultano mai stati rimossi, il logo sembra solo "sparito" perché l'URL fallisce silenziosamente (400). Commit B (fix del logo) è stato scartato su decisione esplicita di Filippo: il percorso di scrittura attuale è già corretto, non c'è codice da correggere, serve solo un re-upload manuale. Commit A ha costruito l'header reale della shell dashboard (che prima non esisteva affatto) con l'identità del costruttore, riusando in un componente condiviso il pattern già presente nella preview di Impostazioni → Identità.

## Lavoro completato
- [x] FASE 0 (read-only): letti `(dashboard)/layout.tsx`, `AdminSidebar.tsx`, `lib/whitelabel.ts`, `IdentityTab.tsx`, `settings/actions.ts`, `settings/page.tsx`, `next.config.ts`; eseguite query read-only su `storage.buckets`, `storage.objects`, `builders` per verificare pubblico/privato dei bucket e il valore reale di `logo_url`/`name`
- [x] Diagnosi riportata e approvata: (1) l'header della shell dashboard non esisteva — `(dashboard)/layout.tsx` destrutturava solo `brandDark` da `getWhitelabelBrand()`, mai `logoUrl`/`builderName`; il "logo rotto" è documentato in un commento pre-esistente di `IdentityTab.tsx` riferito alla sola preview, non a un header reale; root cause confermata via query: bucket `builder-logos` (corretto, pubblico, creato 07/07) vuoto, bucket `documents` (privato) contiene i due vecchi upload del logo, `builders.logo_url` punta ancora lì; (2) query su `builders`: `name = 'Furlan srl'`, `logo_url` non NULL — nessuno dei due campi era mai stato cancellato
- [x] Decisione di Filippo: Commit B saltato, nessun codice preventivo — la condizione legacy è una riga sola nel DB e il percorso di scrittura attuale (`updateBuilderSettings`) scrive già su `builder-logos`, non può ripresentarsi dopo il re-upload manuale
- [x] Commit A (`d703393`): nuovo componente `src/components/WhitelabelStrip.tsx` (icona/logo + fallback foglia CasaZero su `onError` + nome, `children` opzionale per contenuto finale); usato sia dal nuovo header reale in `(dashboard)/layout.tsx` (sopra `{children}`, sidebar invariata con `BrandMark`) sia da `IdentityTab.tsx` al posto del markup duplicato che prima definiva `LeafMark` localmente
- [x] Audit `/impeccable` dopo il commit ha trovato un P2 (colore brand hardcoded `#04342C` invece della CSS var di sistema `--wl-brand-dark`, già usata correttamente da `BrandMark.tsx`) — fix incluso nello stesso commit su richiesta esplicita di Filippo (`git commit --amend`)
- [x] `tsc --noEmit` verde su Commit A (pre e post fix P2)

## File toccati
### Creati
- `src/components/WhitelabelStrip.tsx` — striscia identità costruttore condivisa: logo o fallback `LeafMark` (foglia CasaZero) su `onError`, nome, slot `children` per contenuto aggiuntivo (usato dalla preview di Impostazioni per l'annotazione "così appare nell'header"); usa `var(--wl-brand-dark, #04342C)`, non un hex hardcoded

### Modificati
- `src/app/(dashboard)/layout.tsx` — `getWhitelabelBrand()` ora destruttura anche `logoUrl`/`builderName`; nuovo header (`<div className="px-4 pt-4 pb-3">` con `WhitelabelStrip`) sopra `{children}` dentro `<main>`, non sticky (scorre col contenuto, zero rischio sulle pagine che usano `min-h-screen`/header sticky interni)
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — rimossi `LeafMark` locale e `BRAND_LIGHT` (spostati in `WhitelabelStrip`); la preview integrata ora usa `<WhitelabelStrip name={name} logoSrc={previewSrc}>` con l'annotazione passata come `children`; `BRAND_DARK`/`thumbError` locali restano, usati solo dallo swatch separato della Card 2 (stato "logo presente")

### Letti (solo quelli rilevanti per capire il contesto)
- `src/components/AdminSidebar.tsx`, `src/components/BrandMark.tsx` — confermato che CasaZero resta il marchio della sidebar (invariata) e che `BrandMark` già usa correttamente `var(--wl-brand-dark, #04342C)`, pattern replicato in `WhitelabelStrip`
- `src/app/globals.css` — trovata la CSS var `--wl-brand-dark` (righe 56-59, override per-costruttore, oggi fissa) e `--color-brand-dark` (token Tailwind `@theme`, valore statico) — due meccanismi distinti, il primo pensato apposta per il whitelabel
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — altro punto che renderizza `builder.logo_url` (card contatto builder per l'amministratore), diverso dall'header, non toccato: usa `<img>` diretto senza fallback, fuori scope di questo commit
- `next.config.ts` — confermato dominio Supabase già whitelisted per `next/image` (non che serva: il codice usa sempre `<img>` semplice)

## Decisioni chiave
- **Root cause: valore DB stantio, non bug di codice**: query dirette hanno mostrato che il bucket pubblico corretto (`builder-logos`) è vuoto e il bucket privato (`documents`) contiene i vecchi upload — il logo fu caricato prima che il bucket pubblico esistesse (tre settimane di scarto tra gli upload e la creazione del bucket). L'unico codice di scrittura di `logo_url` (`updateBuilderSettings`, `removeBuilderLogo` in `settings/actions.ts`) è già corretto. Decisione di Filippo: nessun codice preventivo, il fix è un'azione manuale (re-upload).
- **Header non sticky**: scelta deliberata per non toccare l'architettura di scroll di ogni pagina dashboard. Molte pagine (`fascicolo`, superfici `(app)`) usano `min-h-screen` o header `sticky top-0` interni propri — rendere il nuovo header sticky avrebbe richiesto ristrutturare `main` in `flex flex-col overflow-hidden` + contenitore scroll interno, con rischio di alterare il comportamento di `min-h-screen` su pagine non toccate in questa sessione. Alternativa scartata esplicitamente per contenere lo scope a un solo concern.
- **`WhitelabelStrip` con slot `children` invece di forzare l'annotazione ovunque**: l'unica differenza visiva tra header reale e preview di Impostazioni è la scritta "così appare nell'header" (specifica della preview) — reso come `children` opzionale invece di un prop dedicato o una duplicazione del componente.
- **CSS var invece di hex hardcoded** (fix P2 post-audit): il sistema ha già un punto di controllo unico (`--wl-brand-dark`) per questo colore, usato da `BrandMark.tsx`; hardcodarlo di nuovo in un componente appena creato avrebbe reintrodotto la stessa inconsistenza che il sistema era pensato per evitare.

## Stato attuale
### Funziona
- Header reale della shell dashboard: logo o fallback foglia CasaZero + nome costruttore, visibile su ogni pagina `(dashboard)`; sidebar invariata (CasaZero/`BrandMark`)
- Preview di Impostazioni → Identità: stesso componente, stesso fallback, zero duplicazione di markup
- Fallback grazioso già attivo sul logo rotto di Furlan srl: mostra la foglia CasaZero invece di un'icona rotta, sia in header sia in preview, finché non viene ricaricato il logo
- `tsc --noEmit` verde; audit `/impeccable` 19/20 → 20/20 dopo il fix P2 (non riverificato dopo l'amend, ma il fix era l'unico finding aperto)

### Non funziona / da verificare
- Nessuna verifica in browser reale in questa sessione (solo `tsc --noEmit` + audit statico) — da testare: header visibile su più pagine dashboard con scroll, comportamento del fallback su re-upload del logo, leggibilità con nome costruttore molto lungo (`truncate` non testato visivamente)
- Il logo di Furlan srl resta rotto nel DB finché Filippo non lo ricarica manualmente da Impostazioni → Identità (nessuna scrittura DB eseguita in questa sessione, per vincolo esplicito)
- `admin/manutenzioni/page.tsx` mostra `builder.logo_url` in un'altra superficie (card contatto per l'amministratore) senza lo stesso fallback grazioso di `WhitelabelStrip` — non toccato, fuori scope dichiarato
- `CLAUDE.md` (modificato) e `docs/spec.md` (cancellato) restano non committati — quinta sessione consecutiva che lo segnala senza risoluzione
- File non tracciati ancora presenti e non spiegati: `DESIGN.md`, `PRODUCT.md`, `.claude/skills/`, `.impeccable/`, `docs/Nuovo File PY.py`

## Prossimi passi
1. Filippo: ricaricare il logo di Furlan srl da Impostazioni → Identità per chiudere definitivamente il bug del logo rotto (nessun codice da cambiare, il percorso di scrittura attuale è già corretto)
2. Verificare in browser (`npm run dev`) l'header su almeno 2-3 pagine dashboard diverse, incluso lo scroll e il caso "nome costruttore lungo"
3. Se necessario in futuro, applicare lo stesso fallback grazioso di `WhitelabelStrip` alla card contatto builder di `admin/manutenzioni/page.tsx` (oggi `<img>` diretto senza gestione errore) — non richiesto in questa sessione, segnalato come nota
4. Chiarire definitivamente `CLAUDE.md`/`docs/spec.md` non committati — quinta sessione che lo segnala

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Nessuna nuova rispetto a quelle già aperte nelle sessioni precedenti (vedi Prossimi passi 4)

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione: Metodo di lavoro** — aggiungere una riga sulla diagnosi read-only che scende fino allo storage/DB reale invece di fermarsi al codice applicativo:

  > Quando un bug riguarda un asset esterno (immagine, file, upload), la diagnosi FASE 0 non si ferma al codice che lo referenzia: verificare lo stato reale della risorsa (bucket pubblico/privato, oggetto esistente, valore salvato) con query dirette prima di concludere che sia un bug di codice. In questa sessione il codice di scrittura del logo era già corretto — la causa era un valore DB stantio risalente a prima della creazione del bucket pubblico corretto, verificabile solo con query su `storage.buckets`/`storage.objects`, non leggendo il codice applicativo.

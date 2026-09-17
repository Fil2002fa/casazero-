# Handoff — Service worker, offline uniforme · 15/09/2026 09:59

## Sommario
Offline, la shell residente mostrava `offline.html` formattato, mentre la dashboard (super_admin e admin) mostrava HTML grezzo. La causa: il service worker salvava ogni pagina HTML visitata e da offline preferiva quella copia, che però non ha il CSS di Next. Il fix (`f43c380`) toglie il salvataggio delle pagine: quando la rete manca si serve sempre `offline.html`. Il fix elimina anche un problema di privacy, cioè HTML autenticato che restava sul dispositivo dopo il logout.

## Lavoro completato
- [x] FASE 0: diagnosi read-only con riscontri e prove, approvata da Filippo
- [x] Commit `f43c380` "sw: la navigazione offline serve sempre offline.html": il ramo `navigate` usa solo la rete con fallback `offline.html`, e `CACHE` passa da `casazero-v3` a `casazero-v4`
- [x] `npm run verify` pulito: tsc ok, un solo warning lint già presente in `src/app/api/reconcile-documents/route.ts:12`
- [ ] Verifica funzionale su build di produzione nel browser: NON eseguita
- [ ] Verifica su dispositivo con la PWA già installata (sparizione di `casazero-v3`): NON eseguita

## File toccati
### Creati
- `docs/handoffs/HANDOFF_sw_offline_uniforme_09_15_09_59.md` — questo handoff

### Modificati
- `public/sw.js`:
  - riga 1: `CACHE = 'casazero-v4'`. `activate` (righe 11-17) cancella tutte le cache con nome diverso, quindi anche le pagine già salvate in `casazero-v3`.
  - ramo `navigate` (righe 35-43): prima era rete-poi-cache con `c.put` senza controllo `res.ok` e fallback `caches.match(e.request) ?? offline.html`. Ora è `fetch(e.request).catch(() => caches.match('/offline.html'))`.
  - ramo delle risorse statiche (cache-first, con `res.ok`): invariato.

### Letti (solo quelli rilevanti per capire il contesto)
- `public/offline.html` — autosufficiente: stile tutto in `<style>` inline con i colori del design system, nessun link, nessun file `/_next`, nessun font esterno. È corretto e non è stato toccato.
- `src/components/PwaInit.tsx` — registra `/sw.js` solo in produzione (riga 9) e in dev lo disinstalla. Scope di default `/`.
- `src/app/layout.tsx` — riga 3 `import './globals.css'` (unico CSS, con hash di build); riga 48 `<PwaInit />` montato nel layout radice, quindi un solo service worker per entrambe le shell.
- `src/app/(app)/layout.tsx:12` — `redirect('/admin')` per chi non è `client`. Aprendo `/` gli admin facevano un caricamento di pagina intera di `/admin`, che veniva salvato: per questo la dashboard incappava nel problema più spesso.
- `src/middleware.ts:43,63` — `/offline.html` pubblico, `sw.js` e `_next/static` esclusi dal matcher. Nessuna differenza tra le shell.
- `docs/handoffs/HANDOFF_sw_rsc_units_09_14_15_57.md` — il test offline precedente era partito con la cache vuota (riga 54) e non era stato fatto su dispositivo (riga 58).

## Decisioni chiave
- **Nessuna pagina HTML in cache**: offline si serve sempre `offline.html`, identico per residente, admin e super_admin.
  - Alternativa scartata: mettere in cache anche `/_next/static/css`. Gli hash cambiano a ogni deploy, le pagine salvate mostrerebbero dati vecchi, e resterebbe HTML autenticato sul dispositivo.
- **Privacy come metà del valore del commit**: prima, Cache Storage conservava l'HTML autenticato di ogni pagina visitata (fascicolo, unità, dati utenti) anche dopo il logout. Su richiesta di Filippo, l'effetto è scritto esplicitamente nel messaggio di commit.
- **Cambio del nome della cache invece di una pulizia mirata**: basta passare a `casazero-v4` perché `activate` elimini le copie già salvate sui dispositivi esistenti. Non serve codice di migrazione.
- **Fuori scope, non toccato**: il ramo delle risorse statiche ripiega su `offline.html` anche per richieste non HTML (icone, manifest). Oggi è innocuo; va rivalutato se crea problemi.

## Stato attuale
### Funziona
- Il codice di `public/sw.js` non contiene più `c.put` nel ramo `navigate`. Controllo: `Select-String -Path public/sw.js -Pattern 'c\.put|casazero-v'` restituisce solo la riga 1 (`casazero-v4`) e la riga 53 (ramo statico).
- `npm run verify` è passato: tsc senza errori, lint con un solo warning già presente.
- Branch `main`; `git status` lo riporta allineato a `origin/main`.

### Non funziona / da verificare
- Nessuna verifica nel browser: in dev il service worker non gira. Il comportamento offline dopo il fix è dedotto dal codice, non osservato.
- Sui dispositivi con la PWA installata non è verificato che il nuovo service worker si attivi e che `casazero-v3` sparisca.
- `CLAUDE.md` risulta modificato e non committato (10 righe aggiunte, estranee a questa sessione, da una sessione precedente). Non l'ho toccato.
- 7 handoff in `docs/handoffs/` non sono tracciati da git (sessioni del 09/11-09/14).

## Prossimi passi
1. Build di produzione in locale: `npm run build; if ($?) { npm run start }`.
2. Accedi come `pippoloro02` e ricarica `/admin` e `/admin/residences`. In DevTools → Application → Cache Storage deve esserci solo `casazero-v4`, con dentro solo `/offline.html`.
3. In DevTools → Network metti Offline e ricarica `/admin` e `/admin/residences`: deve comparire "Nessuna connessione" con lo stile. Ripeti come `filippoloro02` su `/admin` e come `lorofilippo2002` su `/` e `/manutenzioni`.
4. Dopo il deploy su Vercel, su un dispositivo con la PWA già installata: riapri l'app online, poi controlla che `casazero-v3` non esista più e che offline compaia `offline.html` formattato su ogni rotta.
5. Decidere se committare le 10 righe aggiunte a `CLAUDE.md` e i 7 handoff non tracciati.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (il service worker qui NON gira)
npm run dev

# oppure production (necessario per testare il service worker)
npm run build && npm start

# gate pre-commit
npm run verify
```

## Domande aperte
- Il fallback `offline.html` del ramo statico (sw.js:64) va limitato alle sole richieste HTML, o va bene così?
- Serve in futuro un offline "vero" (per esempio consultare il piano senza rete)? Se sì, va progettato con dati non sensibili o cifrati, non riattivando la cache delle pagine HTML.

## Leggi emerse (candidate per CLAUDE.md)

- **Invarianti**: **Il service worker non mette mai in cache l'HTML delle pagine.** Il ramo `navigate` di `public/sw.js` usa solo la rete e, quando la rete manca, serve `offline.html`. Una pagina salvata conserva HTML autenticato sul dispositivo anche dopo il logout, e senza il CSS di Next (hash per build) si presenta come HTML grezzo. Ogni modifica a ciò che il service worker salva richiede un nuovo nome di `CACHE` (`casazero-vN`), così `activate` ripulisce i dispositivi esistenti.

- **Regole di codice ricorrenti**: **`offline.html` è autosufficiente.** Solo `<style>` inline, nessun riferimento a `/_next/*`, font esterni, classi Tailwind o immagini non presenti in PRECACHE. Qualunque file esterno aggiunto deve essere nella lista PRECACHE di `public/sw.js`, altrimenti offline la pagina si presenta grezza.

- **Metodo di lavoro**: **I test offline del service worker partono da una cache popolata**, mai vuota. Prima visita online le rotte di ogni shell (residente, admin, super_admin) con un caricamento di pagina intera, poi controlla Cache Storage in DevTools, poi passa offline. Un test con la cache vuota nasconde i rami che servono copie salvate. Sempre su build di produzione, perché in dev `PwaInit` disinstalla il service worker.

# Handoff — Route group split (app)/(dashboard) · 20/06/2026 10:00

## Sommario
Questa sessione ha ristrutturato l'app in due shell visive distinte usando i route group di Next.js 15 App Router, senza alterare nessun URL pubblico. Le route `/admin/*` sono state spostate dal gruppo `(app)` (shell mobile con BottomNav) al nuovo gruppo `(dashboard)` (shell desktop con sidebar), eliminando il bug per cui gli amministratori vedevano la navigazione a icone mobile sulle pagine admin.

## Lavoro completato
- [x] Fix toggle `disabled` (commit `7bd40e0`): rimosso attributo HTML `disabled` dal `<button>` Toggle in ProfiloClient.tsx — sostituito con guard JS `onClick={locked || disabled ? undefined : onToggle}` per eliminare il flash rosso nativo del browser su Chrome/Edge Windows
- [x] Spostamento ricorsivo `(app)/admin/` → `(dashboard)/admin/`: tutti i 17 file spostati, zero URL cambiati
- [x] Estratto helper `src/lib/whitelabel.ts`: carica `brandDark` e `logoUrl` del costruttore dalla tabella `builders` — condiviso tra i due layout
- [x] Aggiornato `(app)/layout.tsx`: ora usa `getWhitelabelBrand()`, shell mobile invariata con BottomNav
- [x] Creato `(dashboard)/layout.tsx`: shell desktop con sidebar verde scuro a sinistra e header bianco in alto con logo costruttore; nessuna BottomNav
- [x] Creato `src/components/AdminSidebar.tsx`: client component con link Residenze/Manutenzioni/Impostazioni, evidenziazione path attivo via `usePathname`
- [x] Corretto import in `N3AdminActions.tsx`: puntava ancora a `@/app/(app)/admin/manutenzioni/actions`, aggiornato a `@/app/(dashboard)/admin/manutenzioni/actions`
- [x] Build `npm run build` passata pulita: 0 errori TypeScript, 0 warning, 24 route compilate

## File toccati
### Creati
- `src/lib/whitelabel.ts` — helper async `getWhitelabelBrand()`: legge `profiles.builder_id` → `builders.primary_color` / `logo_url`; restituisce `{ brandDark, logoUrl }` con defaults se utente non autenticato o builder non trovato
- `src/app/(dashboard)/layout.tsx` — shell desktop: `flex h-screen`, sidebar a sinistra (`<AdminSidebar />`), header bianco in alto con logo/fallback, `<main>` scrollabile, CSS vars white-label applicate
- `src/components/AdminSidebar.tsx` — sidebar client component: 3 link nav (Building2/Wrench/Settings icons), `usePathname` per active state, colore sfondo via `var(--wl-brand-dark)`, testo bianco/semitrasparente

### Modificati
- `src/app/(app)/layout.tsx` — semplificato: rimossa logica white-label inline, ora chiama `getWhitelabelBrand()`; shell mobile e BottomNav invariate
- `src/components/N3AdminActions.tsx` — import path `actions.ts` aggiornato da `(app)` a `(dashboard)`

### Rinominati (git rename, contenuto invariato)
- Tutti i 17 file sotto `src/app/(app)/admin/**` → `src/app/(dashboard)/admin/**`

### Letti
- `src/app/(app)/layout.tsx` — per capire la logica white-label da estrarre
- `src/components/BottomNav.tsx` — per capire il pattern client component con `usePathname`, replicato in AdminSidebar

## Decisioni chiave
- **Mostrare tutti i link nella sidebar senza filtrare per ruolo**: il layout server non legge il ruolo dell'utente per semplicità. Tutti e 3 i link sono sempre visibili; `requireRole()` nei singoli page.tsx gestisce già l'accesso non autorizzato redirigendo a `/`. Alternativa scartata: query aggiuntiva al profilo nel layout per filtrare — overhead non necessario in v1.
- **Logo solo nell'header, non nella sidebar**: struttura scelta è sidebar pura (solo nav) + header separato con logo. Alternativa: logo in cima alla sidebar stessa — scartata perché avrebbe richiesto di passare `logoUrl` alla sidebar come prop, accoppiandola alla logica brand.
- **Helper `getWhitelabelBrand` separato da `requireProfile`**: non è stato esteso `lib/auth.ts` per evitare di mescolare auth e branding; il nuovo file `lib/whitelabel.ts` è autonomo.
- **`var(--wl-brand-dark)` per colore sidebar**: la sidebar usa `style={{ backgroundColor: 'var(--wl-brand-dark)' }}` invece di hardcodare `#04342C`, così il white-label funziona anche per la shell admin senza prop aggiuntive.

## Stato attuale
### Funziona
- `npm run build` passa pulito (verificato in questa sessione, commit `792aef2`)
- Tutti gli URL `/admin/*` invariati — Next.js route groups non compaiono nell'URL
- Route gruppo `(app)`: `/`, `/documenti`, `/fascicolo`, `/manutenzioni`, `/manutenzioni/[id]`, `/profilo` — shell mobile con BottomNav
- Route gruppo `(dashboard)`: `/admin/**` — shell desktop con sidebar + header
- Import `N3AdminActions` corretto (era l'unico riferimento esterno al vecchio path)
- Toggle profilo: nessun flash rosso su Chrome/Edge Windows

### Non funziona / da verificare
- **Test visivo non eseguito**: la shell dashboard non è stata verificata a browser. Dev server non avviato in questa sessione — da aprire `/admin/residences` per vedere la sidebar in azione
- **Ruoli nella sidebar**: tutti e 3 i link sono sempre visibili; un `admin` (non super_admin) vede anche "Residenze" ma viene rediretto se ci clicca — non è un bug ma non è ottimale per UX
- **Logo costruttore nell'header**: funziona solo se `builders.logo_url` è popolato nel DB; il fallback è il testo "CasaZero"
- **Migrazione 007 (`notification_prefs` JSONB)**: file SQL esiste in `supabase/migrations/007_notification_prefs.sql` ma deve essere applicata manualmente nel SQL Editor Supabase prima di usare le preferenze notifiche

## Prossimi passi
1. **Aprire il dev server e verificare visivamente la shell admin** (`npm run dev` → navigare a `/admin/residences`): verificare che la sidebar compaia, che i link attivi si evidenzino, che il BottomNav non sia presente
2. **Applicare migrazione 007** nel SQL Editor Supabase: incollare il contenuto di `supabase/migrations/007_notification_prefs.sql` e cliccare Run — necessario per le preferenze notifiche nel Profilo
3. **Sidebar con filtro ruolo (opzionale)**: se l'UX con i link sempre visibili per l'admin è un problema, aggiungere una query al ruolo in `(dashboard)/layout.tsx` e passare `role` come prop ad `AdminSidebar` per nascondere "Residenze" agli `admin`
4. **Sidebar mobile admin (se necessario)**: la shell dashboard è solo desktop; se gli admin accedono da mobile manca la nav. Valutare se aggiungere un hamburger/drawer per schermi piccoli

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Build di verifica
npm run build

# Type check standalone
npx tsc --noEmit
```

## Domande aperte
- L'admin di condominio deve vedere "Residenze" nella sidebar? Attualmente sì (sempre visibile) ma il link lo rimanda a `/` se ci clicca — decidere se filtrare in `(dashboard)/layout.tsx` o lasciare così
- La shell dashboard deve essere responsive (mobile)? In v1 gli admin usano probabilmente desktop, ma nessuna scelta esplicita è stata presa
- Il link "Impostazioni" (`/admin/settings`) è visibile a entrambi i ruoli ma forse dovrebbe essere solo `super_admin` — verificare `requireRole` in `settings/page.tsx`

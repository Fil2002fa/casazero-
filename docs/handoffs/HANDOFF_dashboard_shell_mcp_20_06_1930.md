# Handoff — Dashboard shell + MCP Supabase · 20/06/2026 19:30

## Sommario
Questa sessione ha completato la ristrutturazione dell'app in due shell visive distinte (`(app)` residente mobile, `(dashboard)` admin desktop) con routing rigoroso per ruolo, ha risolto i problemi della sidebar admin non filtrata per ruolo e dei redirect errati, e ha attivato l'integrazione MCP Supabase applicando la migrazione 007 direttamente dal progetto. Il codebase è al suo stato più pulito: build verde, 5 commit di rifinitura post-M5, DB allineato.

## Lavoro completato
- [x] Split route group `(app)` / `(dashboard)`: admin ora nella shell desktop con sidebar, niente BottomNav
- [x] Helper `src/lib/whitelabel.ts`: logica white-label estratta e condivisa tra i due layout
- [x] `src/lib/auth.ts`: aggiunto `homePathForRole(role)` e parametro `fallbackPath` opzionale a `requireRole()`
- [x] `src/app/auth/callback/route.ts`: dopo login redirect a `homePathForRole(role)` (admin → `/admin`, client → `/`)
- [x] `(app)/layout.tsx`: guard che redirige admin/super_admin a `/admin` se entrano nella shell residente
- [x] Sidebar role-aware: `AdminSidebar` riceve `role` dal layout server; super_admin vede 3 link, admin solo Manutenzioni
- [x] Redirect corretto per pagine super_admin-only: `requireRole(['super_admin'], '/admin/manutenzioni')` invece di `/`
- [x] Fallback testo costruttore nell'header dashboard quando `logoUrl` è null
- [x] `next.config.ts`: aggiunto `images.remotePatterns` per il dominio Supabase Storage (`kuvekkseclhhcamojysj.supabase.co`)
- [x] MCP Supabase attivato (`claude mcp add --transport http --scope local`)
- [x] Migrazione `007_notification_prefs` applicata al DB via MCP — colonna `notification_prefs JSONB NOT NULL DEFAULT {...}` su `profiles`
- [x] Verifica DB: colonna presente, 4 profili hanno il valore corretto (1 con preferenze personalizzate, 3 con default)
- [x] Build `npm run build` verde su tutti i commit

## File toccati
### Creati
- `src/lib/whitelabel.ts` — helper `getWhitelabelBrand()`: carica `primary_color`, `logo_url`, `name` dal builder; ora restituisce anche `builderName`
- `src/app/(dashboard)/layout.tsx` — shell desktop: sidebar + header con logo/builderName, CSS vars white-label
- `src/components/AdminSidebar.tsx` — sidebar client component, role-aware, active link via `usePathname`
- `docs/handoffs/HANDOFF_route_groups_20_06_1000.md` — handoff sessione precedente

### Modificati
- `src/lib/auth.ts` — aggiunto `homePathForRole()`, `requireRole()` ora accetta `fallbackPath` opzionale
- `src/app/auth/callback/route.ts` — redirect post-login basato su ruolo
- `src/app/(app)/layout.tsx` — usa `getWhitelabelBrand()`, guard role → redirect `/admin`
- `src/components/AdminSidebar.tsx` — accetta prop `role`, filtra nav items
- `src/components/N3AdminActions.tsx` — import aggiornato da `(app)/admin` a `(dashboard)/admin`
- `src/app/(dashboard)/admin/residences/page.tsx` — `requireRole(['super_admin'], '/admin/manutenzioni')`
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — idem
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — idem
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — idem
- `next.config.ts` — `images.remotePatterns` per Supabase Storage
- `CLAUDE.md` — modificato localmente (non committato, vedere sezione sotto)

### Rinominati (git rename, contenuto invariato)
- Tutti i 17 file `src/app/(app)/admin/**` → `src/app/(dashboard)/admin/**`

## Decisioni chiave
- **Sidebar filtra per ruolo lato server**: il layout `(dashboard)` chiama `getProfile()` e passa `role` ad `AdminSidebar` come prop — evita che l'admin veda link cliccabili ma non accessibili (prima causava pagina bianca + rimbalzo)
- **`fallbackPath` su `requireRole`**: invece di creare una nuova funzione `requireSuperAdmin()`, si è aggiunto un parametro opzionale a `requireRole` — minima modifica, massima retrocompatibilità
- **`homePathForRole` accetta `string | null | undefined`**: non richiede il tipo `UserRole` stretto, gestisce qualsiasi ritorno dal DB in modo sicuro
- **MCP Supabase in scope `local`**: configurato solo per questo progetto (`C:\progetti\casazero`), non globale — credenziali non esposte ad altri progetti

## Stato attuale
### Funziona
- Build `npm run build` pulita (0 errori, 0 warning TypeScript) — verificato sull'ultimo commit `8cc05dd`
- Routing per ruolo: client → shell mobile `/`, admin → shell desktop `/admin/manutenzioni`, super_admin → `/admin/residences`
- Sidebar: super_admin vede Residenze + Manutenzioni + Impostazioni; admin vede solo Manutenzioni
- Pagine super_admin-only reindirizzano admin a `/admin/manutenzioni` (no flash bianco)
- Header dashboard mostra logo costruttore o nome testo come fallback
- MCP Supabase attivo e funzionante (list_tables, apply_migration, execute_sql testati)
- Migrazione 007 applicata: `profiles.notification_prefs JSONB NOT NULL DEFAULT {...}` presente nel DB Supabase
- Dev server avviato (porta variabile: 3000 o superiore se occupata)

### Non funziona / da verificare
- **`CLAUDE.md` modificato localmente ma non committato**: `git status` mostra `modified: CLAUDE.md` — verificare le modifiche prima di committare (potrebbero essere cambiamenti automatici del sistema)
- **Test visivo della shell dashboard non eseguito a browser**: sidebar e header non verificati graficamente in questa sessione
- **`/admin/settings` e `/admin/residences/new` sono client component senza `requireRole` server-side**: il guard è solo nelle actions, non nella page — gap di sicurezza minore, fuori scope per ora
- **Preferenze notifiche nel Profilo**: UI completata e DB pronto, ma non testato il flusso end-to-end (toggle → salvataggio → ricarica)
- **MCP Supabase richiede riavvio di Claude Code** per essere attivo in sessioni future — nella sessione corrente è già attivo

## Prossimi passi
1. **Verificare `CLAUDE.md` modificato**: eseguire `git diff CLAUDE.md` per capire cosa è cambiato, poi committare o ripristinare
2. **Test visivo shell dashboard**: aprire `/admin/residences` e `/admin/manutenzioni` a browser, verificare sidebar, logo, navigazione attiva
3. **Test preferenze notifiche**: aprire `/profilo`, cambiare un toggle, ricaricare la pagina, verificare che il valore persista (DB ora ha la colonna)
4. **Aggiungere `requireRole` server-side a `/admin/settings`**: la page è client component, manca il guard; valutare se aggiungere un wrapper server o spostare la guard nelle actions
5. **Seed / invite QR**: verificare che il flusso `/welcome/[token]` funzioni ancora con i ruoli corretti dopo i redirect changes

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Build di verifica
npm run build

# Type check standalone
npx tsc --noEmit

# Verifica CLAUDE.md modificato
git diff CLAUDE.md
```

## Domande aperte
- Cosa ha modificato `CLAUDE.md` localmente? È una modifica automatica (es. `/insights`) o intenzionale?
- La shell dashboard deve essere responsive (mobile)? In v1 gli admin usano desktop, ma non è stato deciso
- L'admin di condominio deve poter accedere a `/admin/settings`? Attualmente la page è client-only, le actions probabilmente hanno il check — chiarire il requisito
- Dopo il deploy su Vercel, il `next.config.ts` aggiornato richiede un redeploy per caricare le immagini Supabase Storage correttamente

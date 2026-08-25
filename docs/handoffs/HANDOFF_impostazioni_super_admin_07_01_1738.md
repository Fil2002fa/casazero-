# Handoff — Impostazioni super_admin (sidebar + logo + Identità) · 01/07/2026 17:38

## Sommario
Rifinitura M5 della shell super_admin `(dashboard)`: riportata la sidebar allo schema
"Approccio A" (Residenze, Amministratori, Attività, Impostazioni), risolto il logo rotto
nell'header e avviata la costruzione delle nuove Impostazioni partendo dal Tab 1 "Identità
costruttore" (aggiunti email e telefono di contatto, con relativa migrazione DB). I 4 tab
completi e la pagina `/admin/attivita` restano da fare.

## Lavoro completato
- [x] FASE 0 — diagnosi read-only di sidebar, layout, whitelabel, route `/admin/**` (gap vs Approccio A)
- [x] Fix logo header: sostituito `<Image src={logoUrl}>` con foglia SVG inline (no storage, no whitelabel)
- [x] Sidebar super_admin Approccio A: aggiunta voce **Attività** con badge "test" + divider prima di Impostazioni + riordino
- [x] Migrazione `010_builders_contact.sql` (contact_email, contact_phone) — **applicata a mano su Supabase**
- [x] Tab 1 "Identità costruttore": aggiunti campi Email di contatto e Telefono assistenza, precompilati e salvati
- [ ] Struttura a 4 tab delle Impostazioni (oggi pagina ancora piatta) — non iniziata
- [ ] Pagina `/admin/attivita` (linkata dalla sidebar ma route inesistente) — non iniziata

## File toccati
### Creati
- `supabase/migrations/010_builders_contact.sql` — aggiunge `contact_email` e `contact_phone` (TEXT, nullable) a `builders` con `ADD COLUMN IF NOT EXISTS`. **Già applicata.**
- `src/app/(dashboard)/admin/settings/SettingsForm.tsx` — form client estratto dalla vecchia `page.tsx`, con i 4 campi Identità (nome, colore, email, telefono) precompilati via props; upload logo invariato.

### Modificati
- `src/app/(dashboard)/layout.tsx` — logo header ora è una foglia SVG inline colorata `var(--wl-brand-dark, #04342C)`; rimosso `import next/image`. `logoUrl` resta usato nella CSS var `--wl-logo`.
- `src/components/AdminSidebar.tsx` — introdotto tipo `NavItem` (con `badge?`, `dividerBefore?`); `SUPER_ADMIN_ITEMS` ora ha Attività (`/admin/attivita`, icona `Activity`, badge "test") e divider prima di Impostazioni. `ADMIN_ITEMS` invariato nei contenuti.
- `src/app/(dashboard)/admin/settings/page.tsx` — da client a **server component**: `requireRole(['super_admin'])`, carica `name, primary_color, contact_email, contact_phone` da `builders` e li passa a `SettingsForm`.
- `src/app/(dashboard)/admin/settings/actions.ts` — `updateBuilderSettings` salva anche `contact_email`/`contact_phone` (stringa vuota → `null`); `updateData` ora `Record<string, string | null>`.

### Letti (contesto rilevante)
- `src/lib/whitelabel.ts` — capito che `logoUrl` viene da `builders.logo_url` (public URL su bucket privato → causa del logo rotto).
- `supabase/migrations/005_m3.sql` — confermato bucket `documents` con `public = false` (causa-radice logo rotto).
- `src/app/(app)/profilo/actions.ts` + `ProfiloClient.tsx` — pattern riusabile per i futuri Tab Notifiche/Profilo account.
- `src/app/(dashboard)/admin/administrators/page.tsx` — confermato che la lista globale amministratori esiste già (nessun lavoro necessario).
- `src/lib/auth.ts` — firma di `requireRole`/`getProfile` per la nuova `page.tsx` server.

## Decisioni chiave
- **Logo = foglia SVG verde brand, non bianca**: il task chiedeva bianca "su header verde", ma l'header è `bg-white`; una foglia bianca sarebbe invisibile. Scelto `var(--wl-brand-dark)` come il testo `builderName` accanto. L'SVG inline elimina del tutto la dipendenza dal bucket privato (che rispondeva 400).
- **Split `page.tsx` server + `SettingsForm.tsx` client**: necessario per precompilare i campi con i valori DB (un client component non può caricare dati server-side). Coerente col pattern `profilo/page.tsx` + `ProfiloClient.tsx`. Scartato: mantenere tutto client con `useEffect` fetch.
- **Badge "test" neutro** (`bg-white/15 text-white/70`) invece di ambra: deve leggersi come "dato demo", non come warning.
- **Campi contatto svuotabili** (`'' → null`): poiché il form è precompilato, un salvataggio senza modifiche riscrive gli stessi valori e non azzera nulla.
- **Migrazione separata dal codice**: file SQL scritto e applicato a mano prima di scrivere il codice che lo usa (convenzione CLAUDE.md §13).

## Stato attuale
### Funziona
- `npm run build` verde su tutti e 3 i commit della sessione.
- Sidebar super_admin mostra le 4 voci nell'ordine corretto con divider e badge.
- Logo header renderizza la foglia SVG (niente più broken image).
- Tab 1 Identità salva e precompila nome, colore, email, telefono (migrazione applicata).

### Non funziona / da verificare
- **Non verificato a runtime nel browser**: build verde ma nessun test manuale del salvataggio email/telefono end-to-end.
- **`/admin/attivita` è un link morto**: la voce sidebar punta a una route che non esiste ancora (atteso, va creata).
- Le Impostazioni sono ancora una **pagina piatta**: mancano i Tab 2 (Notifiche ricevute), 3 (Profilo account), 4 (Sicurezza/password). Il Tab 4 (cambio password) non esiste da nessuna parte nel codice.
- Prima build della sessione fallita per cache `.next` corrotta su Windows (`Cannot find module './611.js'`); risolta con `Remove-Item -Recurse -Force .next` + rebuild. Non correlata al codice.

## Prossimi passi
1. Creare la pagina `/admin/attivita` con dati di test per la demo (badge "test" già presente in sidebar).
2. Trasformare `/admin/settings` in shell a 4 tab: Tab 1 Identità (già pronto, da spostare nel tab), Tab 2 Notifiche ricevute (riusare pattern `profilo` con eventi rilevanti per super_admin), Tab 3 Profilo account (nome/email utente Furlan), Tab 4 Sicurezza (cambio password via `supabase.auth.updateUser` — da creare ex-novo).
3. Verifica manuale in browser: salvataggio email/telefono, persistenza dopo reload, precompilazione.
4. `/handoff` e commit finale su build verde.

## Comandi da rilanciare
```bash
# Dev server (in finestra PowerShell separata e persistente)
cd C:\progetti\casazero
npm run dev

# Build di verifica (se fallisce con "Cannot find module": pulisci la cache)
npm run build
# Rimedio cache corrotta Windows:
Remove-Item -Recurse -Force .next; npm run build
```

## Domande aperte
- Per il Tab 2 "Notifiche ricevute" del super_admin: quali eventi sono rilevanti? (le preferenze residente `PREF_ROWS` sono su N2/N3, documenti, commenti — vanno ridefinite per il costruttore).
- Il logo caricato via upload nelle Impostazioni (`builders.logo_url`) ora non è più usato nell'header dashboard: va rimossa anche la sezione "Logo" dal form, o serve ancora per l'app residente? Da chiarire prima di ripulire.
- La pagina `/admin/attivita`: dati puramente statici/mock o serve una tabella `activity`/`notifications` reale già esistente?

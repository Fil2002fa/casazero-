# Handoff — M5 Rifinitura · 18/06/2026 14:40

## Sommario
Questa sessione ha completato la milestone M5 di CasaZero, aggiungendo le tre funzionalità finali richieste per la demo con Furlan Costruzioni: report PDF annuale on-demand (generato lato server con @react-pdf/renderer), pagina Profilo completa con gestione familiari e inviti QR, e seed SQL idempotente per la Residenza Cavaccio con 14 unità, fornitori, completions e documenti demo. Sono stati risolti anche alcuni bug di autenticazione (callback OAuth con guard "no_access") e migliorati il service worker PWA e la pagina Fascicolo con il bottone di download PDF.

## Lavoro completato
- [x] Report PDF annuale (`src/lib/pdf/ReportDocument.tsx` + `src/app/api/report/route.ts`) — scope unit e residence, white-label, palette C, conformità %
- [x] Pagina Profilo refactored (`ProfiloClient.tsx` + `actions.ts`) — editing nome/telefono, lista membri familiari, generazione/revoca inviti QR con limite anti-abuso
- [x] Fascicolo: aggiunto bottone "Scarica report PDF" con `<Link href={reportHref}>` che rispecchia esattamente lo stesso scope dei numeri conformità a schermo
- [x] Seed demo Residenza Cavaccio (`supabase/seed_cavaccio_demo.sql`) — 4 fornitori, completions storiche (2 anni), documenti per categoria, stato manutenzioni realistico
- [x] Auth callback (`src/app/auth/callback/route.ts`) — guard che reindirizza a `?error=no_access` se utente non ha nessuna associazione valida
- [x] Service worker (`public/sw.js`) — miglioramenti caching e notifiche push
- [x] `manutenzioni/actions.ts` — aggiunta action `completeN2` con upload allegato
- [x] `admin/residences/new` — fix wizard creazione residenza e generazione maintenance_items dal template

## File toccati
### Creati
- `src/lib/pdf/ReportDocument.tsx` — componente @react-pdf/renderer con intestazione white-label, sezione conformità, timeline completions, tabella voci scadute
- `src/app/api/report/route.ts` — API route GET `/api/report?scope=unit|residence&id=UUID`; runtime nodejs (incompatibile con Edge), auth + RLS manuale, genera e restituisce PDF
- `src/app/(app)/profilo/ProfiloClient.tsx` — componente client per Profilo: editing profilo, familiari, inviti QR con copia link
- `src/app/(app)/profilo/actions.ts` — server actions: `updateProfile`, `createFamilyInvite` (max 5 attivi), `revokeFamilyInvite`, `signOut`
- `supabase/seed_cavaccio_demo.sql` — seed idempotente per presentazione Furlan; richiede `seed_dev.sql` già eseguito

### Modificati
- `src/app/(app)/fascicolo/page.tsx` — aggiunto calcolo `reportHref` per ruolo (client→unit, admin/super→residence) e bottone "Scarica report PDF" con FileDown
- `src/app/(app)/profilo/page.tsx` — refactored: carica unit, members, inviti con QR code (qrcode npm), passa tutto a ProfiloClient
- `src/app/(app)/manutenzioni/actions.ts` — aggiunta `completeN2` con upload allegato su Supabase Storage
- `src/app/auth/callback/route.ts` — aggiunta logica: se utente non ha unit_members né ruolo, signOut + redirect `?error=no_access`
- `src/app/(app)/admin/residences/new/actions.ts` — fix generazione maintenance_items al momento della creazione residenza
- `src/app/(app)/admin/residences/new/page.tsx` — aggiustamento wizard UI
- `src/app/(app)/admin/residences/[id]/units/UnitsManager.tsx` — fix UI lista unità
- `src/app/auth/login/LoginForm.tsx` + `src/app/auth/login/page.tsx` — gestione messaggio `error=no_access`
- `src/components/PwaInit.tsx` — fix subscription push
- `src/middleware.ts` — aggiunta rotta `/api/report` alla allowlist pubblica/auth
- `public/sw.js` — revisione strategia caching e gestione notifiche
- `package.json` / `package-lock.json` — aggiunta dipendenza `@react-pdf/renderer`, `qrcode`, `@types/qrcode`
- `.claude/settings.local.json` — aggiornamento permessi

### Letti (rilevanti per il contesto)
- `src/lib/supabase/admin.ts` — pattern `createServiceClient()` usato ovunque per bypass RLS
- `src/lib/auth.ts` — `requireProfile()` usato nel Fascicolo

## Decisioni chiave
- **runtime nodejs per /api/report**: @react-pdf/renderer usa API Node.js non disponibili su Edge. Aggiunto `export const runtime = 'nodejs'` e `export const dynamic = 'force-dynamic'` per evitare caching statico del PDF.
- **Stesso scope tra schermo e PDF**: la conformità % calcolata nel Fascicolo e quella nel PDF usano la stessa logica (filtro `unit_id.eq.X,unit_id.is.null` per unit-scope). Scelta deliberata per evitare disallineamenti nella demo.
- **Anti-abuso inviti familiari**: max 5 inviti attivi per unità, verificato con `count` tramite service client per evitare race condition con RLS.
- **Seed idempotente**: il seed Cavaccio cancella solo completions/documents/suppliers della residenza target, non tocca maintenance_items di struttura né altre residenze. Può essere ri-eseguito senza effetti collaterali.

## Stato attuale
### Funziona
- Generazione PDF on-demand per unit e residence (verificato compilazione TypeScript)
- Pagina Profilo con editing, familiari, inviti QR
- Auth callback con guard no_access
- Seed SQL Residenza Cavaccio (idempotente, da eseguire nel SQL Editor Supabase)

### Non funziona / da verificare
- **PDF non testato end-to-end** in produzione: da verificare che `renderToBuffer` funzioni su Vercel (alcune versioni di @react-pdf/renderer hanno problemi con font embedding in ambiente serverless)
- **Service worker / push notifications**: le modifiche a `sw.js` e `PwaInit.tsx` non sono state testate su dispositivo reale
- **Cron notifiche**: il job giornaliero per scadenze è descritto in spec ma non è stato implementato in questa sessione (scope M2, potrebbe mancare il cron Vercel/Supabase)
- **Seed demo**: il file `seed_cavaccio_demo.sql` va eseguito manualmente nel SQL Editor di Supabase; non è integrato nel flow di migrazione automatica
- **Login `error=no_access`**: verificare che il messaggio di errore venga visualizzato correttamente nella UI

## Prossimi passi
1. Eseguire `seed_cavaccio_demo.sql` nel Supabase SQL Editor del progetto (richiede che `seed_dev.sql` sia già stato eseguito)
2. Testare il download PDF da `/fascicolo` loggandosi come client (unità) e come admin (residenza)
3. Verificare il comportamento del PDF su Vercel deploy (se fallisce, valutare `puppeteer` come alternativa a @react-pdf/renderer)
4. Testare il flusso completo di onboarding QR dalla demo Cavaccio: scansione → accettazione invito → profilo con unità associata
5. Fare un commit di tutto il working tree non committato (15 file modificati + 5 nuovi) prima della presentazione

## Comandi da rilanciare
```bash
# Installa dipendenze (aggiunta @react-pdf/renderer, qrcode)
npm install

# Avvia il server di sviluppo
npm run dev

# Build di produzione (verifica che @react-pdf/renderer non rompa il build)
npm run build

# Seed demo Residenza Cavaccio (eseguire nel SQL Editor Supabase, non da CLI)
# File: supabase/seed_cavaccio_demo.sql
```

## Domande aperte
- Il cron giornaliero per il ricalcolo delle scadenze (`czero_recalc_due`) è un trigger Supabase o un Vercel cron? Va implementato prima della demo?
- Il seed Cavaccio include utenti reali con email? Se sì, come si gestisce il login demo (magic link o account hardcoded)?
- Il PDF deve includere anche il logo del costruttore (attualmente solo nome e colore primario)? L'API `logo_url` è presente nel modello ma non viene renderizzata nel documento PDF per limitazioni di @react-pdf/renderer con URL remoti.

# Handoff — Home residente (blocchi caso "tutto in ordine") + prep foto residenza · 05/07/2026 15:56

## Sommario
Sessione dedicata al ridisegno della home del residente e alla preparazione della foto di residenza. Sono stati chiusi due commit sulla home (blocco "Prossima manutenzione" + teaser fascicolo nel caso vuoto, poi rimozione delle card ridondanti Documenti/Fascicolo) e scritta — ma NON applicata — la migration per un bucket Storage pubblico dedicato alle foto delle facciate, così che il public URL carichi davvero in un `<img>`.

## Lavoro completato
- [x] Commit `f05f985` — home residente: blocco "Prossima manutenzione" (prossimo item datato futuro, promemoria escluse) + teaser fascicolo cliccabile; riempiono il caso "tutto in ordine" (nessuno scaduto)
- [x] Commit `bf29eab` — rimossa la sezione "Accessi rapidi" (card Documenti + Fascicolo) dalla home: ridondante con BottomNav e col nuovo teaser
- [x] Helper condivisi introdotti: `src/lib/pluralize.ts` (nuovo), `formatRelativeDue()` in `maintenance-status.ts`, `formatFrequency` refattorizzato per usare `pluralize`, `OBLIGATION_LABELS` esportato da `MaintenanceBadge`
- [x] FASE 0 read-only completa sulla foto residenza (schema, home, storage, pattern logo, superficie dashboard)
- [x] Migration `014_residence_photos_bucket.sql` SCRITTA (bucket pubblico `residence-photos`) — **non applicata al DB**
- [ ] Commit 3b (server action upload foto + UI in dashboard residenza) — non iniziato
- [ ] Applicazione manuale della migration `014` nel SQL Editor di Supabase — a carico di Filippo

## File toccati
### Creati
- `src/lib/pluralize.ts` — pluralizzazione italiana condivisa: `pluralize(n, singular, plural)` → "1 mese"/"3 mesi". Fonte unica, mai inline
- `supabase/migrations/014_residence_photos_bucket.sql` — bucket Storage pubblico `residence-photos` (public=true, MIME jpeg/png/webp, 5 MB) + policy storage.objects: SELECT pubblica, INSERT solo super_admin (`public.czero_user_role() = 'super_admin'`), DELETE owner. **Untracked, non committato, non applicato**
- `docs/handoffs/HANDOFF_home_residente_foto_07_05_15_56.md` — questo documento

### Modificati (già committati)
- `src/app/(app)/page.tsx` — aggiunti blocco "Prossima manutenzione" (informativo, non azione di completamento) e teaser fascicolo; poi rimossa la sezione "Accessi rapidi" e l'import orfano `FolderOpen`. Query "prossima manutenzione" in parallelo (RLS), query count fascicolo con perimetro unità + condominio
- `src/lib/maintenance-status.ts` — aggiunta `formatRelativeDue(dueISO, today)` → "tra 6 giorni · 10 lug 2026" / "tra 3 mesi · …"; import di `pluralize`
- `src/lib/formatFrequency.ts` — ora usa `pluralize` (output invariato)
- `src/components/MaintenanceBadge.tsx` — `OBLIGATION_LABELS` reso `export` per riuso in home (A→Obbligo di legge, B→Raccomandata, C→Consiglio)

### Letti (rilevanti per il contesto)
- `supabase/migrations/001_schema.sql` — `residences.photo_url TEXT` esiste già (riga 35); `profiles.id` è la PK legata ad `auth.users(id)`, `profiles.role user_role` con `'super_admin'`
- `supabase/migrations/002_rls.sql` — pattern controllo ruolo `public.czero_user_role()`; policy SELECT/INSERT completions (righe 310-333)
- `supabase/migrations/004_storage.sql`, `005_m3.sql` — bucket `attachments` e `documents`, entrambi **privati** (public=false); forma delle policy storage.objects
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` + `settings/actions.ts` — pattern upload logo costruttore (upload reale su bucket `documents` + `getPublicUrl` + scrittura `builders.logo_url`); bug noto: bucket privato → public URL 400
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — pagina dettaglio residenza (super_admin), read-only; seleziona `id, name, address, energy_class` (NON `photo_url`)
- `src/app/api/download/route.ts` — path di lettura file funzionante: signed URL 1h + redirect
- `src/app/(app)/fascicolo/page.tsx` — perimetro "Tutti" per client (unità + condominio), riferimento per allineare il count del teaser

## Decisioni chiave
- **"Prossima manutenzione" = solo item datati futuri, promemoria escluse**: la selezione filtra `resolveCompletionMode !== 'promemoria'` e `next_due_date >= today`; se non esiste alcun item datato futuro il blocco non compare. Scartato il fallback che mostrava una promemoria (una promemoria non ha mai scadenza)
- **Teaser fascicolo con perimetro identico a /fascicolo tab "Tutti"**: `residence_id = mia residenza AND (unit_id = mia unità OR unit_id IS NULL)`, via `createClient` (RLS), mai service client. Verifica empirica per lorofilippo2002: teaser=11 == StatBox "Totali"=11. Allineamento futuro garantito da un commento vincolante in `page.tsx` (estrazione in helper condiviso scartata per non refattorizzare /fascicolo)
- **Asse canonico `completion_mode`, non legacy `priority`**: i nuovi blocchi usano `resolveCompletionMode`/`isCountable` (helper condiviso) invece del ramo `N1` che le vecchie card usano ancora
- **Bucket foto PUBBLICO dedicato invece di riuso di `documents`**: i bucket esistenti sono privati e `getPublicUrl` su bucket privato risponde 400 (bug già documentato nel logo costruttore). Un bucket `residence-photos` con `public=true` fa sì che l'URL carichi in un `<img>` senza auth. Alternativa scartata: signed URL/path via `/api/download` (più complessa per un asset non sensibile)
- **Upload foto su path unici, non upsert su path fisso**: i bucket esistenti non hanno UPDATE policy, quindi un `upsert` che sovrascrive fallirebbe l'RLS. La server action 3b dovrà usare `${residenceId}/${Date.now()}.ext` (come gli allegati completions)

## Stato attuale
### Funziona
- Home residente: build/`tsc --noEmit` verdi su entrambi i commit; caso "tutto in ordine" ora mostra Prossima manutenzione + teaser fascicolo
- Teaser count verificato empiricamente == StatBox /fascicolo (11 per lorofilippo2002, ultimo luglio 2026)
- Documenti/Fascicolo restano raggiungibili dalla BottomNav dopo la rimozione delle card (nessun vicolo cieco)
- La card residenza nella home è GIÀ pronta a mostrare la foto: `<img src={photoUrl}>` con fallback sul nome, legge `residences.photo_url`

### Non funziona / da verificare
- La migration `014` NON è ancora applicata: finché Filippo non la esegue nel SQL Editor, il bucket `residence-photos` non esiste
- Nessuna UI di upload foto ancora: `residences.photo_url` non è popolabile dalla dashboard (commit 3b da fare)
- La pagina dettaglio residenza NON seleziona ancora `photo_url` e non ha form di modifica: l'upload foto è UI net-new

## Prossimi passi
1. Filippo applica `supabase/migrations/014_residence_photos_bucket.sql` a mano nel SQL Editor di Supabase e verifica che il bucket `residence-photos` risulti pubblico
2. Committare la migration `014` (attualmente untracked) — separatamente o insieme al 3b secondo preferenza
3. Commit 3b: server action `updateResidencePhoto` (gate super_admin, upload su `residence-photos` con path unico `${residenceId}/${Date.now()}.ext`, `getPublicUrl` → `residences.photo_url`, revalidate) + UI di upload nella zona identità di `admin/residences/[id]/page.tsx` (aggiungere `photo_url` alla select della pagina)
4. Verifica end-to-end: caricare una foto come super_admin e confermare che il residente la vede come hero nella home

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Build di verifica prima di ogni commit
npm run build
# oppure typecheck rapido
npx tsc --noEmit
```

## Domande aperte
- Commit 3b: l'upload foto va SOLO nel dettaglio residenza esistente, o anche nel wizard di creazione (`residences/new/page.tsx`)?
- Serve un pulsante "Rimuovi foto" (come per il logo costruttore) o basta "Sostituisci"?
- Vincolo di dimensione/aspect ratio lato client per l'hero, o si accetta qualsiasi immagine entro 5 MB?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice ricorrenti (bug class note)**: `getPublicUrl()` su un bucket Storage PRIVATO restituisce un URL che risponde 400 (non carica in un `<img>`). Se un asset deve essere mostrato pubblicamente (es. foto residenza come hero), usare un bucket con `public = true`; per gli asset sensibili restare su bucket privato + signed URL via `/api/download`. Mai affidarsi al public URL di un bucket privato.

- **Sezione Regole di codice ricorrenti (bug class note)**: i bucket Storage del progetto non hanno UPDATE policy su `storage.objects` (solo SELECT/INSERT/DELETE). Un `upload(..., { upsert: true })` che SOVRASCRIVE un file esistente può fallire l'RLS. Caricare sempre su path unici (`${id}/${Date.now()}.ext`), come fanno gli allegati completions, invece di un path fisso con upsert.

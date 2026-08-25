# Handoff — Foto residenza (upload super_admin) · 06/07/2026 16:16

## Sommario
Implementata end-to-end la funzione con cui il super_admin carica la foto della facciata
di una residenza dalla pagina di dettaglio dashboard: nuovo bucket Storage pubblico
`residence-photos`, server action `updateResidencePhoto`, componente client di upload,
e hardening progressivo (policy RLS UPDATE per la sostituzione via upsert, cache-buster
sull'URL, reset stato UI, limite dimensione 5 MB allineato su config/client/server).
La foto salvata alimenta l'hero già esistente nella home residente, che non è stato toccato.

## Lavoro completato
- [x] Migration 014: bucket pubblico `residence-photos` (public=true, MIME immagini, 5 MB, INSERT gated super_admin, DELETE owner)
- [x] Server action `updateResidencePhoto` + componente client `ResidencePhotoUpload` + wiring nella pagina dettaglio residenza
- [x] Migration 015: policy RLS `FOR UPDATE` per super_admin (il secondo salvataggio è un UPDATE su `storage.objects` per via di upsert su path deterministico)
- [x] Refactor UI: preview da hero full-width a thumbnail compatta di gestione (l'hero grande resta solo lato residente)
- [x] Reset stato dopo salvataggio riuscito: flag `dirty` che disaccoppia il bottone "Salva foto" da `pickedPreview`, ripulitura input, igiene `URL.revokeObjectURL`
- [x] Cache-buster `?v=<timestamp>` sull'URL salvato in `residences.photo_url` (il file storage resta a path fisso → niente orfani)
- [x] Limite dimensione 5 MB: `bodySizeLimit` Server Actions in `next.config.ts` + validazione client + rete di sicurezza server, con costante condivisa `MAX_PHOTO_BYTES`
- [ ] Applicazione manuale in Supabase delle migration 014 e 015 nel SQL Editor (da confermare — vedi "Non funziona / da verificare")

## File toccati

### Creati
- `supabase/migrations/014_residence_photos_bucket.sql` — crea il bucket pubblico `residence-photos` e le policy SELECT (pubblica), INSERT (super_admin via `czero_user_role()`), DELETE (owner). Committato in `67ae88e`.
- `supabase/migrations/015_residence_photos_update_policy.sql` — aggiunge la policy `FOR UPDATE` mancante (USING + WITH CHECK, super_admin) così l'upsert sul path deterministico non viene negato dall'RLS al secondo salvataggio. Committato in `ccae04c`.
- `src/app/(dashboard)/admin/residences/[id]/actions.ts` — server action `updateResidencePhoto`: gate super_admin, upload su bucket `residence-photos` a path `${residenceId}/facade.<ext>` con `upsert:true`, `getPublicUrl` + cache-buster, update `residences.photo_url` con scope `.eq('id', residenceId)`, `revalidatePath` pagina + `('/', 'layout')`.
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx` — componente client: thumbnail compatta, "Aggiungi foto"/"Sostituisci", validazione dimensione, flag `dirty`, stati pending/success/error. Nessun hack `onError` (bucket pubblico).
- `src/app/(dashboard)/admin/residences/[id]/constants.ts` — `MAX_PHOTO_BYTES = 5 * 1024 * 1024`, fonte di verità unica importata da client e server.

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — aggiunto `photo_url` alla select della residenza; inserito `<ResidencePhotoUpload>` tra la striscia header identità e `<AdminBlock>`.
- `next.config.ts` — aggiunta `experimental.serverActions.bodySizeLimit: '5mb'` (default 1 MB bloccava le foto 1-5 MB prima dello storage). `reactStrictMode` e `images` invariati.

### Letti (contesto)
- `supabase/migrations/001_schema.sql` — struttura reale di `profiles` (PK `id` → `auth.uid()`, colonna `role`); colonna `residences.photo_url` già esistente.
- `supabase/migrations/002_rls.sql` — forma del controllo ruolo del progetto: helper `public.czero_user_role() = 'super_admin'` (definito riga 13), riusato nelle policy dei bucket.
- `supabase/migrations/004_storage.sql`, `005_m3.sql` — forma delle policy `storage.objects` dei bucket privati `attachments`/`documents` (SELECT/INSERT/DELETE, `owner_id = auth.uid()::TEXT`).
- `src/app/(dashboard)/admin/settings/actions.ts` — pattern `updateBuilderSettings` specchiato (gate, upload, getPublicUrl, update, revalidate); NON copiato l'uso del bucket privato `documents` né l'hack onError.
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — pattern strutturale (fileInputRef, openPicker, handleFileChange con object URL, handleSubmit con FormData) riusato ma ripulito.
- `src/app/(app)/page.tsx` — hero residente (righe ~140-146): render SEPARATO che legge `residences.photo_url`; confermato che non strippa la query string dell'URL → il cache-buster funziona anche lato residente. NON modificato.

## Decisioni chiave
- **Bucket pubblico dedicato invece di riuso di `documents`**: le foto facciata sono asset non sensibili e devono caricare in un `<img>` via `getPublicUrl` senza auth. I bucket esistenti sono privati e restano tali; evitato di copiarne il pattern (che trascinava l'hack `onError` mascherante).
- **Path storage deterministico + cache-buster nel DB**: `${residenceId}/facade.<ext>` con `upsert:true` evita file orfani (l'upload sovrascrive). Ma l'URL pubblico è quindi identico a ogni salvataggio → cache serve la foto vecchia. Scelto di NON randomizzare il path (creerebbe orfani, la DELETE è owner-only) ma di appendere `?v=${Date.now()}` alla sola stringa salvata in `residences.photo_url`. Alternativa scartata: path con timestamp nel nome file (orfani non ripulibili facilmente).
- **Policy RLS `FOR UPDATE` separata (015)**: con `upsert:true` il primo salvataggio è INSERT (coperto), il secondo è UPDATE su `storage.objects` (non coperto dalla 014) → errore "new row violates row-level security policy". Una UPDATE-policy richiede sia USING sia WITH CHECK. Alternativa scartata: `upsert:false` + delete-prima (fragile con DELETE owner-only).
- **Bottone gated su flag `dirty`, non su `pickedPreview`**: `photoUrl` è uno `useState` senza setter, quindi azzerare `pickedPreview` al success farebbe tornare la thumbnail alla foto vecchia (flicker) fino al re-render server. Tenendo `pickedPreview` come sorgente visiva e usando un `dirty` dedicato, il bottone sparisce al success senza flicker.
- **Costante condivisa `MAX_PHOTO_BYTES` in modulo co-locato**: stesso limite su config/client/server → unica fonte di verità (regola helper-condivisi del CLAUDE.md). Scartata la duplicazione con commento nei due file (è proprio la premessa della divergenza).

## Stato attuale

### Funziona
- Build/type-check: `npx tsc --noEmit` verde a ogni commit.
- Flusso codice completo e committato (7 commit, da `d9abce2` a `ccae04c`), working tree pulito.
- Hero residente confermato indipendente e non modificato; usa lo stesso `photo_url` con cache-buster senza strippare la query.

### Non funziona / da verificare
- **Migration 014 e 015 vanno applicate a mano nel SQL Editor di Supabase** (regola progetto: le applica Filippo). Finché la 015 non è applicata, il SECONDO salvataggio foto darà "new row violates row-level security policy".
- **`next.config.ts` richiede riavvio del dev server** per attivare `bodySizeLimit`: se `npm run dev` è già attivo continuerà a dare "Body exceeded 1 MB limit" finché non lo si riavvia.
- Non verificato end-to-end nel browser reale (upload, sostituzione, reload, file >5 MB, file >1 MB <5 MB): manca conferma manuale con le migration applicate e il server riavviato.

## Prossimi passi
1. Applicare nel SQL Editor di Supabase le migration `014_residence_photos_bucket.sql` e `015_residence_photos_update_policy.sql` (se non già fatto), poi riavviare `npm run dev`.
2. Verifica manuale nel browser: (a) primo upload foto, (b) SOSTITUZIONE stessa estensione — deve funzionare senza errore RLS e mostrare la nuova foto al reload, (c) upload file >5 MB → messaggio "Immagine troppo grande, massimo 5 MB" dal client senza chiamare la server action, (d) upload 1-5 MB → deve passare (non più "Body exceeded 1 MB limit").
3. Valutare il caso "sostituzione con estensione diversa" (jpg→png): il path cambia (`facade.jpg`→`facade.png`) lasciando un file orfano; l'URL cambia da solo. Decidere se normalizzare l'estensione del path o accettare l'orfano (attualmente fuori scope).
4. `git push` dei 15 commit locali verso il remoto quando pronto (branch `master`, remoto `origin/main`).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (riavvio necessario dopo la modifica di next.config.ts)
npm run dev

# Verifica type-check prima di ogni commit
npx tsc --noEmit

# oppure production
npm run build && npm start
```

## Domande aperte
- Sostituzione con estensione diversa: normalizzare il path a un'estensione fissa (es. sempre `facade.jpg` o derivare l'ext dal MIME una volta sola) per evitare orfani, oppure lasciare com'è? Impatta anche la coerenza del cache-buster.
- Push: i commit locali sono su `master` ma il remoto tracciato è `origin/main` (branch ahead by 15). Confermare la strategia di allineamento branch prima del push.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: Bucket Storage per asset non sensibili destinati a `<img>` pubblico (es. foto facciata residenze) sono pubblici e dedicati (`residence-photos`, public=true). I bucket sensibili (`documents`, `attachments`) restano privati. Mai servire un asset pubblico da un bucket privato né mascherare un URL rotto con un hack `onError`: su bucket pubblico un'immagine rotta è un bug vero da mostrare.

- **Sezione Regole di codice ricorrenti (bug class note)**: Upload con `upsert:true` su path deterministico richiede una policy RLS `FOR UPDATE` (oltre a INSERT): il primo salvataggio è un INSERT, i successivi sono UPDATE su `storage.objects` → senza policy UPDATE l'RLS nega dal secondo salvataggio ("new row violates row-level security policy"). Una UPDATE-policy richiede SIA `USING` SIA `WITH CHECK`.

- **Sezione Regole di codice ricorrenti (bug class note)**: Path storage deterministico → il `getPublicUrl` è identico a ogni salvataggio e il reload mostra la versione in cache. Cache-buster `?v=${Date.now()}` sulla SOLA stringa salvata nel DB (mai sul path del file, che resta fisso per non lasciare orfani con DELETE owner-only).

- **Sezione Regole di codice ricorrenti (bug class note)**: Il limite dimensione upload va allineato su tutte le superfici — `file_size_limit` del bucket, `experimental.serverActions.bodySizeLimit` in `next.config.ts` (default 1 MB blocca prima dello storage), validazione client e rete di sicurezza server — tramite un'unica costante condivisa (es. `MAX_PHOTO_BYTES`), non valori duplicati. `bodySizeLimit` in Next.js 15 sta sotto `experimental.serverActions` e richiede riavvio del dev server.

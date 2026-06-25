# Handoff — Vista documenti admin · 24/06/2026 15:00

## Sommario
Sessione dedicata alla costruzione completa della sezione Documenti nella dashboard
super_admin, precedentemente assente nonostante la card "N Documenti" nella scheda
residenza già li contasse. Sono stati prodotti due commit su build verde: il primo
ha aggiunto la vista lista con download (route + Client Component + card cliccabile
+ tab di navigazione), il secondo ha aggiunto l'upload multiplo tramite modale
in-app con selezione scope residenza/unità.

## Lavoro completato
- [x] Diagnosi completa: schema tabella `documents`, scope del conteggio, RLS, bucket Storage, pattern download, vista cliente, sidebar
- [x] Nuova route `/admin/residences/[id]/documenti` (Server Component)
- [x] `DocumentiClient.tsx`: lista divisa in sezione "Residenza" e "Per unità", filtro categorie (chip) + ricerca, download via `/api/download`
- [x] Card "Documenti" nella scheda residenza resa cliccabile → link alla nuova route
- [x] Icona card corretta da `Users` a `FileText`
- [x] Tab "Documenti" aggiunto all'array `tabs` in `[id]/page.tsx` (tra Manutenzioni e Fornitori)
- [x] Server action `uploadDocumentiAdmin`: multi-upload, per-file MIME/size check, cleanup orfani su DB fail, `revalidatePath` corretto
- [x] Modale upload in `DocumentiClient`: toggle Residenza/Unità, dropdown unità condizionale, categoria, data opzionale, `<input multiple />`
- [x] Stato risultato modale: banner verde (N caricati) + lista rossa (M falliti con motivo) + pulsante "Riprova" se tutti falliti
- [x] Build verde su entrambi i commit (`d613a02`, `4eef3f8`)

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — Server Component; `requireRole(['super_admin'])`; fetch parallelo `documents` (`.eq('residence_id', residenceId)`) e `units`; passa dati a `DocumentiClient`
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — Client Component; filtro categorie + ricerca con `useMemo`; modale upload con `useTransition`; sezioni Residenza/Per unità; `DocCard` con download signed URL
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — Server action `uploadDocumentiAdmin`; loop sequenziale per file; MIME whitelist; cleanup storage su DB error; `revalidatePath` sulla route admin

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — aggiunto `FileText` agli import lucide; `StatCard` ora accetta prop `href?` opzionale (wrap in `<Link>` se presente); card "Documenti" riceve `href` e icona corretta; tab "Documenti" aggiunto all'array `tabs`

### Letti (rilevanti per il contesto)
- `supabase/migrations/001_schema.sql` — schema reale tabella `documents` (colonne, tipi, logica scope)
- `supabase/migrations/002_rls.sql` — policy RLS su `documents` (FOR ALL per super_admin)
- `supabase/migrations/005_m3.sql` — bucket `documents` Storage (privato, 50 MB)
- `src/app/(app)/documenti/actions.ts` — pattern di riferimento: storage path, cleanup, insert
- `src/app/(app)/documenti/page.tsx` — vista cliente: NON riusata (si affida a RLS implicita senza filtro residence_id)
- `src/app/api/download/route.ts` — signed URL TTL 1h; riusato senza modifiche
- `src/app/(dashboard)/admin/residences/[id]/fornitori/FornitoriManager.tsx` — pattern modale dashboard (overlay `fixed inset-0 bg-black/40 z-50`, `useTransition`, `router.refresh()`)
- `src/components/AdminSidebar.tsx` — confermato: voce globale "Documenti" non aggiunta (scope per-residenza)

## Decisioni chiave
- **Client RLS standard, non adminClient**: la policy `FOR ALL` sulla tabella `documents` copre già SELECT per super_admin su tutte le residenze del proprio builder. `adminClient` non serve e non va usato.
- **Stesso filtro `.eq('residence_id', id)` in lista e contatore**: `residence_id` è NOT NULL su tutti i documenti (sia scope-residenza sia scope-unità), quindi il filtro cattura entrambi i tipi senza eccezioni. Card e lista sono garantite coerenti.
- **Pagina admin nuova, non riuso componente cliente**: `(app)/documenti/page.tsx` non ha filtro `residence_id` esplicito e si affida alla RLS implicita — riusarla avrebbe esposto documenti di più residenze o richiedeva refactor invasivo.
- **Tab a livello residenza, non voce sidebar globale**: i documenti sono sempre scoped a una residenza; una voce globale nella sidebar non avrebbe un contesto significativo.
- **Upload sequenziale (for loop), non parallelo**: evita race conditions sul `Date.now()` nello storage path e rende più leggibile la gestione errori per-file.
- **Cleanup storage su DB fail**: se `documents.insert` fallisce dopo `storage.upload`, il file viene rimosso immediatamente per non lasciare orfani nel bucket. Pattern già presente nella reference action.
- **Titolo auto-derivato dal nome file**: in upload multiplo non si chiede un titolo per file — viene usato `nameWithoutExt` come `title`. Coerente con l'UX bulk.
- **"Riprova" solo se tutti i file sono falliti**: se almeno un file è andato a buon fine, si mostra solo "Chiudi" (il modale ha già aggiornato la lista via `router.refresh()`).

## Stato attuale
### Funziona
- Build verde su `4eef3f8` — route `/admin/residences/[id]/documenti` compilata e inclusa nel bundle
- Card "Documenti" nella scheda residenza è cliccabile e naviga alla nuova route
- Tab "Documenti" appare nella lista tab della scheda residenza
- Lista documenti divisa in sezione Residenza e sezione Per unità (con label unità)
- Filtro categorie (chip toggle) e ricerca testuale client-side
- Download tramite `/api/download?bucket=documents&path=…` (signed URL)
- Modale upload: toggle scope, dropdown unità condizionale, categoria, data, multi-file
- Per-file processing: file non validi non bloccano gli altri
- Risultato upload: banner successo verde + lista fallimenti rossa

### Non funziona / da verificare
- **Test visivo a browser**: nessuna verifica end-to-end con account super_admin reale — la logica è corretta ma il rendering va confermato (modale centrato, chip, sezioni)
- **Upload reale su Storage**: non testato contro il bucket Supabase reale (necessita sessione autenticata)
- **Residenza senza unità**: il bottone "Unità" nel toggle scope non compare se `units.length === 0` — verificare che il fallback "solo Residenza" sia visivamente corretto
- **File con MIME non rilevato**: alcuni browser potrebbero inviare MIME type vuoto per file .doc vecchi; potrebbe causare rifiuto silenzioso — da monitorare

## Prossimi passi
1. Aprire `/admin/residences/[id]/documenti` come super_admin, verificare: tab presente, lista divisa correttamente, chip categoria funzionanti, download avvia il file
2. Testare upload: caricare 2-3 file misti (PDF + immagine) su scope "Residenza" e verificare che compaiano nella lista dopo chiusura modale
3. Testare upload con file non valido nel batch (es. `.exe`) e verificare che il riepilogo mostri il fallimento senza bloccare gli altri
4. Committare i 4 file handoff untracked in `docs/handoffs/` se si vuole tenere lo storico pulito
5. Valutare se aggiungere la voce upload anche alla vista cliente `(app)/documenti` (attualmente ha `UploadDocumentForm` ma non il modale — fuori scope di questa sessione)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
cd C:\progetti\casazero
npm run dev

# Build di verifica
npm run build
```

## Domande aperte
- L'`admin` (condominio) dovrebbe poter caricare documenti dalla stessa vista? Ora la route ha `requireRole(['super_admin'])` — se si vuole aprire anche all'admin, serve una nuova route o un allentamento del gate (con opportuna RLS check lato action già presente via `profile.role !== 'super_admin'`).
- Il contatore "N Documenti" nella scheda residenza conta residenza + unità (`residence_id = id` senza filtro su `unit_id`). È il comportamento desiderato, o si vuole contare solo i documenti di residenza?
- I documenti caricati da un'unità (scope unità) sono visibili nel fascicolo del cliente? Verificare che la RLS della vista cliente `(app)/documenti` li esponga correttamente tramite `czero_can_access_unit(unit_id)`.

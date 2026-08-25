# Handoff — Admin Block fix (upsert + modal stabile) · 27/06/2026 15:00

## Sommario
Sessione focalizzata su bug nel flusso "Assegna amministratore" di AdminBlock: duplicate key error su ri-assegnazione, modal che si smontava durante il refresh, errori Postgres grezzi in UI, e disabilitazione non funzionale dei profili durante pending. Risolti in due commit separati: prima idempotenza server, poi stabilità modale. Nella stessa sessione anche altri quattro commit: bulk invite per unità senza account, tile "senza account" cliccabile, consolidamento gap admin sulla card, welcome page ramificata per ruolo.

## Lavoro completato
- [x] `feat(units)`: tile "senza account" cliccabile → `/units?filter=senza_account` con filtro pre-applicato in `UnitsManager`
- [x] `feat(units)`: bulk invite — banner ambra con "Genera inviti (K)" + step conferma + `createBulkInvites` idempotente
- [x] `feat(welcome)`: ingresso ramificato per ruolo — residente (hero emozionale) vs admin (layout professionale)
- [x] `refactor(admin)`: gap "nessun admin" consolidato sulla card (`AdminBlock`) — rimossa tile separata in zona attenzione, rimosso prop `mode`
- [x] `fix`: `assignAdmin` cambiato da INSERT puro a `.upsert(..., { onConflict: 'residence_id' })` — atomico e idempotente, mai duplicate key
- [x] `fix`: errori Postgres mappati — codice `23505` → frase italiana; imprevisti → messaggio generico
- [x] `fix`: `AdminModal` estratta fuori dal corpo di `AdminBlock` — elimina unmount+remount ad ogni `router.refresh()`
- [x] `fix`: profili admin nella vista assegnazione ricevono `pointer-events-none opacity-50` durante `pending`

## File toccati
### Creati
- `src/lib/unit-utils.ts` — helper puro `unitHasNoActiveAccount(members)` condiviso tra `page.tsx` e `UnitsManager`

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — rimosso prop `mode`, no-admin stato ambra sulla card, `AdminModal` estratta come componente top-level con `AdminModalProps` esplicite
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — `assignAdmin`: INSERT → upsert; mappatura errori
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — rimossa seconda istanza `<AdminBlock mode="tile">`, tile amber "senza account" ora con `href`; `AttenzioneCard` supporta `href?: string` → `<Link>` vs `<div>`
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — legge `filter` da `searchParams`, thread `rawMembers` (tutti i `unit_members` inclusi `ended_at`) nel `UnitRow`
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — `filterSenzaAccount` state, `displayUnits` computed, `targetsForBulk` memo, banner bulk con step conferma, `createBulkInvites` chiamata
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — aggiunta `createBulkInvites` idempotente (check inviti attivi esistenti, bulk insert)
- `src/app/welcome/[token]/page.tsx` — branch `role === 'client'` → `WelcomeResidente` (SVG filigrana, hero emozionale); altri ruoli → `WelcomeAdmin` (hero professionale, shield banner)

## Decisioni chiave
- **Upsert vs DELETE+INSERT**: DELETE+INSERT lascia una finestra senza admin se l'insert fallisce dopo il delete. Upsert `ON CONFLICT (residence_id)` è atomico. Il constraint `UNIQUE(residence_id)` era già applicato a mano dal dev.
- **AdminModal estratta**: componente function definita dentro un altro component causa unmount+remount ad ogni render perché React vede una nuova function reference. Soluzione: componente top-level con props esplicite.
- **Constraint mismatch segnalato ma non modificato**: il constraint originale era `UNIQUE(profile_id, residence_id)`, che permetteva 2 admin diversi per la stessa residenza. Il constraint corretto `UNIQUE(residence_id)` è stato applicato a mano dal dev prima della sessione.
- **Gap "nessun admin" in un solo posto**: la tile separata in zona attenzione è stata rimossa; il gap vive sulla card in zona 1 con stato ambra e CTA che apre il flusso esistente.
- **Predicato condiviso `unitHasNoActiveAccount`**: usato identicamente in `page.tsx` (calcolo tile) e `UnitsManager` (filtro lista e `targetsForBulk`) per garantire che conteggio e lista non divergano mai.

## Stato attuale
### Funziona
- Build verde (verificata dopo ogni commit)
- `assignAdmin` idempotente: ri-assegnare lo stesso profilo o cambiare admin non produce mai duplicate key
- Modal admin stabile: non si smonta durante `router.refresh()`
- Profili disabilitati visivamente (opacity + pointer-events) durante pending
- Tile "senza account" cliccabile → pagina unità con filtro pre-applicato
- Bulk invite: banner, step conferma, idempotenza server-side
- Welcome page ramificata per ruolo

### Non funziona / da verificare
- **`UnitsManager.tsx` e `actions.ts` hanno modifiche non committate** (visibili in `git status`) — potrebbero essere residui di sessione o lavoro in corso; verificare prima di procedere
- La card admin stato ambra (`AdminBlock` no-admin) non è stata testata end-to-end con dati reali dopo il refactor; verificare che `openAssegnazione()` apra correttamente il flusso

## Prossimi passi
1. Verificare i file non committati (`UnitsManager.tsx`, `actions.ts`) — capire se sono modifiche da committare o da scartare (`git diff` su entrambi)
2. Testare il flusso admin stato ambra: residenza senza admin → clic sulla card → modal assegnazione → assegna profilo → card torna verde
3. Testare il flusso bulk invite end-to-end: filtro "senza account" → banner → "Genera inviti (K)" → conferma → QR generati nelle unità
4. Sessione successiva: **card admin stato ambra** — presumibilmente UX/polish della riga ambra nella card (già implementata strutturalmente, da rifinire o da testare)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (in una finestra PowerShell separata)
npm run dev

# Verifica build
npm run build
```

## Domande aperte
- I file non committati `UnitsManager.tsx` e `actions.ts` sono modifiche intenzionali o residui? Controllare con `git diff` prima di procedere.
- Il constraint `UNIQUE(residence_id)` in `admin_assignments` è già applicato nel DB di produzione/staging? Condiziona il funzionamento dell'upsert.

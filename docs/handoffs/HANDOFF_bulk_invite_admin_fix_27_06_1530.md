# Handoff — Bulk invite + Admin fix · 27/06/2026 15:30

## Sommario
Sessione intensa su tre aree: (1) bulk invite per unità senza account (server action idempotente + UI con conferma), (2) consolidamento del gap "nessun admin" sulla card AdminBlock eliminando la tile duplicata in zona attenzione, (3) bug fix su `assignAdmin` (INSERT → upsert atomico) e stabilità della modal admin (estrazione `AdminModal` fuori dal corpo del componente). I fix admin sono committati; il bulk invite è implementato ma NON ancora committato.

## Lavoro completato
- [x] `feat`: tile "senza account" cliccabile → `/units?filter=senza_account` con filtro pre-applicato (`initialFilter` prop, `filterSenzaAccount` state, `displayUnits` computed)
- [x] `feat`: `createBulkInvites` server action — idempotente via check preventivo inviti attivi + bulk insert in un round-trip (commit mancante — vedi sotto)
- [x] `feat`: banner bulk in `UnitsManager` — "Genera inviti (K)" con step conferma, K=0 disabilitato con testo esplicito (commit mancante)
- [x] `refactor`: `AdminBlock` — rimosso prop `mode`, no-admin → stato ambra sulla card con CTA che apre il flusso esistente, rimossa tile separata in zona attenzione
- [x] `fix`: `assignAdmin` INSERT → `.upsert({ onConflict: 'residence_id' })` — atomico, mai duplicate key
- [x] `fix`: errori Postgres mappati in italiano (codice `23505` → frase leggibile; imprevisti → messaggio generico)
- [x] `fix`: `AdminModal` estratta fuori dal corpo di `AdminBlock` — elimina unmount+remount ad ogni `router.refresh()`
- [x] `fix`: profili admin nella vista assegnazione ricevono `pointer-events-none opacity-50` durante `pending`
- [ ] **Bulk invite NON committato** — `UnitsManager.tsx` e `actions.ts` hanno 139 righe di modifiche staged ma non ancora in un commit

## File toccati
### Creati
- `src/lib/unit-utils.ts` — helper puro `unitHasNoActiveAccount(members: { ended_at: string | null }[])` condiviso tra `page.tsx` e `UnitsManager`

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — aggiunta `createBulkInvites(unitIds, residenceId)`: auth check, query inviti attivi esistenti, bulk insert idempotente (**non committato**)
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — `filterSenzaAccount` state, `displayUnits`, `targetsForBulk` memo, banner ambra con "Genera inviti (K)" + step conferma + `pointer-events-none` durante pending (**non committato**)
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — rimosso prop `mode`; no-admin stato ambra sulla card; `AdminModal` estratta come componente top-level con `AdminModalProps` esplicite
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — `assignAdmin`: INSERT → upsert; mappatura errori Postgres
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — rimossa seconda istanza `<AdminBlock mode="tile">`, `AttenzioneCard` con `href?: string` → `<Link>` vs `<div>`, tile amber con link a `/units?filter=senza_account`
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — legge `filter` da `searchParams`, thread `rawMembers` (tutti i `unit_members` incluso `ended_at`) nel `UnitRow`, passa `initialFilter` a `UnitsManager`
- `src/app/welcome/[token]/page.tsx` — branch `role === 'client'` → `WelcomeResidente` (SVG filigrana rooftop+chiave, hero emozionale); altri ruoli → `WelcomeAdmin` (hero professionale, shield banner legalità)

### Letti
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — per diagnosi bug assignAdmin
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — per diagnosi modal instabile e gap no-admin

## Decisioni chiave
- **Upsert vs DELETE+INSERT in `assignAdmin`**: DELETE+INSERT lascia una finestra senza admin se l'insert fallisce. Upsert `ON CONFLICT (residence_id)` è atomico. Il constraint `UNIQUE(residence_id)` su `admin_assignments` era già stato applicato a mano dal dev prima della sessione.
- **`AdminModal` estratta**: funzione component definita dentro un altro component causa unmount+remount ad ogni render (React vede una nuova reference). Soluzione: componente top-level con `AdminModalProps` esplicite — 16 props passate, struttura invariata.
- **Gap "nessun admin" in un solo posto**: precedentemente c'era una tile ambra in zona attenzione (`mode="tile"`) E una card in zona 1 (`mode="card"`) che tornava `null` se no-admin. Consolidato: la card mostra sempre qualcosa — verde se admin presente, ambra se assente. Prop `mode` rimosso.
- **Predicato condiviso `unitHasNoActiveAccount`**: usato identicamente in `page.tsx` (conteggio tile) e `UnitsManager` (filtro + `targetsForBulk`) per evitare qualsiasi divergenza tra il numero mostrato e le unità effettivamente filtrate.
- **"Invito attivo" nel bulk**: definizione `!used_at && expires_at > now` — coerente con quella usata nell'header di ogni unità. Le unità già invitate (anche se non hanno ancora accettato) vengono escluse dal bulk, sia lato client che server.

## Stato attuale
### Funziona (committato, build verde)
- `assignAdmin` idempotente — ri-assegnazione non produce duplicate key
- Modal admin stabile — non si smonta durante `router.refresh()`
- Profili disabilitati visivamente durante pending
- Card admin stato ambra + CTA che apre flusso esistente
- Tile "senza account" cliccabile con filtro pre-applicato
- Welcome page ramificata per ruolo (residente vs admin)

### Non funziona / da verificare
- **Bulk invite non committato**: `UnitsManager.tsx` e `actions.ts` hanno modifiche locali (139 righe). Build verde era confermata al momento dell'implementazione; fare `npm run build` per confermare prima di committare.
- Card admin stato ambra: non testata end-to-end con dati reali dopo il refactor; verificare che clic → modal → assegnazione → card torna verde funzioni correttamente.
- Constraint `UNIQUE(residence_id)` su `admin_assignments`: condiziona il funzionamento dell'upsert — verificare sia applicato nel DB di produzione/staging.

## Prossimi passi
1. **Committare il bulk invite**: `git add` su `UnitsManager.tsx` e `actions.ts`, `npm run build` per sicurezza, poi commit con messaggio tipo `feat(units): bulk invite per unità senza account — idempotente con conferma`
2. **Testare card admin stato ambra** end-to-end: residenza senza admin → clic card ambra → modal assegnazione → assegna → card torna verde
3. **Sessione successiva pianificata**: polish/verifica della card admin stato ambra (già implementata strutturalmente in questo commit, probabilmente da rifinire UX o da estendere)

## Comandi da rilanciare
```bash
# Verifica build prima di committare il bulk invite
npm run build

# Avvia il server di sviluppo (finestra PowerShell separata)
cd C:\progetti\casazero
npm run dev
```

## Domande aperte
- Il constraint `UNIQUE(residence_id)` in `admin_assignments` è già applicato nel DB remoto (staging/prod)? Se mancante, l'upsert di `assignAdmin` usa il constraint sbagliato `UNIQUE(profile_id, residence_id)` e potrebbe inserire 2 admin per la stessa residenza.
- Il bulk invite dovrebbe generare anche un'email/notifica all'admin o basta il token/QR (come per gli inviti singoli)? Attualmente è solo insert DB senza side-effect.

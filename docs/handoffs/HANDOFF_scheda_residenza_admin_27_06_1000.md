# Handoff — Scheda residenza super_admin · 27/06/2026 10:00

## Sommario
Questa sessione ha completato il redesign della pagina `/admin/residences/[id]` vista dal super_admin in tre commit distinti. Si è partiti da una diagnosi strutturata (FASE 0), poi si è implementata la nuova struttura a 3 zone (identità + attenzione + gestione), rifinita l'UI con tre correzioni puntuali, e infine resa interattiva la sezione amministratore con modale di assegnazione/dettaglio/cambio e relative Server Actions.

## Lavoro completato
- [x] Redesign scheda residenza: 5 card-contatore → 3 zone (banner, attenzione, porte)
- [x] Zona 1: banner verde scuro con chip classe/unità + card admin cliccabile
- [x] Zona 2: tile rosse per N3/N2 in ritardo (N2 conta unità distinte, non voci); tile ambra per buchi config; stato "In regola" sempre visibile quando ritardi = 0
- [x] Zona 3: 4 porte con metadato come sottotitolo (`{n} unità`, `{n} file`, ecc.)
- [x] Rifinitura UI: rimozione nome duplicato in header, metadato porte come sottotitolo, fix zona 2 vuota
- [x] `AdminBlock` Client Component (mode=card|tile) con modale a due stati (dettaglio / assegnazione)
- [x] Modale dettaglio: nome + tel + email on-demand via `serviceClient.auth.admin.getUserById`, azioni `tel:` e `mailto:`
- [x] Modale assegnazione: lista profili admin esistenti + genera invito link 30gg (`role='admin'`, `residence_id` diretto)
- [x] "Cambia amministratore": DELETE `admin_assignments` + transizione modale ad assegnazione senza reload intermedio
- [x] `admin-actions.ts`: 4 Server Actions (`assignAdmin`, `removeAdminAssignment`, `createAdminInvite`, `getAdminEmail`)
- [x] `ScaduteRow` aggiornato con `unit_id?: string | null` (backward-compatible con lista residenze)

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — Client Component (`mode='card'|'tile'`): trigger cliccabile + modale a due stati + tutte le interazioni admin
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — Server Actions: `assignAdmin`, `removeAdminAssignment`, `createAdminInvite`, `getAdminEmail`

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — Riscritta completamente: struttura a 3 zone, query aggiuntive (`adminList`, `unit_members!left`, `suppliers`), import `AdminBlock`, rimossi `Phone`/`UserCheck`/`noAdmin`
- `src/lib/residence-stats.ts` — Aggiunto `unit_id?: string | null` a `ScaduteRow` per conteggio N2-per-unità

### Letti (rilevanti per contesto)
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — Pattern Server Action esistente (auth check + serviceClient), riusato per `admin-actions.ts`
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — Pattern Client Component esistente (`useTransition`, `router.refresh`, `div role=button`)
- `src/app/welcome/[token]/accept/page.tsx` — Conferma che il flusso inviti già gestisce `role='admin'` → `admin_assignments.upsert`
- `supabase/migrations/001_schema.sql` — Confermato `UNIQUE(profile_id, residence_id)` su `admin_assignments`, no `ended_at`
- `supabase/migrations/002_rls.sql` — Confermata policy `"admin_assignments: super_admin gestisce tutto"` (FOR ALL) e policy `profiles` per super_admin
- `supabase/migrations/009_rls_profiles_super_admin.sql` — Policy aggiuntiva per profili clienti (builder_id null)
- `src/lib/supabase/admin.ts` — Confermato che `createServiceClient()` usa la service role key e supporta `auth.admin.getUserById`

## Decisioni chiave

- **Email non in `profiles`**: `profiles` non ha colonna `email` (è in `auth.users`). Anziché migrare (due fonti di verità), si carica on-demand via `createServiceClient().auth.admin.getUserById(profileId)` solo quando la modale dettaglio si apre. Mostrata solo se popolata.

- **Cambio admin = DELETE + INSERT, non storicizzazione**: `admin_assignments` non ha `ended_at` per design — è stato corrente, non registro storico (quello è `completions`). Il cambio elimina la riga corrente e il super_admin poi assegna la nuova tramite la modale assegnazione.

- **`transitioning` flag**: dopo DELETE dell'admin, `router.refresh()` aggiorna i props (`adminProfile` diventa null). Senza il flag, `AdminBlock mode='card'` ritornerebbe `null` chiudendo la modale. Il flag mantiene la modale aperta in stato assegnazione finché non si conferma o si annulla.

- **Modo `mode='card' | 'tile'` invece di due componenti**: i due trigger (card in Zona 1, tile ambra in Zona 2) sono mutuamente esclusivi per definizione — uno renderizza, l'altro no. Un singolo componente con `mode` prop evita duplicazione della logica modale.

- **`assignAdmin`/`removeAdminAssignment` via RLS client, non serviceClient**: la policy `"admin_assignments: super_admin gestisce tutto"` è `FOR ALL` e copre SELECT+INSERT+DELETE. Non serviva bypassare la RLS.

- **`createAdminInvite` via serviceClient**: coerente con `createInvite` in `units/actions.ts`. L'invito ha `role: 'admin'`, `residence_id` diretto, `unit_id: null`; il flusso `welcome/accept` già gestisce questo caso.

- **Lista profili admin filtrata da RLS**: la query `profiles WHERE role='admin'` è filtrata dalla policy `"profiles: super_admin legge i profili del builder"` (`builder_id = czero_user_builder_id()`). Gli admin invitati correttamente hanno `builder_id` impostato al momento dell'accept → visibili. Nessuna nuova policy necessaria.

## Stato attuale
### Funziona
- Build verde su tutti e 3 i commit della sessione
- Struttura a 3 zone renderizzata correttamente lato server
- `AdminBlock mode='card'`: card cliccabile, modale dettaglio si apre, email viene caricata on-demand, azioni `tel:`/`mailto:` collegate, "Cambia amministratore" transita alla modale assegnazione
- `AdminBlock mode='tile'`: tile ambra cliccabile, modale assegnazione si apre, entrambe le strade (scegli + invita) disponibili
- `assignAdmin` e `removeAdminAssignment` scrivono su `admin_assignments` via RLS
- `createAdminInvite` inserisce in `invites` con `role='admin'`
- Link invito generato, copiabile e inviabile via `mailto:`

### Non funziona / da verificare
- **RLS `profiles` per admin esistenti**: la query `profiles WHERE role='admin'` potrebbe restituire risultati vuoti se gli admin nel DB hanno `builder_id = null` (bug noto: policy filtra su `builder_id`). Da verificare sul DB reale con i dati di Furlan.
- **RLS `admin_assignments → profiles(id, full_name, phone)` join**: la policy `"profiles: super_admin legge i profili del builder"` copre i profili con `builder_id` corretto. Se il profilo admin ha `builder_id = null`, il join restituisce `profiles: null` silenziosamente → card admin non mostrata anche se assignment esiste. Da verificare.
- **`getAdminEmail`**: richiede che `SUPABASE_SERVICE_ROLE_KEY` sia configurata in produzione/preview. Se mancante, l'email non appare (silent failure nel loading spinner).
- **Invito admin accettato**: il flusso `welcome/accept` gestisce `role='admin'` ma usa `residenceIdFromUnit = invite.units?.residence_id ?? invite.residence_id`. Con `unit_id = null`, prende `invite.residence_id` direttamente. Da testare end-to-end con un invito reale.
- **Modale non testata su dispositivo reale**: il bottom sheet (`rounded-t-2xl` su mobile, `rounded-xl` su sm+) è stato implementato ma non verificato visivamente.

## Prossimi passi
1. **Verificare RLS admin sul DB reale**: aprire SQL Editor Supabase, eseguire `SELECT id, full_name, builder_id FROM profiles WHERE role = 'admin'` e controllare che `builder_id` sia popolato per gli admin esistenti. Se null, applicare un UPDATE manuale o verificare il flusso di accept.
2. **Test end-to-end invito admin**: creare un invito admin dalla modale, aprire il link in un browser separato, accettarlo con un account Google, verificare che `admin_assignments` venga scritto e che la card admin appaia nella scheda residenza.
3. **Aggiungere telefono al profilo admin**: attualmente `profiles.phone` è `null` per la maggior parte degli utenti (non c'è un form di modifica profilo per il super_admin). Per far funzionare il bottone "Chiama" serve che l'admin popoli il telefono dal proprio profilo.
4. **Valutare backlog post-demo**: campi business admin (P.IVA, PEC, studio) richiederanno una migration `ALTER TABLE profiles ADD COLUMN ...`. Decisione da prendere dopo la demo con Furlan.
5. **Handoff precedente da chiudere**: `HANDOFF_diagnosi_n1_verify_26_06_1000.md` è non tracciato (untracked) — committare i file `docs/handoffs/` se si vuole storico nel repo.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Build prima di committare
npm run build
```

## Domande aperte
- **Telefono admin**: come si popola `profiles.phone` per un admin? Serve un form di modifica profilo lato admin o lo inserisce il super_admin a mano? Questo campo determina se il bottone "Chiama" nella modale dettaglio è utile o sempre nascosto.
- **Revoca invito admin**: attualmente non c'è un'azione per revocare un invito admin già generato (a differenza degli inviti clienti che hanno `revokeInvite`). Se l'admin non usa il link, l'invito resta attivo 30 giorni. Aggiungere revoca o accettare il comportamento attuale?
- **Admin assegnato a più residenze**: lo schema lo permette (UNIQUE su `profile_id, residence_id`, non su `profile_id` solo). La lista "profili esistenti" mostra tutti gli admin del builder, anche quelli già assegnati ad altre residenze. È il comportamento corretto?

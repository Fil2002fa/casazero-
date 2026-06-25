# Handoff — Bug fix admin + hardening demo · 23/06/2026 13:00

## Sommario
Sessione interamente dedicata a bug fix e hardening di sicurezza in preparazione alla demo con Furlan Costruzioni. Sono stati risolti quattro problemi: schermo bianco al click su card manutenzione nella dashboard admin, contatori N2/N3 disallineati tra lista e dettaglio residenza, assenza di controlli di autorizzazione server-side sulle action N3, e due bug UX nella gestione fornitori/priorità. In parallelo è stata chiusa la policy RLS di `completions` al super_admin a livello database.

## Lavoro completato
- [x] Helper condiviso `src/lib/residence-stats.ts` — `ScaduteRow` + `effPriority`, usato da lista e dettaglio residenza
- [x] Dettaglio residenza `/admin/residences/[id]` allineato: grid 3→5 colonne (Unità, A tuo carico N2, Condominiali N3, In corso, Documenti)
- [x] Nuova pagina `/admin/manutenzioni/[id]` nella shell `(dashboard)` — fix schermo bianco (prima puntava alla shell client `(app)` che redirigeva via il super_admin)
- [x] `MaintenanceCard`: prop `href?` opzionale — la pagina admin passa `/admin/manutenzioni/${id}` invece dell'hardcoded `/manutenzioni/${id}`
- [x] `ItemCard` in admin manutenzioni: header clickable con `<Link>` verso dettaglio; `N3AdminActions` separati sotto
- [x] `takeChargeN3` / `completeN3`: check `role === 'admin'`, lookup `residence_id` dall'item (non da formData), verifica `admin_assignments`; revalidatePath aggiornati
- [x] Migrazione `008_rls_completions_hardening.sql` applicata e verificata — rimosso ramo super_admin da policy INSERT `completions`
- [x] `FornitoriManager`: modale custom in stile app (no `window.confirm`), gestione errore FK, `router.refresh()` su successo, `useTransition` separati per add/delete
- [x] `updateMaintenanceItemConfig`: cambio a N1 → aggiorna `status='in_attesa'` + `next_due_date=oggi+freq` nello stesso UPDATE

## File toccati
### Creati
- `src/lib/residence-stats.ts` — tipi e helper per priorità effettiva item scaduti
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — dettaglio manutenzione admin: sola lettura per super_admin, azioni N3 per admin assegnato
- `supabase/migrations/008_rls_completions_hardening.sql` — policy INSERT completions senza ramo super_admin; DROP IF EXISTS su UPDATE/DELETE (già assenti)

### Modificati
- `src/app/(dashboard)/admin/residences/page.tsx` — importa helper da `residence-stats`, rimossa duplicazione
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — nuova query fetch+filtro JS N2/N3, grid 5 colonne
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — `ItemCard` con header-link, `MaintenanceCard` con `href` admin
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — hardening auth su entrambe le action N3
- `src/components/MaintenanceCard.tsx` — prop `href?` opzionale, default invariato per shell client
- `src/app/(dashboard)/admin/residences/[id]/fornitori/FornitoriManager.tsx` — modale custom, error handling, router.refresh
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — blocco N1 in `updateMaintenanceItemConfig`

### Letti (rilevanti per contesto)
- `src/app/(app)/layout.tsx` — guard `role !== 'client' → redirect('/admin')` causa root del bug schermo bianco
- `src/app/(dashboard)/admin/page.tsx` — catena redirect `super_admin → /admin/residences`
- `supabase/migrations/002_rls.sql` — policy analizzate su `maintenance_items` e `completions`
- `src/app/api/cron/daily/route.ts` — confermato che N1 in_attesa non diventa scaduta, ma N1 già scaduta non viene ripristinata dal cron (motivo del fix in actions.ts)

## Decisioni chiave
- **Shell separata per dettaglio admin**: creata `/admin/manutenzioni/[id]` in `(dashboard)` invece di rendere `(app)/manutenzioni/[id]` accessibile agli admin — mantiene separazione visiva e layout desktop
- **super_admin in sola lettura su N3**: il fascicolo (`completions`) è il registro legale; `performed_by` deve essere l'admin reale, mai il super_admin — scelta di prodotto esplicita
- **`residence_id` da DB non da formData**: in `completeN3` il campo hidden era forgiabile; ora derivato dall'item lato server con check di divergenza
- **RLS doppio livello**: codice blocca prima, DB blocca per sicurezza — policy UPDATE/DELETE assenti su completions (immutabilità garantita)
- **N1→N2/N3 senza ricalcolo immediato**: `next_due_date` lasciato invariato; il cron marca scaduta al giorno giusto. Solo N1 richiede reset immediato
- **Modale custom fornitore**: `window.confirm` inaffidabile in PWA (Chrome Windows può sopprimerlo); modale in-app risolve funzionalità e coerenza visiva

## Stato attuale
### Funziona
- Build verde su tutti i commit — ultimo `04a7826`
- Navigazione card manutenzioni admin → `/admin/manutenzioni/[id]` senza schermo bianco
- Dettaglio residenza con breakdown N2/N3 allineato alla lista
- Action N3 con check ruolo + `admin_assignments` + `residence_id` da DB
- RLS `completions` chiusa al super_admin (verificata via `pg_policies`)
- Modale rimozione fornitore: conferma custom, errore FK leggibile, refresh pulito
- Cambio priorità N1: voce esce da "scaduta" immediatamente

### Non funziona / da verificare
- **Test visivo dettaglio admin** `/admin/manutenzioni/[id]` non verificato a browser con account admin reale (solo super_admin disponibile per test)
- **Test FK failure modale fornitore**: nessun fornitore nel seed Cavaccio ha `maintenance_items` collegati — non testabile senza fixture ad hoc
- **`CLAUDE.md` modificato localmente** non committato (`git diff CLAUDE.md` per verificare)
- **Due handoff non committati** in `docs/handoffs/` (untracked)
- **Policy `FOR ALL` super_admin su `maintenance_items`**: a livello DB super_admin può ancora fare UPDATE diretto — discusso e lasciato per ora

## Prossimi passi
1. Testare `/admin/manutenzioni/[id]` come utente admin di condominio — verificare che "Prendi in carico" funzioni e che il dettaglio mostri le azioni
2. Testare come super_admin: banner sola lettura visibile, nessun pulsante azione
3. Testare cambio priorità N1 su voce "Scaduta" in `/admin/residences/[id]/manutenzioni` — la card deve tornare blu
4. Eseguire `git diff CLAUDE.md` — se la modifica è automatica, ripristinare con `git checkout CLAUDE.md`
5. Valutare se committare i file handoff in `docs/handoffs/`
6. Valutare migrazione `009` per restringere policy `FOR ALL` super_admin su `maintenance_items` UPDATE (se richiesto per hardening completo pre-launch)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Build di verifica
npm run build

# Controlla CLAUDE.md
git diff CLAUDE.md
```

## Domande aperte
- La policy `"items: super_admin gestisce tutto"` (FOR ALL su `maintenance_items`) va ristretta per UPDATE? Il codice blocca a livello applicativo ma un accesso diretto al DB bypassa tutto
- Il dettaglio `/admin/manutenzioni/[id]` deve mostrare la sezione commenti (come la shell client)? Oggi non la mostra — da decidere prima della demo
- I file handoff in `docs/handoffs/` vanno committati in git o restano solo locali?

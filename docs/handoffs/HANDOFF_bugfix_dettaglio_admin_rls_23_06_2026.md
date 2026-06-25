# Handoff — Bug fix dettaglio admin + hardening RLS · 23/06/2026

## Sommario
Questa sessione ha risolto quattro problemi distinti emersi durante la preparazione della demo con Furlan Costruzioni. Sono stati corretti il bug dello schermo bianco alla navigazione verso il dettaglio manutenzione (shell sbagliata), allineati i contatori N2/N3 nel dettaglio residenza, rafforzata la sicurezza delle server action N3 con check espliciti di ruolo e `admin_assignments`, chiusa la policy RLS di `completions` al super_admin, e fixati due bug nell'interfaccia super_admin (modale rimozione fornitore e coerenza stato N1 al cambio priorità).

## Lavoro completato
- [x] Estratto helper condiviso `src/lib/residence-stats.ts` (`ScaduteRow`, `effPriority`) usato da lista e dettaglio residenza
- [x] Allineato dettaglio residenza `/admin/residences/[id]` ai contatori N2/N3/in_corso (prima mostrava "Scadute" misto N1+N2+N3)
- [x] Creata pagina `/admin/manutenzioni/[id]` nella shell `(dashboard)` — fix schermo bianco quando super_admin clicca card manutenzione
- [x] `MaintenanceCard`: aggiunta prop `href?` opzionale per puntare alla route admin invece di quella client
- [x] `ItemCard` in admin manutenzioni: header cliccabile verso dettaglio, `N3AdminActions` sotto separati
- [x] `takeChargeN3` / `completeN3`: aggiunto check `role === 'admin'`, derivazione `residence_id` dall'item (non da `formData`), verifica `admin_assignments`
- [x] Migrazione `008_rls_completions_hardening.sql` applicata: rimosso ramo `super_admin` dalla policy INSERT su `completions`
- [x] `FornitoriManager`: sostituito `window.confirm` con modale custom; gestione errore FK; `router.refresh()` al posto di `window.location.reload()`; `useTransition` separati per add/delete
- [x] `updateMaintenanceItemConfig`: cambio priorità a N1 ora porta `status='in_attesa'` e ricalcola `next_due_date=oggi+freq` nello stesso UPDATE

## File toccati
### Creati
- `src/lib/residence-stats.ts` — helper `ScaduteRow` + `effPriority(i)`: fonte di verità unica per il calcolo priorità effettiva degli item scaduti
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — dettaglio manutenzione nella shell admin: sola lettura per super_admin, azioni N3 per admin assegnato
- `supabase/migrations/008_rls_completions_hardening.sql` — rimuove ramo super_admin da policy INSERT `completions`; DROP IF EXISTS su UPDATE/DELETE (già assenti, per idempotenza)

### Modificati
- `src/app/(dashboard)/admin/residences/page.tsx` — rimosso codice locale `ScaduteRow`/`effPriority`, ora importa da helper
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — query sostituita: COUNT scaduta → fetch+filtro JS N2/N3; grid 3→5 colonne (Unità, A tuo carico, Condominiali, In corso, Documenti)
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — import `Link`/`ChevronRight`; `ItemCard` ristrutturato con header-link; `MaintenanceCard` per upcoming passa `href=/admin/manutenzioni/${id}`
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — `takeChargeN3`: check ruolo + item lookup + `admin_assignments`; `completeN3`: idem + `residenceId` da DB non da formData + divergence check; revalidatePath aggiornati con route dettaglio admin
- `src/components/MaintenanceCard.tsx` — aggiunta prop `href?: string`; default resta `/manutenzioni/${id}` (shell client invariata)
- `src/app/(dashboard)/admin/residences/[id]/fornitori/FornitoriManager.tsx` — modale custom, due `useTransition`, `router.refresh()`, error handling FK
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — `updateMaintenanceItemConfig`: blocco N1 che imposta `status='in_attesa'` + `next_due_date=oggi+freq`

### Letti (rilevanti per il contesto)
- `src/app/(app)/layout.tsx` — confermato guard `role !== 'client' → redirect('/admin')` (causa root del bug schermo bianco)
- `src/app/(dashboard)/admin/page.tsx` — confermato redirect `super_admin → /admin/residences`, `admin → /admin/manutenzioni`
- `supabase/migrations/002_rls.sql` — analisi policy esistenti su `maintenance_items` e `completions`
- `src/app/api/cron/daily/route.ts` — confermato che N1 con `status=in_attesa` non viene marcato scaduto; ma N1 già scaduto non viene ripristinato (bug 2 fix necessario nel codice)

## Decisioni chiave
- **Dettaglio admin vs riuso shell client**: scelto creare `/admin/manutenzioni/[id]` nella shell `(dashboard)` (opzione B) invece di rendere accessibile `(app)/manutenzioni/[id]` agli admin — preserva la separazione visiva delle shell e il layout desktop
- **super_admin in sola lettura sul dettaglio N3**: il record `completions` è il fascicolo legale; `performed_by` deve essere l'amministratore reale. super_admin può ispezionare ma non scrivere
- **residence_id da DB, non da formData**: in `completeN3` il campo hidden era forgiabile dal client; ora viene derivato dall'item lato server. Se i due divergono, l'action rifiuta
- **RLS completions**: rimosso il ramo super_admin dalla policy INSERT — doppio livello di protezione (codice + DB). Policy UPDATE/DELETE restano assenti (immutabilità del fascicolo garantita)
- **N1→N2/N3 senza ricalcolo immediato**: lasciato il `next_due_date` dov'è; il cron marca l'item come scaduta al giorno giusto. Non serve intervenire nell'action
- **Modale custom fornitore**: `window.confirm` bloccato in contesto PWA su alcuni browser; modale custom in stile app risolve sia il problema funzionale che quello estetico

## Stato attuale
### Funziona
- Build `npm run build` verde su tutti i commit (ultimo: `04a7826`)
- Navigazione card manutenzioni admin → `/admin/manutenzioni/[id]` senza schermo bianco
- Dettaglio residenza mostra Unità / A tuo carico (N2) / Condominiali (N3) / In corso / Documenti
- `takeChargeN3` e `completeN3` bloccano super_admin e admin non assegnati a livello codice
- RLS `completions` chiusa al super_admin — migrazione `008` applicata e verificata via MCP
- Modale rimozione fornitore: conferma custom, errore FK leggibile, `router.refresh()` su successo
- Cambio priorità a N1: item esce da "scaduta" immediatamente (status+next_due_date aggiornati insieme)

### Non funziona / da verificare
- **Test visivo dettaglio admin**: `/admin/manutenzioni/[id]` non verificato a browser con utente admin reale
- **Test modale fornitore**: non testato il caso FK failure (nessun fornitore collegato a manutenzioni nel seed Cavaccio)
- **`CLAUDE.md` modificato localmente** (non committato): `git diff CLAUDE.md` per capire cosa è cambiato
- **Handoff precedente non committato**: `docs/handoffs/HANDOFF_dashboard_shell_mcp_20_06_1930.md` è untracked — decidere se committarlo
- **RLS `maintenance_items` UPDATE**: policy `"items: super_admin gestisce tutto"` (FOR ALL) consente ancora a super_admin di aggiornare via DB diretto — discusso, lasciato per ora (lo stato è ricalcolabile)

## Prossimi passi
1. Aprire `/admin/manutenzioni` come admin di condominio assegnato e verificare che "Prendi in carico" funzioni, che il dettaglio si apra e mostri le azioni N3
2. Verificare che come super_admin il dettaglio `/admin/manutenzioni/[id]` mostri il banner sola lettura senza pulsanti azione
3. Testare il cambio priorità N1 su una voce "Scaduta" in `/admin/residences/[id]/manutenzioni` e verificare che la card esca dal rosso
4. Committare o ripristinare `CLAUDE.md` locale (`git diff CLAUDE.md` → `git checkout CLAUDE.md` se non intenzionale)
5. Valutare migrazione `009` per chiudere la policy `FOR ALL` super_admin su `maintenance_items` UPDATE se la demo richiede hardening completo

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Build di verifica
npm run build

# Verifica CLAUDE.md modificato localmente
git diff CLAUDE.md
```

## Domande aperte
- La policy `"items: super_admin gestisce tutto"` (FOR ALL su `maintenance_items`) va ristretta per UPDATE? Oggi il codice blocca a livello applicativo, ma un accesso diretto al DB con service role bypassa tutto
- Il dettaglio `/admin/manutenzioni/[id]` deve mostrare anche i commenti (come fa la shell client)? Oggi non li mostra — da valutare per la demo
- `CLAUDE.md` modificato localmente: è una modifica automatica del sistema o intenzionale?

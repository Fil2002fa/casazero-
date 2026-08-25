# Handoff — Sezione Amministratori (super_admin) · 29/06/2026 11:00

## Sommario
Sessione dedicata alla ristrutturazione completa della voce sidebar "Manutenzioni" del super_admin in "Amministratori": una torre di controllo read-only centrata sulla persona-amministratore. La worklist N3 che era erroneamente esposta al super_admin (con form di completamento che il backend giustamente rifiutava) è stata rimossa dalla sua navigazione tramite route guard. In parallelo è stato committato il bulk invite per unità senza account, rimasto in sospeso dalla sessione precedente.

## Lavoro completato
- [x] `feat(units)`: bulk invite pendente dalla sessione 27/06 committato (`f6b214f`)
- [x] Sidebar super_admin: voce "Manutenzioni" (Wrench) → "Amministratori" (Users, `/admin/administrators`)
- [x] Route guard: `requireRole(['admin'])` su `/admin/manutenzioni` e `/admin/manutenzioni/[id]` — super_admin rediretto
- [x] Scaffold `/admin/administrators/page.tsx`
- [x] Data layer `loadAdmins()`: serviceClient bypass RLS, overdue LIVE da `next_due_date` (non dal campo `status`), scope per-admin corretto (non builder-wide), email via `auth.admin.getUserById()`
- [x] UI Zona A (card attenzione rosso/ambra, ordinate peggiore-prima) + Zona B (roster compatto con pallino di stato)
- [x] Route page `/admin/administrators/[id]`: identity block (pattern AdminBlock, sola lettura), residenze con dettaglio scadute + gap config, link → `/admin/residences/[id]`
- [x] `SollecitaButton`: pulsante visivamente attivo (#04342C), al click mostra "Funzione in arrivo" per 2.5s — nessun meccanismo email/log/stato
- [x] Eyebrow "SUPER ADMIN" ridondante rimosso dalla list page

## File toccati
### Creati
- `src/app/(dashboard)/admin/administrators/page.tsx` — lista amministratori con `loadAdmins()`, Zona A + Zona B
- `src/app/(dashboard)/admin/administrators/[id]/page.tsx` — scheda dettaglio read-only per singolo amministratore
- `src/app/(dashboard)/admin/administrators/SollecitaButton.tsx` — client component con toast inline (useState + setTimeout)

### Modificati
- `src/components/AdminSidebar.tsx` — `SUPER_ADMIN_ITEMS`: `Wrench/Manutenzioni` → `Users/Amministratori`, href `/admin/administrators`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — `requireRole(['admin'])` (rimosso `super_admin`)
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — `requireRole(['admin'])` (rimosso `super_admin`)
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — bulk invite (commit precedente sessione 27/06)
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — `createBulkInvites` server action (commit precedente)

### Letti (contesto)
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — pattern identity block riusato nella scheda dettaglio
- `supabase/migrations/002_rls.sql` — verifica policy `admin_assignments` + `profiles`
- `supabase/migrations/001_schema.sql` — conferma trigger `handle_new_user` (→ UPDATE non INSERT per seed demo)
- `src/lib/supabase/admin.ts` — `createServiceClient()` usato nel data layer
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` — verifica che `completeN3`/`takeChargeN3` controllino `role !== 'admin'`

## Decisioni chiave
- **Overdue LIVE, non dal campo `status`**: il cron che aggiorna `status='scaduta'` gira solo su Vercel; in locale lo `status` resta `in_attesa`. Si usa `next_due_date < CURRENT_DATE` per coerenza con la realtà.
- **Scope overdue per-admin**: la query overdue filtra su `residenceIds` di QUELL'amministratore (ottenuti da `admin_assignments`), non su tutti gli item del builder. Evita la classe di bug "count overdue builder-wide" già vista in sessioni precedenti.
- **serviceClient per tutto**: la policy `profiles` sui profili admin (builder_id=NULL) era parzialmente cieca per il super_admin via RLS. serviceClient bypassa il problema; la migration 010 (da applicare a mano) lo risolve anche lato RLS.
- **SollecitaButton attivo-ma-muto**: il pulsante usa stile primario pieno (non grigio/disabilitato) per comunicare che la funzione esisterà. Il click cambia il testo a "Funzione in arrivo" per 2.5s senza alcun side effect.
- **Route page per il dettaglio, non modal**: la scheda admin ha URL proprio, back-button naturale, e link uscenti verso `/admin/residences/[id]` — una modal non avrebbe URL condivisibile né gestione navigazione pulita.
- **Stato peggiore per admin multi-residenza**: se un admin ha 1 residenza rossa e 2 verdi, l'admin è rosso. Il roster e la Zona A riflettono sempre il peggiore.

## Stato attuale
### Funziona (build verde, 5 commit)
- Sidebar super_admin mostra "Amministratori" al posto di "Manutenzioni"
- super_admin digitando `/admin/manutenzioni` viene rediretto
- `/admin/administrators` carica la lista con dati live (con 1 solo admin nel DB attuale)
- `/admin/administrators/[id]` mostra identity block + residenze + overdue + Sollecita
- SollecitaButton feedback visivo funzionante

### Non funziona / da verificare
- **Migration 010 non applicata**: il super_admin legge i profili admin via serviceClient (OK), ma la RLS client non copre ancora `profiles` degli admin (builder_id=NULL). Applicare a mano prima di testare con 3 admin reali.
- **Seed demo non eseguito**: i 3 admin (filippoloro02 rosso, Admin B ambra, Admin C verde) richiedono: (1) creare 2 utenti da dashboard Auth, (2) lanciare i 5 passi SQL del seed. Senza di essi la pagina mostra solo 1 riga.
- **Stato con 1 solo admin**: con `filippoloro02` unico admin, Zona A mostra 1 card rossa (7 scadute Cavaccio) e Zona B 1 riga. La storia a 3 admin attende il seed.
- **Incoerenza in_corso/scaduta**: la list page `/admin/manutenzioni` usa il campo `status` (non LIVE) — bug noto, da fixare in sessione separata.

## Prossimi passi
1. **Applicare migration 010** (SQL Editor Supabase):
   ```sql
   DROP POLICY IF EXISTS "profiles: super_admin legge admin delle proprie residenze" ON profiles;
   CREATE POLICY "profiles: super_admin legge admin delle proprie residenze"
     ON profiles FOR SELECT
     USING (
       public.czero_user_role() = 'super_admin'
       AND EXISTS (
         SELECT 1 FROM admin_assignments aa
         JOIN residences r ON r.id = aa.residence_id
         WHERE aa.profile_id = profiles.id
           AND r.builder_id = public.czero_user_builder_id()
       )
     );
   ```
2. **Creare Admin B e Admin C** (Supabase Dashboard → Authentication → Add user):
   - `filippoloro02+adminB@gmail.com`
   - `filippoloro02+adminC@gmail.com`
3. **Lanciare seed demo** (5 passi SQL generati nella sessione, vedi sotto) per ottenere roster 3-admin con stati distinti.
4. **Fix incoerenza in_corso/scaduta** sulla list page `/admin/manutenzioni`: allineare al calcolo live `next_due_date < today` invece del campo `status`.

## Seed demo SQL (5 passi — lanciare dopo aver creato gli utenti auth)
```sql
-- PASSO 1: recupera UUID dei 2 nuovi utenti
SELECT id, email FROM auth.users
WHERE email IN ('filippoloro02+adminB@gmail.com', 'filippoloro02+adminC@gmail.com');

-- PASSO 2: promuovi a role='admin' (il trigger handle_new_user crea già la riga con role='client')
UPDATE public.profiles SET role = 'admin' WHERE id IN ('<UUID_B>', '<UUID_C>');

-- PASSO 3: rimuovi dublin e Arcella da filippoloro02
DELETE FROM public.admin_assignments
WHERE profile_id = '7a210c85-7816-4d5f-b802-176505947469'
  AND residence_id IN (
    '2d7e1112-ec05-46ef-8151-3b639b338e99',  -- Residenza dublin
    '21393fd2-b85c-4854-b488-a30f8790c04a'   -- Residenza Arcella
  );

-- PASSO 4: assegna B → dublin (0 fornitori → ambra), C → Arcella (1 fornitore → verde)
INSERT INTO public.admin_assignments (profile_id, residence_id) VALUES
  ('<UUID_B>', '2d7e1112-ec05-46ef-8151-3b639b338e99'),
  ('<UUID_C>', '21393fd2-b85c-4854-b488-a30f8790c04a');

-- PASSO 5: verifica
SELECT p.full_name, r.name AS residence,
  COUNT(mi.id) FILTER (
    WHERE mi.next_due_date < CURRENT_DATE AND mi.status != 'completata'
    AND COALESCE(mi.priority, mt.priority) IN ('N2','N3')
  ) AS overdue_live,
  COUNT(DISTINCT s.id) AS supplier_count
FROM admin_assignments aa
JOIN profiles p ON p.id = aa.profile_id
JOIN residences r ON r.id = aa.residence_id
LEFT JOIN maintenance_items mi ON mi.residence_id = r.id AND mi.unit_id IS NULL
LEFT JOIN maintenance_templates mt ON mt.id = mi.template_id
LEFT JOIN suppliers s ON s.residence_id = r.id
GROUP BY p.full_name, r.name
ORDER BY overdue_live DESC, p.full_name;
```

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
cd C:\progetti\casazero
npm run dev
```

## Domande aperte
- Il trigger `handle_new_user` non imposta `builder_id` sui profili admin creati via dashboard Auth: è intenzionale (l'admin è builder-agnostic, associato alle residenze via `admin_assignments`)? Se sì, la migration 010 è l'unico fix necessario per la leggibilità lato super_admin.
- Il bottone "Sollecita" nella scheda dettaglio appare per ogni residenza con problema (rossa o ambra). Quando sarà implementata la funzione reale, va uno per residenza o uno globale per-admin?
- `Test manutenzioni scadenze` non ha admin assegnato (gap AMBRA a livello residenza) ma non compare nel roster amministratori perché non c'è profilo a cui attaccarlo. Va surfacciato altrove (es. nella pagina residenza stessa, come già fa `AdminBlock`) — nessuna azione richiesta qui.

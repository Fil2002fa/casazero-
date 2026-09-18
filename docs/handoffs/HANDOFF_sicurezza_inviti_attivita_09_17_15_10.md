# Handoff — Sicurezza inviti + card Attività · 17/09/2026 15:10

## Sommario
Sessione continuata su un nuovo dispositivo, con i commit del Blocco B (registro attività degli inviti) già chiusi in una sessione precedente rimasta senza handoff. Questa sessione ha verificato quei commit contro le decisioni approvate (nessun rifacimento), poi ha eseguito due FASE 0 in sequenza: la prima sulla card Attività della pagina residenza (sostituzione conteggio → ultimo evento), la seconda sui due debiti di sicurezza degli inviti segnalati nell'handoff del Blocco A. Tutti e tre i concern approvati sono stati implementati, un commit ciascuno, con `npm run verify` verde su ognuno.

## Lavoro completato
- [x] Verifica (non rifacimento) dei commit `34514dc` (invito_inviato) e `0963fd5` (invito_accettato) del Blocco B, già presenti in git da una sessione precedente senza handoff — conformi a D1/D2/D4
- [x] `package-lock.json`: modifica di soli fine-riga scartata con `git checkout --`
- [x] FASE 0 — card Attività residenza: diagnosi origine query, helper date, altre superfici (nessuna)
- [x] FASE 0 — debiti sicurezza inviti: diagnosi dei 4 produttori di `invites` (createFamilyInvite, createInvite, createBulkInvites, createAdminInvite), sospetto B confermato solo su `createAdminInvite`
- [x] Commit `a1a1550` — `createAdminInvite` verifica il perimetro della residenza via RLS (guardia di lettura con client di sessione, prima dell'insert col service client)
- [x] Query di controllo in sola lettura sugli inviti esistenti: **zero righe incoerenti** (nessun `invites.residence_id` diverso dalla residenza della propria unità) — via libera al commit A senza bonifica
- [x] Commit `c2d1b1f` — `createFamilyInvite` non riceve più `residenceId` dal client: lo deriva da `units.residence_id` dopo il check di membership
- [x] Commit `0c0dc82` — card Attività residenza: da conteggio (`count`, head-only) a ultimo evento, nuovo helper `lastActivityLabel` in `src/lib/activity-feed.ts`
- [ ] Prova a mano dei tre commit di sicurezza (STOP inviato, in attesa di conferma di Filippo)
- [ ] Prova a mano della card Attività (STOP inviato, in attesa di conferma di Filippo)

## File toccati
### Creati
- `docs/handoffs/HANDOFF_sicurezza_inviti_attivita_09_17_15_10.md` — questo documento

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/admin-actions.ts` — commit `a1a1550`: in `createAdminInvite`, dopo `assertSuperAdmin()` e prima di ogni scrittura, lettura di `residences` con client di sessione (perimetro via `czero_can_access_residence`); `error` destrutturato e loggato, esito tecnico distinto da "Residenza non trovata"
- `src/app/(app)/profilo/actions.ts` — commit `c2d1b1f`: `createFamilyInvite` perde il parametro `residenceId`; la residenza si legge da `units.residence_id` con client di sessione dopo il check `unit_members`
- `src/app/(app)/profilo/ProfiloClient.tsx` — commit `c2d1b1f`: la chiamata passa solo `unit.id`
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — commit `0c0dc82`: la query su `activity_events` passa da `count: 'exact', head: true` a `select('created_at').order(desc).limit(1).maybeSingle()`; `error` destrutturato e loggato; la voce `porte` "Attività" usa `lastEventLabel` invece di `pluralize(eventCount, ...)`
- `src/lib/activity-feed.ts` — commit `0c0dc82`: nuovo helper esportato `lastActivityLabel(date, now)` — "oggi, HH:mm" · "ieri, HH:mm" · "12 set" · "12 set 2025" (anno solo se diverso da quello corrente)

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_registro_blocco_a_09_17_13_26.md` — handoff di apertura sessione, contiene i debiti D1 (sicurezza) e la diagnosi del Blocco B già eseguita
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts:44-61` — `requireResidenceAccess`, pattern RLS-delegato rispecchiato in `createAdminInvite`
- `supabase/migrations/002_rls.sql`, `006_m4.sql`, `019_invites_admin_role_check.sql` — RLS su `residences`/`invites`, conferma che tutte le 4 action di invito scrivono con service client (RLS non protegge la scrittura)
- `src/app/welcome/[token]/accept/accept-invite.ts` — conferma che l'unità ha precedenza sulla colonna `residence_id` dell'invito in fase di accettazione (per questo il buco A non produce escalation, solo leak/incoerenza)

## Decisioni chiave
- **Git vince sull'handoff mancante (confermato)**: i commit 4 e 5 del Blocco B erano già in git da una sessione precedente senza handoff; verificati contro D1/D2/D4 invece di essere rifatti.
- **Ordine invertito su richiesta**: il piano proponeva prima il buco A poi il buco B; Filippo ha chiesto di invertire (prima B — `createAdminInvite`, poi A — `createFamilyInvite`). Eseguito nell'ordine richiesto.
- **Query di coerenza prima del commit A, come condizione esplicita**: se fossero emerse righe con `residence_id` incoerente, la sessione si sarebbe fermata prima di scrivere codice. Risultato: zero righe, via libera senza bonifica.
- **Guardia minima = derivare, non verificare (buco A)**: invece di aggiungere un confronto `residenceId === unit.residence_id`, il parametro è stato rimosso dalla firma: il vettore contraffattabile non esiste più, non serve un controllo che potrebbe essere dimenticato altrove.
- **Guardia minima = lettura RLS-delegata (buco B)**: stesso pattern di `requireResidenceAccess` in `units/actions.ts`, non un confronto `builder_id` ricopiato — il perimetro lo decide sempre la policy `czero_can_access_residence`.
- **Sospetto B su `createInvite`/`createBulkInvites` infondato**: la diagnosi ha verificato che entrambe passano già da `requireCaller` + `requireUnitsInResidence`, RLS-delegato; nessuna modifica necessaria, evitato un fix su codice già protetto.
- **Card Attività — anno solo se diverso**: confermato da Filippo dopo la proposta in FASE 0; implementato con `sameYear` spread condizionale in `toLocaleDateString`.
- **Nessun refactor degli helper duplicati incontrati in diagnosi**: `formatDate` locale duplicato in `page.tsx` e `admin/manutenzioni/page.tsx` (per scadenze manutenzioni, dominio diverso da `activity_events`) non toccato — fuori scope del commit sulla card Attività.

## Stato attuale
### Funziona
- `npm run verify` verde su tutti e tre i commit (`a1a1550`, `c2d1b1f`, `0c0dc82`): tsc pulito, lint con il solo warning noto (`src/app/api/reconcile-documents/route.ts:12`)
- Query di controllo sugli inviti esistenti eseguita in sola lettura: 0 righe incoerenti tra `invites.residence_id` e la residenza dell'unità collegata
- Working tree pulito, `package-lock.json` ripristinato ai fine-riga corretti

### Non funziona / da verificare
- **Nessuna prova a mano eseguita in questa sessione** sui tre commit: né i tre atti di sicurezza (invito familiare, invito admin cross-builder, invito admin legittimo), né la card Attività su Residenza Cavaccio. Gli STOP sono stati inviati ma la sessione è terminata prima della conferma.
- **Il ramo ostile di `createAdminInvite` non è provabile dalla UI** con un solo builder di test: serve un secondo builder o una chiamata diretta con id contraffatto per una prova comportamentale positiva; la garanzia oggi è solo di lettura del codice.
- **`main` avanti su `origin/main`**: non pushato in questa sessione (né richiesto).

## Prossimi passi
1. **Prova a mano — sicurezza inviti**: da lorofilippo2002, generare un invito familiare e verificare nel SQL Editor che `invites.residence_id` coincida con `units.residence_id` dell'unità. Da pippoloro02 su Residenza Cavaccio, generare un invito amministratore e confermare che il flusso legittimo non è stato rotto dalla guardia.
2. **Prova a mano — card Attività**: aprire Residenza Cavaccio in dev e verificare "Ultima: oggi, HH:mm" (ci sono eventi freschi dai commit di questa sessione) e, su una residenza senza eventi, "Nessuna attività".
3. **Scope creep (b) — prossimo commit candidato**: `invites.created_by` non è mai valorizzato da nessuna delle 4 action di invito. Segnalato in FASE 0, non assorbito nei commit di sicurezza.
4. **Scope creep (a) e (c) — da decidere se aprire**: (a) helper condiviso di perimetro residenza tra `units/actions.ts` e `admin-actions.ts` (oggi il pattern è duplicato in due file); (c) eventuale vincolo/trigger DB di coerenza `unit_id ↔ residence_id` su `invites` (oggi solo `CHECK (unit_id IS NOT NULL OR residence_id IS NOT NULL)`, nessun controllo di coerenza a livello schema).
5. **Push dei commit accumulati** quando Filippo lo decide (nessuna richiesta in questa sessione).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# gate pre-commit
npm run verify

# commit di questa sessione
git log --oneline 5da178a..HEAD
```

```sql
-- Controllo coerenza inviti (SQL Editor, statement singolo) — già eseguita, 0 righe
select i.id, i.unit_id, i.residence_id as invite_residence, u.residence_id as unit_residence, i.role, i.used_at, i.created_at
from invites i
join units u on u.id = i.unit_id
where i.residence_id is not null
  and i.residence_id <> u.residence_id
order by i.created_at desc;
```

## Domande aperte
- **Prova comportamentale del buco B**: senza un secondo builder di test, il caso ostile di `createAdminInvite` (residenza di un altro costruttore) resta verificato solo per lettura del codice. Serve deciderne il valore: aprire un builder demo secondario, o accettare la sola prova statica?
- **`created_by` su `invites`**: quando aprire il commit candidato (b)? È un campo di audit puro, non blocca nulla oggi, ma resta un gap silenzioso su chi ha generato ogni invito.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Regole di codice ricorrenti**: `Guardia minima per un parametro non fidato dal client: quando un valore (es. residenceId) deve corrispondere a un'entità già verificata nella stessa richiesta (es. unitId), non aggiungere un confronto — rimuovi il parametro dalla firma e derivalo lato server da quell'entità. Un vettore che non esiste più non può essere dimenticato in un futuro refactor; un confronto sì. Applicato in createFamilyInvite (profilo/actions.ts), che non riceve più residenceId.`

- **Sezione Regole di codice ricorrenti**: `Ogni server action che scrive con il service client (bypassa RLS) su una risorsa scoped a builder/residenza deve prima leggere quella risorsa con il client di sessione, mai limitarsi al check di ruolo: la lettura RLS-delegata (pattern requireResidenceAccess in units/actions.ts) è il perimetro, un check di solo ruolo (assertSuperAdmin/requireCaller) non basta quando la scrittura successiva ignora la RLS. Trovata in createAdminInvite: solo il ruolo era verificato, mancava la lettura di residences che avrebbe filtrato le residenze di un altro costruttore.`

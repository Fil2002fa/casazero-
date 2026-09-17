# Handoff — Verifica dal vivo del registro attività · 11/09/2026 15:58

## Sommario
Sessione senza modifiche al codice: ricostruzione dello stato e chiusura del blocco
"registro attività". Il piano approvato per la pagina Attività di residenza risultava
già eseguito da una sessione precedente (`session_017mUmLLDe5kQZzXfRRScnVd`, 10/09 sera)
nei due commit `391d346` e `b217ddf`, rimasti però senza handoff. Filippo ha portato in
sessione gli esiti delle prove dal vivo dell'11/09, che coprono i punti 1 e 2 lasciati
aperti dall'handoff delle 13:36 del 10/09 e verificano anche due commit più vecchi mai
provati a runtime. Resta non eseguito il solo probe RLS.

## Lavoro completato
- [x] Apertura sessione: `git log --oneline -10` + `git status --short` (albero pulito, branch `main`)
- [x] Ricostruito il percorso dall'ultimo handoff (`HANDOFF_registro_attivita_sollecito_09_10_13_36.md`) e da git
- [x] Accertato che il piano approvato era già stato eseguito: mappatura uno a uno delle 4 decisioni (D1–D4) e delle 6 correzioni sui corpi dei commit `391d346` e `b217ddf`
- [x] Verificata la presenza in albero dei file prodotti da quel piano
- [x] Registrati gli esiti delle prove dal vivo dell'11/09 (sotto, "Stato attuale")
- [x] Colmato il buco documentale: i commit delle 18:18 e 18:22 del 10/09 non erano coperti da alcun handoff
- [ ] **Probe RLS di `b217ddf` NON eseguito** — SQL pronto in "Prossimi passi", lo esegue Filippo

## File toccati

### Creati
- `docs/handoffs/HANDOFF_verifica_registro_attivita_09_11_15_58.md` — questo documento.

### Modificati
- Nessuno. La sessione non ha toccato codice: `git status` pulito, `git diff --stat HEAD` vuoto.

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_registro_attivita_sollecito_09_10_13_36.md` — ultimo handoff disponibile; da qui vengono i punti 1 e 2 ("prova positiva", "prova negativa") che questa sessione chiude.
- `src/lib/activity-event-view.ts` — resa a lettura del registro: `ACTIVITY_EVENT_ICON` tipizzata `Record<ActivityEventType, LucideIcon>` (`:26`), `NEUTRAL_LABEL` sugli 8 tipi (`:45`), `activityEventSubject` che decide su `unit_id` e non sull'embed (`:73`), `describeActivityEvent` con frase piena solo per `sollecito_inviato` (`:84`).
- `src/app/(dashboard)/admin/residences/[id]/attivita/page.tsx` — rotta unica per i due ruoli: `requireRole(['admin','super_admin'])` a `:47`, nessun gate applicativo su `admin_assignments`, `notFound()` a `:56` sul ritorno vuoto del client RLS-scoped. `embeddedUnitLabel` a `:31` difende dall'embed to-one che PostgREST può restituire come oggetto o come array.
- `supabase/migrations/037_activity_events.sql` — policy SELECT solo per `super_admin` (`:110`) e `admin` (`:122`): **nessuna policy SELECT per il ruolo residente**, che è la base del probe ancora da eseguire. Avvertenza sul bypass del service role a `:18-20`.
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — le due facce della griglia porte: array super_admin `:321-329` con `xl:grid-cols-5` a `:349`, array admin `:447-453` con `md:grid-cols-4` a `:484`. Sei porte in totale: è qui che nasce il debito di allineamento registrato sotto.

## Decisioni chiave

- **Nessuna riscrittura del lavoro già fatto**: la prima ipotesi di sessione era eseguire il piano incollato. Prima di toccare qualsiasi cosa si è verificato contro git, e i due commit c'erano già con quelle stesse motivazioni nel corpo. Alternativa scartata: ripartire dal piano come se fosse nuovo, che avrebbe prodotto un secondo set di helper sugli stessi concern — esattamente la duplicazione che il piano voleva eliminare.

- **Blocco "registro attività" dichiarato CHIUSO con un produttore su otto**: la catena scrittura → lettura è provata end-to-end, e questo è il criterio di chiusura. Agganciare gli altri sette produttori è lavoro nuovo, non completamento di questo. Alternativa scartata: tenere il blocco aperto fino a otto produttori, che avrebbe trattenuto indefinitamente un'infrastruttura già verificata.

- **Debito della card "Attività" registrato, non assorbito**: la card è un registro dentro una griglia di *porte* a oggetto — stona per natura, e con la sesta voce l'allineamento si rompe (`xl:grid-cols-5` lascia Attività sola su riga nuova per il super_admin; `md:grid-cols-4` la mette 4+2 per l'admin). Si rivaluta quando più tipi di evento scriveranno nel registro, perché è allora che si saprà se il posto giusto è una porta, una sezione della testata o una voce di navigazione. Alternativa scartata: spostarla adesso a intuito, decidendo la forma definitiva di una superficie che oggi mostra un solo tipo di evento.

- **Il probe RLS resta un debito dichiarato, non un esito assunto**: la pagina è stata vista funzionare da super_admin, ma questo non prova nulla sul confinamento del residente. L'esito non verificato non entra nella sezione "Funziona" (CLAUDE.md, Metodo di lavoro §8).

## Stato attuale

### Funziona
Verificato dal vivo l'11/09/2026 da Filippo:

- **Pagina `residences/[id]/attivita`**: su "Test manutenzione" mostra la riga del sollecito del 10/09 con unità, frase costruita dal payload, attore ("Filippo test") e ora, raggruppata sotto "Ieri". Su una residenza senza eventi, empty state corretto.
- **Catena completa end-to-end**: sollecito → email ricevuta → riga in `activity_events` → riga visibile nel feed. È la prima volta che il registro viene provato a runtime da capo a fondo: fino a ieri la tabella non aveva mai ricevuto una riga da codice applicativo.
- **SELECT su `activity_events` del 10/09**: una sola riga per atto, `actor_role = 'super_admin'`, `actor_name` congelato e non null, payload con `sent = 1`, `days_late = 20`, `message_ids` valorizzato. L'invariante "una riga per atto, non per destinatario" regge sui dati reali.
- **`115189e`** (super_admin in sola lettura sul dettaglio manutenzione): da `filippoloro02` i bottoni di azione compaiono. Verificato dal vivo.
- **`4ee8e0d`** (deep link che sopravvive al login): il login porta alla voce richiesta e non alla lista. Verificato dal vivo.

Stato del repo:
- Branch `main`, allineato a `origin/main`, working tree pulito. Nessuna modifica pendente.
- Ultimo commit di codice: `b217ddf`; `18fd873` è solo un sync di 12 handoff dal laptop.

### Non funziona / da verificare
- **Probe RLS di `b217ddf` non eseguito**: lettura di `activity_events` come residente. È la prova che regge la decisione D1 (niente gate applicativo, ci pensa RLS). Finché non gira, il confinamento è dedotto dalle policy lette, non osservato.
- **Il caso davvero discriminante per D1 non è il residente ma l'admin non assegnato.** Un residente non ha alcuna policy SELECT sulla tabella (`037:110` e `:122` coprono solo `super_admin` e `admin`), quindi legge zero righe per costruzione ed è una prova debole. La decisione D1 dice che un admin che apre la rotta di una residenza **che non segue** deve vedere 404 grazie a RLS: quella è la prova che vale. Segnalato, non aggiunto al piano di mia iniziativa — decide Filippo.
- **`logActivityEvent` resta silenzioso in caso di fallimento** (solo `console.error`): un'email parte, la riga di registro non si scrive, nessuno se ne accorge fuori dai log. Domanda ancora aperta dall'handoff precedente.
- **L'insert su `notifications`** (`src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts:205`) non cattura `error`: un fallimento del ledger di consegna passa silenzioso. Debito registrato il 10/09, ancora aperto, commit separato.
- **Card "Attività" nella griglia porte**: debito di forma e allineamento descritto sopra. Non è un bug, non va toccato ora.
- **Sette tipi di evento su otto non hanno produttore**: `invito_inviato`, `invito_accettato`, `admin_assegnato`, `admin_rimosso`, `documento_caricato`, `documento_classificato`, `voce_archiviata`. Per quelli la pagina mostrerebbe l'etichetta neutra, ma nessuna riga può esistere.

## Prossimi passi

1. **Eseguire il probe RLS di `b217ddf`.** Nel SQL Editor di Supabase, sostituendo l'UUID con quello del profilo residente (`lorofilippo2002`):

   ```sql
   -- Probe RLS su activity_events — lettura come residente.
   -- Atteso: 0. Il residente non ha alcuna policy SELECT sulla tabella
   -- (037_activity_events.sql:110 e :122 coprono solo super_admin e admin).
   BEGIN;
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claims = '{"sub":"<UUID_PROFILO_RESIDENTE>","role":"authenticated"}';
     SELECT count(*) AS righe_viste_dal_residente FROM public.activity_events;
   ROLLBACK;
   ```

   Se il SQL Editor non consente `SET LOCAL ROLE` o l'impostazione delle claim, **non dichiarare l'esito**: riportare il limite esatto e cosa lo ha sostituito (CLAUDE.md, Metodo di lavoro §8).

2. **Decidere se aggiungere il probe dell'admin non assegnato**, che è quello che prova davvero D1:

   ```sql
   -- Probe RLS su activity_events — admin NON assegnato alla residenza.
   -- Atteso: 0 righe, che è ciò che fa scattare notFound() nella rotta.
   BEGIN;
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claims = '{"sub":"<UUID_PROFILO_ADMIN_NON_ASSEGNATO>","role":"authenticated"}';
     SELECT count(*) AS righe_viste
     FROM public.activity_events
     WHERE residence_id = '<UUID_RESIDENZA_NON_SEGUITA>';
   ROLLBACK;
   ```

   Controprova consigliata da UI: entrare come admin non assegnato su `/admin/residences/<id>/attivita` e verificare il 404.

3. **Portare gli esiti dei probe in un footer di verifica reale** su `supabase/migrations/037_activity_events.sql`, come già fatto per `b7830f3`.

4. **Decidere gli altri sette produttori di eventi** e in quale ordine agganciarli. La frase piena di ciascuno si scrive nel commit del suo produttore, mai prima: oggi hanno etichetta neutra senza interpolazione proprio per questo.

5. **Rivalutare la posizione della card "Attività"** solo quando più tipi di evento scriveranno nel registro.

## Comandi da rilanciare

```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start

# Gate pre-commit
npm run verify
```

## Domande aperte
- Il probe del residente basta a chiudere la verifica di D1, o serve anche quello dell'admin non assegnato? Il primo è vero per costruzione (nessuna policy), il secondo è l'unico che esercita davvero il ramo `EXISTS` su `admin_assignments`.
- `logActivityEvent` deve restare `Promise<void>` con `console.error`, o propagare un esito al chiamante? (Aperta dal 10/09.)
- `payload.title` congela il titolo del template. Sopravvive a una rinomina del catalogo, ma è un dato in una riga immutabile: si tiene, o si passa al solo `template_id` lasciando alla UI la risoluzione? (Aperta dal 10/09.)
- Il commento della migrazione 037 cita `completions.performed_by_name` come precedente del congelamento dell'attore, ma quel campo è digitato dall'utente nel form (`admin/manutenzioni/actions.ts:61`): va corretto? (Aperta dal 10/09.)
- La card "Attività" resta una porta, o il registro va altrove? Decisione rimandata per scelta.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Metodo di lavoro**: prima di eseguire un piano approvato, verificare contro `git log` che non sia già stato eseguito. Un piano può tornare in sessione a distanza di ore o di giorni, da un'altra macchina o da un'altra sessione, e il corpo dei commit è l'unica prova di cosa è già stato fatto: se le decisioni del piano compaiono già nei messaggi di commit, il lavoro c'è. Rieseguirlo non produce un errore visibile — produce una seconda copia degli stessi helper, cioè esattamente la duplicazione che il piano voleva togliere.

- **Sezione Metodo di lavoro**: ogni sessione che produce commit produce il suo handoff, prima di chiudere. Un commit senza handoff è uno stato che vive solo nel corpo del messaggio di commit: la sessione successiva lo ricostruisce a mano e le domande aperte di quel lavoro si perdono. Un sync che importa handoff da un'altra macchina non sostituisce l'handoff della sessione: sincronizza documenti vecchi, non ne scrive uno nuovo.

- **Sezione Metodo di lavoro**: un probe che verifica un confinamento va scelto sul caso che esercita davvero la condizione. Verificare che un ruolo **senza alcuna policy** legga zero righe non prova nulla sulla policy, perché il risultato sarebbe zero comunque. Il caso da provare è quello in cui la policy esiste e la sua condizione deve valutare falso — un admin su una residenza che non segue, non un residente su una tabella che non lo contempla.

- **Sezione Regole di codice**: quando la decisione su cosa mostrare dipende da un dato che RLS può nascondere, decidere sempre sulla colonna top-level e mai sull'embed. `unit_id` dice se l'evento è di unità; `units(label)` può tornare vuoto perché RLS lo nasconde, e decidere su quello renderebbe un evento di unità come condominiale — una riga di registro immutabile mostrata falsa. Le condizioni "assente", "presente ma non leggibile" e "presente e leggibile" vanno tenute distinte.

- **Sezione Regole di codice**: un embed to-one di PostgREST può arrivare come oggetto o come array di un elemento a seconda di come il client deduce la relazione, e con un client non tipizzato il compilatore non discrimina il caso. Va sempre normalizzato con un helper difensivo: assumere solo l'oggetto produce un valore null silenzioso, non un errore.

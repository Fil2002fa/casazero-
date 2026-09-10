# Handoff — Registro attività agganciato al sollecito · 10/09/2026 13:36

## Sommario
Il registro attività (`activity_events`, migrazione 037, già applicata) aveva la tabella ma nessun codice applicativo: zero occorrenze in `src/`. Questa sessione ha creato l'helper unico di scrittura e lo ha agganciato al primo produttore di eventi, il sollecito manuale, che ora scrive una riga `sollecito_inviato` per atto. La FASE 0 ha inoltre scoperto che il primo dei tre commit pianificati era già in `main` da `bc4337d`, riducendo il piano da tre a due commit, e ha corretto quattro premesse sbagliate del piano: path inesistente, ancora di riga errata, forma di `outcome`, prova negativa non discriminante.

## Lavoro completato
- [x] FASE 0 read-only con STOP: 11 riscontri numerati, ognuno con path:riga e codice reale
- [x] Scoperto che il Commit 2 del piano originale era già fatto in `bc4337d` (9 set) — eliminato dal piano
- [x] Commit `fc859df` — nuovo `src/lib/activity-log.ts`, helper unico di scrittura, zero call-site
- [x] Commit `ea9ab1f` — evento `sollecito_inviato` agganciato a `sollecitaItem`
- [x] `npm run verify` eseguito e mostrato prima di ciascun commit, più una terza volta sull'albero committato (una correzione di accento in un commento era arrivata dopo il gate)
- [ ] **Prova dal vivo NON eseguita** — richiede Filippo, vedi "Non funziona / da verificare"

## File toccati

### Creati
- `src/lib/activity-log.ts` — unica fonte di verità per scrivere `activity_events`. Esporta `ActivityEventType` (gli 8 valori allineati uno a uno al CHECK della 037), `ActivityPayload`, `ActivityEventInput` e `logActivityEvent(svc, input)`. Richiede un client service role. Non solleva mai e non restituisce esito: registra il fallimento su `console.error` e prosegue.
- `docs/handoffs/HANDOFF_registro_attivita_sollecito_09_10_13_36.md` — questo documento.

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts` (+82 / −5) — quattro cambiamenti dentro `sollecitaItem`:
  1. `:80` la select del profilo passa da `'role, builder_id'` a `'role, builder_id, full_name'`. Necessaria: senza `full_name` l'`actor_name` nascerebbe null e resterebbe null per sempre, perché la tabella è append-only.
  2. `:160-163` nuovo accumulatore `messageIds: string[]`, dichiarato accanto a `outcome`.
  3. `:186-196` il ramo di invio si ramifica su `res.status === 'sent'` invece che su `delivery === 'sent'`, perché solo il primo dà al compilatore l'accesso a `res.id`. Il gruppo `if/else if/else` è passato a graffe per ospitare il push.
  4. `:222-283` innesto di `logActivityEvent`, fuori dal loop e prima del `return`, condizionato a `outcome.sent > 0`, con i giorni di ritardo calcolati inline.

### Letti (rilevanti per capire il contesto)
- `src/lib/notifications.ts` — per verificare che `EmailResult` esponesse già `id: string | null` nel ramo `sent` (`:16`, `:52`). Lo esponeva: il piano descriveva il codice di prima di `bc4337d`.
- `supabase/migrations/037_activity_events.sql` — schema, CHECK su `event_type` (`:37-54`), policy RLS e l'avvertenza `:18-20` sul bypass del service role.
- `src/lib/maintenance-status.ts` — per accertare che nessun export restituisse un delta numerico di giorni (`isOverdueLive` è boolean a `:85`, `formatRelativeDue` è stringa a `:201`) e per riusarne l'aritmetica.
- `src/lib/notification-recipients.ts` — modello di stile per un helper che riceve un `SupabaseClient`.
- `src/lib/supabase/admin.ts` — `createServiceClient()` non è tipizzato con i generics del Database.
- `src/app/(dashboard)/admin/manutenzioni/actions.ts` `:61` e `src/components/N3AdminActions.tsx` `:76` — per accertare come `completions.performed_by_name` viene realmente valorizzato.

## Decisioni chiave

- **Una riga per ATTO, non per destinatario**: l'innesto sta fuori dal loop. Il dettaglio di consegna per-destinatario esiste già in `notifications`, che resta intatta come ledger di consegna. Alternativa scartata: una riga di registro per destinatario, che avrebbe duplicato `notifications` e moltiplicato un atto singolo in N righe storiche.

- **Scrittura condizionata a `outcome.sent > 0`**: se tutti i destinatari finiscono in `skipped`, `withoutEmail` o `simulated`, nessuna email è partita e non c'è atto da registrare. Alternativa scartata: registrare sempre l'atto con gli esiti nel payload — un registro che dice "inviato" quando non è partito nulla è peggio di nessun registro, e la riga non si può più togliere.

- **Payload con tutti e cinque gli esiti di `SollecitoOutcome`**: `sent`, `simulated`, `failed`, `without_email`, `skipped`. Il piano ne prevedeva tre più un campo `recipients_reached`; quest'ultimo è stato eliminato perché è esattamente `outcome.sent`, e duplicarlo avrebbe creato due fonti di verità dentro la stessa riga immutabile. Con i soli riusciti la riga non distinguerebbe "unico destinatario raggiunto" da "uno su sei".

- **Narrowing su `res.status`, non su `delivery`**: `delivery` è una stringa derivata e non prova nulla a TypeScript; solo il ramo `sent` di `EmailResult` espone `id`. Alternativa scartata: un cast, che avrebbe nascosto la ragione del vincolo.

- **`message_ids: string[]` invece di un singolo id**: il sollecito è un atto solo ma i destinatari possono essere N, quindi gli id sono N. Raccoglie solo gli invii riusciti; un `res.id` null (Resend non lo restituisce) non entra nell'array.

- **Giorni di ritardo calcolati inline**: il valore serve a questa sola superficie, quindi la regola della fonte di verità unica non scatta. Alternativa scartata: un nuovo export in `maintenance-status.ts`, che avrebbe aggiunto un secondo concern al commit.

- **Ternario su `next_due_date` con ramo irraggiungibile**: `isOverdueLive` a `:129` ha già escluso il null, ma senza il ternario un null produrrebbe `NaN` in una tabella append-only. Il commento dichiara esplicitamente che il ramo non è raggiungibile, così non viene letto come un dubbio sull'invariante. Costo: una riga.

- **`logActivityEvent` non solleva e non propaga esito**: il registro documenta un atto già avvenuto e irreversibile (un'email partita). Far fallire il sollecito perché non si scrive la riga di registro restituirebbe al chiamante un errore falso su un atto realmente compiuto. Il fallimento va su `console.error`. Alternativa ancora aperta, vedi Domande aperte.

- **`full_name` nella select non è scope creep**: è inseparabile dal congelamento del nome. Senza, il registro nasce con `actor_name` null e resta così per sempre.

- **Antispoofing garantito in codice, non da RLS**: `sollecitaItem` usa il client service role, che bypassa RLS e i GRANT (`037:18-20`), quindi le policy INSERT con `actor_id = auth.uid()` non proteggono questa strada. `actorId` viene sempre da `user.id` della sessione.

## Stato attuale

### Funziona
- `npm run verify` pulito su entrambi i commit e sull'albero finale: `tsc --noEmit` senza output. Unico warning lint: `src/app/api/reconcile-documents/route.ts:12` — preesistente, file non toccato in questa sessione.
- Working tree senza modifiche tracciate pendenti; solo handoff `.md` untracked. Branch `main`.
- Il tipo `ActivityEventType` è allineato uno a uno al CHECK della 037: nessuna migrazione serve.
- `logActivityEvent` ha esattamente un call-site (`sollecitaItem`); il Commit 1 ne aveva zero, come previsto dal piano.

### Non funziona / da verificare
- **Nessuna prova dal vivo eseguita.** Il lavoro è compilato e committato, non provato a runtime. Nessuna riga è mai stata scritta in `activity_events` da codice applicativo: la tabella è tuttora vuota per quanto riguarda l'uso applicativo.
- `activity_events` non è presente in `src/types/database.ts`: la riga non è tipizzata e `createServiceClient()` non porta i generics del Database, quindi l'insert non è controllato dal compilatore sui nomi di colonna. Un errore di nome si scoprirebbe solo a runtime.
- Il cron non gira in locale — irrilevante qui, `sollecitaItem` è una server action manuale.

## Prossimi passi

1. **Prova positiva.** Sollecitare dal vivo una voce di Modalità Amministratore scaduta di Residenza Cavaccio, con destinatario `filippoloro02` (è l'indirizzo dell'account Resend, l'unico a cui la sandbox consegna). Poi in SQL Editor:

   ```sql
   SELECT event_type, actor_role, actor_name, payload, created_at
   FROM activity_events ORDER BY created_at DESC LIMIT 5;
   ```

   Attesa: **una sola riga**, `event_type = 'sollecito_inviato'`, `actor_role = 'super_admin'`, `actor_name` valorizzato e non null, `payload->>'sent'` uguale a `1`, `payload->'message_ids'` con un id reale, `payload->>'days_late'` numero maggiore o uguale a 1, `unit_id` valorizzato se la voce è di unità e NULL se condominiale.

2. **Prova negativa.** Togliere `RESEND_API_KEY` e sollecitare una voce **diversa** da quella del punto 1. Sulla stessa voce l'anti-spam a 24 ore la manderebbe in `skipped`, producendo zero righe per il motivo sbagliato e non provando nulla. Attesa: `outcome.sent` resta 0, nessuna riga nuova.

3. Portare gli esiti dei punti 1 e 2 in un footer di verifica reale, come già fatto per `b7830f3`.

4. Aggiungere il tipo di riga `activity_events` a `src/types/database.ts`, così l'insert è controllato dal compilatore sui nomi di colonna. Commit separato.

5. Decidere gli altri 7 produttori di eventi (`invito_inviato`, `invito_accettato`, `admin_assegnato`, `admin_rimosso`, `documento_caricato`, `documento_classificato`, `voce_archiviata`) e la superficie di lettura del registro. Nessuno è agganciato oggi.

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
- `logActivityEvent` deve restare `Promise<void>` con `console.error`, o propagare un esito al chiamante? Oggi un fallimento di scrittura del registro è silenzioso fuori dai log.
- `payload.title` è il titolo del template, quindi un dato — ma resta una stringa leggibile. Va bene, o il registro deve portare solo `template_id` e lasciare alla UI la risoluzione del titolo? Il titolo congelato sopravvive a una rinomina del catalogo; il `template_id` no.
- **Debito registrato, non assorbito:** l'insert su `notifications` (`src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts:191` prima di questa sessione, oggi `:205`) non cattura `error`. Un fallimento di scrittura del ledger di consegna passa silenzioso. Commit separato, quando si decide.
- La 037 cita `completions.performed_by_name` come precedente del congelamento dell'attore, ma quel campo è digitato dall'utente nel form (`admin/manutenzioni/actions.ts:61`). Il commento della migrazione va corretto? Non è un bug di codice, ma è una fonte di verità documentale sbagliata.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: `activity_events` è append-only come `completions`: nessuna policy UPDATE o DELETE, per nessun ruolo. Ogni riga scritta è definitiva, quindi una riga si scrive solo quando l'atto che documenta è realmente avvenuto — mai in ottimismo, mai prima dell'esito. Nel payload vanno solo dati strutturati (id, codici, numeri, flag): mai testo già formattato per lo schermo, perché una frase sbagliata resterebbe sbagliata per sempre e la resa testuale è responsabilità della UI, che può cambiare idea. Il registro documenta **atti**, una riga per atto: il dettaglio per-destinatario resta in `notifications`, che è il ledger di consegna e non va duplicata.

- **Sezione Invarianti**: `actor_id`, `actor_role` e `actor_name` di `activity_events` sono congelati al momento dell'atto: si passano espliciti a `logActivityEvent`, letti lato server dalla sessione, e non si risolvono mai da `profiles` a lettura. Il vincolo è più forte di quello di `completions.performed_by_name`, che invece arriva da un campo digitato dall'utente nel form: non usare quest'ultimo come modello.

- **Sezione Regole di codice**: quando una scrittura passa dal client service role, le policy RLS della tabella non la vincolano — il service role bypassa RLS e i GRANT. Ogni garanzia che le policy esprimono, in primis l'antispoofing `actor_id = auth.uid()`, va allora riprodotta in codice nel call-site, e il commento deve dire che quella riga è l'unico punto in cui la garanzia vive. Non dare mai per scontato che una policy INSERT protegga una server action.

- **Sezione Regole di codice**: il narrowing di una union discriminata va fatto sul discriminante originale, mai su una variabile derivata da esso. Una stringa calcolata da `res.status` non prova nulla al compilatore sui campi presenti nel ramo: `if (delivery === 'sent')` non dà accesso a `res.id`, `if (res.status === 'sent')` sì. Ricorrere a un cast per aggirarlo nasconde la ragione del vincolo.

- **Sezione Metodo di lavoro**: in FASE 0 le premesse fattuali di un piano approvato vanno riverificate contro il codice presente, non assunte. Un piano scritto giorni prima può descrivere un file già cambiato: in questa sessione un intero commit era già in `main`, il path indicato non esisteva, l'ancora di riga cadeva su una graffa di chiusura e la forma di un tipo aveva cinque campi invece di tre. Vale anche per le **prove**: una prova negativa va controllata perché discrimini davvero — spegnere `RESEND_FROM` non impedisce l'invio verso l'indirizzo dell'account Resend, e ripetere sulla stessa voce entro la finestra anti-spam produce zero righe per il motivo sbagliato.

- **Sezione Metodo di lavoro**: se una modifica arriva dopo l'esecuzione del gate — anche solo un commento — il gate va rieseguito e mostrato prima di dichiarare la build pulita. L'output incollato deve corrispondere all'albero che si sta committando, non a uno precedente.

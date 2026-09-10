# Handoff — Verifica dal vivo catena sollecito + migrazione 037 · 10/09/2026 12:07
> Aggiornato 10/09/2026 12:31 — chiuso il debito del mittente email (`bb35b81`).

## Sommario
Sessione di verifica dal vivo, non di costruzione: la catena del sollecito è stata
provata end-to-end su posta reale e la migrazione 037 (`activity_events`) è stata
applicata da Filippo nel SQL Editor con gli esiti reali incollati nel footer del file.
I tre commit sull'albero (`bc4337d`, `115189e`, `4ee8e0d`) sono correzioni nate da
quella prova sul campo. Il commit 1 del piano "registro attività" è chiuso; restano
aperti i commit 2-14. Delle tre voci di debito registrate, una è stata chiusa in
coda alla sessione (`bb35b81`, il mittente email diventa `RESEND_FROM`): resta però
una configurazione da fare su Vercel, senza la quale quel commit non protegge nulla.

## Lavoro completato
- [x] Migrazione 037 `activity_events` applicata nel SQL Editor (Filippo, 09/09/2026)
- [x] Footer di verifica reale della 037 committato (`b7830f3`): V1-V4 e V6 verdi con
      output incollato, V5 dichiarata non eseguibile con il motivo esatto
- [x] Catena sollecito provata end-to-end su posta reale (super_admin → admin)
- [x] `sendEmail` propaga il message id di Resend nel ramo `sent` (`bc4337d`)
- [x] Dettaglio manutenzione: il super_admin entra in sola lettura invece di essere
      espulso (`115189e`)
- [x] Login: il deep link richiesto sopravvive al login invece di essere scartato
      (`4ee8e0d`), con nuovo helper `src/lib/safe-next-path.ts`
- [x] FASE 0 sul mittente email, approvata, e commit unico `bb35b81`: il campo `from:`
      viene da `process.env.RESEND_FROM`. Working tree tornato pulito su
      `src/lib/notifications.ts`
- [ ] `RESEND_FROM` da impostare nelle env di produzione su Vercel: **configurazione,
      non codice** — nessun commit la può sostituire
- [ ] V5 della 037 (prova negativa di spoofing dell'attore): **da eseguire dall'app**,
      non dal SQL Editor
- [ ] Commit 2-14 del piano "registro attività" approvato in FASE 0: non iniziati

## File toccati
### Creati
- `src/lib/safe-next-path.ts` — validazione del path `next` di ritorno dal login
  (creato in `4ee8e0d`)
- `docs/handoffs/HANDOFF_verifica_dal_vivo_sollecito_09_10_12_07.md` — questo documento

### Modificati
- `src/lib/notifications.ts` — **due modifiche distinte, entrambe ora committate**:
  1. `bc4337d`: `sendEmail` ritorna il message id di Resend nel ramo `sent`
  2. `bb35b81`: il mittente non è più un letterale. Alla riga 35 del file committato
     `const from = process.env.RESEND_FROM || 'CasaZero <onboarding@resend.dev>'`, e la
     chiamata `resend.emails.send({ from, ... })` alla riga 46. Il commento sopra la
     lettura è scritto per chi configura Vercel, non per chi legge il codice.
     Durante la sessione del 09/09 questa riga era stata cambiata a mano nella sandbox
     e lasciata non committata: quel debito è chiuso, non solo committato
- `src/app/auth/callback/route.ts`, `src/app/auth/login/LoginForm.tsx`,
  `src/app/auth/login/page.tsx`, `src/middleware.ts` — propagazione del deep link
  attraverso login e callback OAuth (`4ee8e0d`)
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — accesso in sola lettura del
  super_admin al dettaglio manutenzione (`115189e`)

### Letti (rilevanti per il contesto)
- `supabase/migrations/037_activity_events.sql` — tabella append-only `activity_events`,
  RLS a due ruoli (super_admin e admin; il residente non ha policy SELECT), REVOKE di
  UPDATE/DELETE a livello di GRANT, e in fondo il blocco "ESITO REALE (apply 09/09/2026)"

## Decisioni chiave
- **V5 dichiarata non eseguibile invece che dichiarata verde**: il SQL Editor di Supabase
  gira come owner e bypassa RLS, quindi una prova negativa di spoofing dell'attore eseguita
  lì avrebbe dato un esito privo di significato. Il footer riporta il motivo esatto e
  rimanda la verifica a un test dall'app. Alternativa scartata: eseguirla comunque e
  segnare "passata".
- **V6 marcata come non discriminante**: la prova di immutabilità è passata senza errori,
  ma su tabella vuota. Registrata come da ripetere quando ci saranno eventi, invece di
  contarla come prova piena.
- **Helper `appUrl()` rifiutato come scope creep**: la duplicazione di
  `process.env.NEXT_PUBLIC_APP_URL` è stata riconosciuta ma non toccata in questa sessione,
  perché estranea al concern dei commit in corso. Rinviata a post-demo.
- **Fallback del mittente con `||` e non `??` (`bb35b81`)**: deviazione intenzionale dalla
  convenzione del repo, che usa `??` ovunque. Motivo: su Vercel una variabile creata e
  lasciata vuota è un caso reale, e `??` non intercetta la stringa vuota — produrrebbe
  `from: ''` e un errore Resend a runtime invece del fallback. La motivazione è nel
  commento accanto alla lettura, così la deviazione non sembra una svista.
- **La sandbox `onboarding@resend.dev` come valore di fallback, al posto del dominio di
  produzione che era committato prima**: senza dominio verificato su Resend entrambi i
  valori falliscono, ma la sandbox almeno consegna verso l'indirizzo dell'account, quindi
  come default di sviluppo è strettamente più utile. Conseguenza accettata a occhi aperti:
  un deploy che dimentichi `RESEND_FROM` non manda email a nessun destinatario reale.
- **Nessun file di documentazione env creato**: la FASE 0 ha verificato che non esiste
  (`.env.example`, `.env.sample`, `docs/env.md`, `README.md`: nessuno presente; `vercel.json`
  contiene solo i cron). Crearne uno sarebbe stato scope creep, quindi il commit tocca un
  solo file. `.env.local` è reale e non tracciato: non è documentazione e non è stato toccato.

## Stato attuale
### Funziona (verificato dal vivo il 09/09/2026)
- **Catena sollecito end-to-end**: email inviata dal super_admin verso l'admin, ricevuta
  nella posta in arrivo, contenuto corretto. L'anti-spam a 24h è risultato attivo al
  secondo tentativo.
- **Migrazione 037 applicata**, con esiti reali incollati nel footer del file:
  - V1 — 4 policy: 2 INSERT + 2 SELECT, nessuna UPDATE/DELETE/ALL
  - V2 — `authenticated`: INSERT, SELECT · `anon`: nessuna riga (REVOKE efficace)
  - V3 — `relrowsecurity = true`
  - V4 — zero righe: nessuna policy nomina `unit_members` (il ramo residente non è
    entrato di straforo via `czero_can_access_residence()`)
  - V6 — nessun errore, ma tabella vuota: prova non discriminante, da ripetere
- I commit `bc4337d`, `115189e`, `4ee8e0d`, `bb35b81` sono sull'albero, working tree per
  il resto pulito.
- **Mittente email da variabile d'ambiente (`bb35b81`)**, con le quattro prove eseguite:
  - `git status --short src/lib/notifications.ts` → nessuna riga: file pulito
  - `git show HEAD:src/lib/notifications.ts` riga 35 → `process.env.RESEND_FROM || ...`
  - le uniche righe con `from` nel committato sono la 35 (lettura) e la 46 (`from,`):
    nessun indirizzo letterale è il valore passato alla send
  - `resend.emails.send({ from, ... })` è l'unico punto di invio del repo, coerente con
    la mappatura fatta in FASE 0
  - `npm run verify`: `tsc --noEmit` pulito. Unico warning di lint preesistente e in file
    estraneo (`src/app/api/reconcile-documents/route.ts:12`, `req` non usato), non assorbito

### Esito dei Test 1 e 2 — DA COMPILARE
> **Punto lasciato aperto deliberatamente.** Filippo ha chiesto di riportare qui l'esito
> reale di due test manuali, ma questa sessione di handoff è ripartita da zero: i commit
> `bc4337d`/`115189e`/`4ee8e0d` provengono dalla sessione
> `session_01KSP22WNn5pHCz7saNh9NbT`, di cui l'agente che scrive non ha il transcript.
> Nessuna traccia di "Test 1" e "Test 2" nel repo né negli handoff precedenti.
> Scrivere un esito plausibile sarebbe stato un esito non verificato: qui resta il buco.
>
> - Test 1 — [da compilare]
> - Test 2 — [da compilare]

### Non funziona / da verificare
- **V5 della 037 mai eseguita**: la prova che un client non possa registrare un atto a
  nome di un altro (`actor_id = auth.uid()`) è ancora solo sulla carta. Va fatta da app,
  con utente super_admin autenticato, dopo il primo commit che scrive un evento.
- **`RESEND_FROM` non impostata in produzione**: il rischio non è più nel working tree
  (chiuso da `bb35b81`) ma nella configurazione. Finché la variabile non è valorizzata
  nelle env di produzione su Vercel con un dominio verificato nel pannello Resend, il
  deploy spedisce dalla sandbox e Resend risponde **403 verso qualsiasi destinatario
  diverso dall'indirizzo dell'account**. Da fare a mano prima della demo Furlan, se la
  demo prevede invii reali.
- **`maintenance_items` `d6d3eb88`**: ha `next_due_date = 2024-03-01` ma non risulta
  scaduta in nessuna vista. Divergenza dato/vista da indagare. Attenzione: non confonderla
  con il comportamento atteso in dev (il cron non gira in locale) né con l'invariante
  "Promemoria non è mai scaduta" — vanno esclusi entrambi prima di chiamarlo bug.

## Prossimi passi
1. Compilare l'esito dei Test 1 e 2 nella sezione qui sopra (serve l'input di Filippo).
2. ~~Risolvere il `from:` con una variabile d'ambiente~~ — **fatto, `bb35b81`.** Resta
   l'azione fuori dal repo: impostare `RESEND_FROM` nelle env di produzione su Vercel,
   con un dominio verificato su Resend. Verificare la verifica del dominio nel pannello
   Resend prima di dare per buono l'invio.
3. Aprire il commit 2 del piano "registro attività" (commit 2-14 ancora tutti da fare).
4. Eseguire V5 dall'app appena esiste il primo punto di scrittura su `activity_events`,
   e incollare l'esito reale nel footer della 037.
5. FASE 0 sulla divergenza di `maintenance_items d6d3eb88`: confrontare PRIMA lo scope
   delle query delle singole viste, poi le definizioni di "scaduta".
6. Post-demo: helper `appUrl()` per le occorrenze duplicate di `NEXT_PUBLIC_APP_URL`.
   **Nota di conteggio**: in sessione erano state indicate 6 copie, ma il grep sul repo
   oggi ne trova **7**, in 6 file distinti:
   `src/app/(app)/profilo/page.tsx` (righe 80 e 92 — due nello stesso file),
   `src/app/(dashboard)/admin/manutenzioni/actions.ts:8`,
   `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts:16`,
   `src/app/(dashboard)/admin/residences/[id]/page.tsx:266`,
   `src/app/(dashboard)/admin/residences/[id]/units/page.tsx:48`,
   `src/app/api/cron/daily/route.ts:11`.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Gate pre-commit obbligatorio
npm run verify

# Stato di partenza sessione
git log --oneline -10
git status --short

# Il mittente committato (deve mostrare RESEND_FROM, non un letterale)
git show HEAD:src/lib/notifications.ts | sed -n '20,46p'
```

## Domande aperte
- Qual è l'esito reale dei Test 1 e 2? Senza quello il buco resta in questo documento.
- `casazero.app` è già verificato nel pannello Resend, o va ancora fatto? La domanda non
  riguarda più il default nel codice (deciso: sandbox), ma il valore da mettere in
  `RESEND_FROM` su Vercel e se sia utilizzabile subito.
- La divergenza di `d6d3eb88` è un dato sporco della demo (Residenza Cavaccio è throwaway)
  o un difetto reale della definizione di "scaduta" nelle viste? Se è solo dato demo, non
  vale un commit.

## Leggi emerse (candidate per CLAUDE.md)
- **Sezione CLAUDE.md di destinazione — Metodo di lavoro**: Valori di ambiente di prova
  (indirizzi mittente, endpoint, chiavi sandbox) non si lasciano mai nel working tree a
  fine sessione: o diventano una variabile d'ambiente nello stesso commit che ne ha avuto
  bisogno, o si annullano prima di chiudere. Un valore sandbox lasciato lì è
  indistinguibile da una modifica voluta al primo `git add -A` della sessione successiva.
- **Sezione CLAUDE.md di destinazione — Regole di codice ricorrenti (bug class note)**:
  Fallback di una variabile d'ambiente con `||`, mai con `??`. Su Vercel una variabile
  creata e lasciata vuota è un caso reale e frequente: `??` non intercetta la stringa
  vuota e lascia passare `''` come valore buono, trasformando un errore di configurazione
  in un errore a runtime lontano dalla causa. `??` resta corretto solo dove la stringa
  vuota è un valore legittimo e distinto da "non impostata".
- **Sezione CLAUDE.md di destinazione — Metodo di lavoro**: Una prova negativa eseguita su
  una tabella vuota non è una prova: va registrata come "non discriminante, da ripetere
  quando esistono righe", mai come passata. Vale per ogni verifica di immutabilità o di
  scoping su tabelle appena create.

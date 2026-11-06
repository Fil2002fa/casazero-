# Handoff — B3 design fase 0 · 06/11/2026 09:49

## Sommario
Sessione di sola diagnosi (FASE 0) sul design attuale di CasaZero: inventario di pagine, token, componenti ripetuti, testi in inglese, responsive a 375px e accessibilità, più una proposta di ordine di lavoro in blocchi piccoli senza proporre il nuovo stile. L'esplorazione è stata fatta da tre subagent di sola lettura, i punti chiave sono stati riverificati nel codice. Nessun codice modificato. Unica scrittura: il documento di diagnosi, già committato.

## Lavoro completato
- [x] Inventario pagine admin costruttore (super_admin), admin condominio (admin), PWA residente, login/invito, errori, con componenti usati
- [x] Design system: token in `src/app/globals.css`, dove vengono rispettati e dove ignorati
- [x] Componenti ripetuti in modi diversi (bottoni, card, badge, form, tabelle, avvisi, stati vuoti, modali, spinner, errori pagina) con file:riga
- [x] Testi in inglese rimasti ed etichette duplicate
- [x] Responsive a 375px da lettura del codice
- [x] Accessibilità: contrasti calcolati sui token reali, focus, label, aria
- [x] Proposta di ordine di lavoro in 17 blocchi (fasi A, B, C) e lista di decisioni per Filippo
- [x] Commit `f0a0dc4` (solo docs) con `npm run verify` pulito
- [ ] Nessun blocco della proposta è stato iniziato: serve l'approvazione di Filippo

## File toccati
### Creati
- `docs/handoffs/b3-design-fase0.md` — diagnosi completa (sezioni 1-7 + limiti), committata in `f0a0dc4`
- `docs/handoffs/HANDOFF_b3_design_fase0_11_06_09_49.md` — questo handoff (non ancora committato)

### Modificati
- Nessuno.

### Letti (solo quelli rilevanti)
- `src/app/globals.css` — token `@theme`, z-index, font, ombra
- `src/app/layout.tsx` — font caricati (Inter 400/500, Source Serif 600), viewport, metadata
- `src/components/ui/{Button,Modal,BottomSheet}.tsx` — verifica diretta di hover hex, `font-semibold`, assenza di `max-h`, footer, focus ring
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ItemConfigForm.tsx` — `focus:outline-none` senza ring
- Ricerca `fixed inset-0` su tutto `src` — conferma dei modali a mano
- Il resto (conteggi grep, pagine, label, contrasti) viene dai tre subagent, non riverificato riga per riga

## Decisioni chiave
- **Subagent solo per l'esplorazione, scrittura mia**: tre subagent paralleli (pagine+testi, token+componenti, responsive+accessibilità); il documento l'ho scritto io dopo aver riverificato i punti più pesanti. Alternativa scartata: un unico subagent, troppo lento e con più rumore.
- **Commit docs solo del file b3**: i due handoff già non tracciati (`HANDOFF_b23_isolamento_builder_11_05_15_17.md`, `HANDOFF_e1a_excel_documenti_11_05_16_03.md`) sono rimasti fuori dal commit perché non appartengono a questo lavoro.
- **Proposta ordinata per dipendenza dallo stile**: prima rete di sicurezza e accessibilità (fase A), poi consolidamento sui componenti `ui/*` esistenti con aspetto invariato (fase B), il nuovo stile solo dopo (fase C). Alternativa scartata: partire dal restyling, che renderebbe incerti i conteggi di migrazione.
- **Nessuna proposta di stile**: raggi, famiglia colori di stato, pesi tipografici sono posti come domande a Filippo.

## Stato attuale
### Funziona
- `npm run verify` pulito a fine sessione (tsc, lint, nessun file in staging)
- Branch `main`, working tree pulito salvo i due handoff non tracciati e questo file

### Non funziona / da verificare
- Nessuna prova dal vivo: non ho avviato l'app né usato il browser. Da provare: 404 standard di Next in inglese, zoom iOS sugli input a 14px, overflow del footer di `ui/Modal` a 375px, visibilità reale del focus ring
- I conteggi dei subagent (es. 114 `<button>`, 64 campi, 37 campi senza label, 152 usi `semantic-*`) vanno rieseguiti con la stessa query prima di ogni commit
- Il conteggio dei campi senza label è euristico
- Esiste un branch locale `fix/sicurezza-accesso` non toccato in questa sessione

## Prossimi passi
1. Filippo risponde alle decisioni aperte (sotto) e approva l'ordine dei blocchi di `docs/handoffs/b3-design-fase0.md` sezione 7.
2. Blocco A1: creare `not-found.tsx`, `error.tsx`, `global-error.tsx` in italiano con `buttonVariants` esistente. Prova: `npm run verify`, URL inesistente e errore forzato in dev.
3. Blocco A2: titoli duplicati (`template` in `src/app/layout.tsx:23-24` + suffissi "— CasaZero" in `admin/fornitori/page.tsx:8`, `administrators/page.tsx:13`, `administrators/[id]/page.tsx:19`, `admin/manutenzioni/page.tsx:13`).
4. Blocco A6: `src/components/ui/Modal.tsx` — `max-h` con scroll, footer `flex-wrap`, id con `useId`.
5. Blocchi A4 e A5: label associate e `role="alert"`, prima PWA (`UploadDocumentForm`, `AddCommentForm`, `N3AdminActions`, toggle del profilo, `BottomNav`), poi dashboard.
6. Fase B in commit separati per file, a partire dai 6 modali a mano.

## Comandi da rilanciare
```bash
# Apertura sessione
git log --oneline -10 && git status --short

# Gate pre-commit
npm run verify

# Rieseguire i conteggi chiave prima di ogni blocco
# modali a mano
#   Grep "fixed inset-0" in src
# hex scritti a mano nelle classi
#   Grep "\[#[0-9A-Fa-f]{6}\]" in src

# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev
```

## Domande aperte
- Quale famiglia di colori di stato sopravvive, `semantic-*` (152 usi, legacy) o `status-*` (39 usi)? Il blu di "Consigliata" ha oggi due valori (`semantic-blue` e `status-reminder`).
- Raggio standard: `rounded-lg` (`ui/Button`, `ui/Input`) o `rounded-xl` (bottoni a mano, card)?
- Vocabolario unico per Condominio / Condominiale / Residenza; una sola parola per Salva, Annulla/Chiudi, Copia link.
- Le tre viste chiamate "Attività" vanno rinominate?
- L'hover di `ui/Button.tsx:13,17` richiede nuovi token o si ricava da quelli esistenti?
- Il focus ring a 3:1 e il bordo dei controlli cambiano il look di tutti i campi: farli in fase A o insieme al nuovo stile?

## Leggi emerse (candidate per CLAUDE.md)
Il riferimento di progetto indicato dal template è la milestone M5; questa sessione non l'ha toccata.

- **Regole di codice**: Modali e bottom sheet solo tramite `ui/Modal` e `ui/BottomSheet` (che portano `role="dialog"`, trap del focus, Escape, ripristino del focus, `z-modal`, `shadow-elevated`). Vietato ricreare overlay con `fixed inset-0` a mano: ne esistevano 6, ciascuno senza dialog, trap, scroll e con z-index e ombre diversi.
- **Regole di codice**: Mai colori hex o `bg-[#...]` nelle classi di componenti UI: solo token di `globals.css`. Se un valore manca, si aggiunge il token. Eccezioni: email (`lib/notifications.ts`) e PDF (`lib/pdf/*`), dove i token CSS non esistono.
- **Regole di codice**: Ogni campo di form ha una label programmaticamente associata (`<Label htmlFor>` + `id`, oppure `aria-label`); il placeholder non è una label. Ogni messaggio d'errore di form è annunciato (`role="alert"` o `FieldError` con role) e collegato al campo con `aria-describedby`.
- **Regole di codice**: Mai mostrare all'utente `error.message` grezzo di Supabase/Postgres: passa da un helper di traduzione (modello: `lib/supplier-errors.ts`). Estende la regola esistente sul non scartare `error`: oltre a distinguere dominio e guasto tecnico, il testo del guasto è in italiano e in parole fisse.
- **Regole di codice**: Font-weight solo tra quelli caricati (Inter 400/500, Source Serif 600). `font-semibold` e `<strong>` nudi su testo sans sono vietati: il browser sintetizza il grassetto.
- **Metodo di lavoro**: I conteggi e i numeri di riga riportati dai subagent sono ipotesi finché non sono riverificati dalla sessione principale con la stessa query. Un riscontro entra in un documento come "verificato" solo se la sessione principale ha visto l'output.

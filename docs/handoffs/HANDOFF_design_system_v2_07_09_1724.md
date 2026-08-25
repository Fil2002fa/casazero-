# Handoff — Design System v2 (token + componenti condivisi) · 09/07/2026 17:24

## Sommario
Sessione di fondamenta per il redesign M5: introdotti i token globali e i componenti condivisi (`Badge`, `Button`, `Modal`, `Toast`, `Input`, `Table`) che le schermate applicheranno nei task successivi, senza toccare nessuna schermata esistente. Seguito da un audit tecnico mirato sui sei componenti, quattro fix P1 di accessibilità/responsive in un commit separato, e infine la rigenerazione di `DESIGN.md`/`.impeccable/design.json` per far confluire il nuovo sistema nella documentazione visiva del progetto.

## Lavoro completato
- [x] COMMIT `4dde3a5` — token globali in `globals.css` (`--color-status-overdue/inprogress/reminder`, `--shadow-elevated`, scala `--z-*` semantica, `--font-serif`) tenuti in famiglia separata dai `--color-semantic-*` legacy, su decisione esplicita di Filippo
- [x] COMMIT `4dde3a5` — componenti condivisi in `src/components/ui/`: `Badge.tsx` (`StatusBadge`/`PromemoriaBadge`/`TypeBadge`), `Button.tsx`, `Modal.tsx`, `Toast.tsx`, `Input.tsx`, `Table.tsx`, più `src/lib/cn.ts`
- [x] Font Source Serif 4 aggiunto via `next/font/google` in `layout.tsx` (variable `--font-source-serif`), peso 600 unico, non ancora applicato a nessun H1 reale
- [x] `ToastProvider` montato in `layout.tsx` attorno a `children` (infrastruttura di root layout, non una schermata)
- [x] `/impeccable audit` sui sei file `ui/` — adattato manualmente (target headless, nessuna pagina renderizzata da ispezionare in browser): score 15/20, 3 P1 + 5 P2 + 2 P3, detector deterministico pulito
- [x] COMMIT `858cc60` — fix dei 4 P1 dell'audit: focus trap + focus iniziale/ripristino su `Modal`, `aria-invalid` automatico + `id` su `FieldError` per `Input`/`Textarea`/`Select`, navigazione da tastiera (`role`/`tabIndex`/`onKeyDown`) su `TableRow` cliccabile, altezza responsive `h-11 md:h-9` su `Button` size default
- [x] `/impeccable init` → `/impeccable document` (solo DESIGN.md, su richiesta esplicita di Filippo) — rigenerati `DESIGN.md` (root) e `.impeccable/design.json`, scansionando il codice v2 appena scritto insieme ai componenti legacy N1/N2/N3 ancora in produzione
- [x] `tsc --noEmit` e detector `impeccable` puliti su entrambi i commit

## File toccati
### Creati
- `src/components/ui/Badge.tsx` — `StatusBadge` (pill di stato), `PromemoriaBadge` (nessuna prop di stato, garanzia strutturale contro "Promemoria + Scaduta"), `TypeBadge` (outline per obligation_type)
- `src/components/ui/Button.tsx` — varianti primary/secondary/ghost/destructive, size default (responsive) e table (fissa)
- `src/components/ui/Modal.tsx` — portal, overlay `brand-dark/40`, focus trap completo
- `src/components/ui/Toast.tsx` — `ToastProvider`/`useToast`, un toast alla volta, 4s successo / 8s errore
- `src/components/ui/Input.tsx` — `Input`/`Textarea`/`Select`/`Label`/`FieldHelp`/`FieldError`
- `src/components/ui/Table.tsx` — `Table`/`TableHeader`/`TableHead`/`TableBody`/`TableRow`/`TableCell`
- `src/lib/cn.ts` — helper classnames minimale, zero dipendenze nuove

### Modificati
- `src/app/globals.css` — nuovi token v2 (status/shadow/z-index/font-serif), `--color-semantic-*` legacy lasciati invariati
- `src/app/layout.tsx` — font Source Serif 4 aggiunto, `ToastProvider` montato attorno a `children`
- `DESIGN.md` (root, non tracciato in git) — rigenerato da zero: documenta sia il sistema v2 (`status-*`, componenti `ui/`, Display serif) sia i pattern legacy N1/N2/N3 ancora live, come due generazioni esplicitamente separate
- `.impeccable/design.json` (non tracciato in git) — sidecar rigenerato in coppia con DESIGN.md: 8 componenti (incluso 1 legacy come ancora del pattern `border-l-4`), rampe tonali per i nuovi colori `status-*` e per la scala neutra Tailwind

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_admin_manutenzioni_context_07_07_18_27.md` — stato di partenza sessione
- `.claude/skills/impeccable/reference/product.md`, `audit.md`, `critique.md`, `init.md`, `document.md` — flussi della skill invocati in sessione
- `src/components/PriorityBadge.tsx`, `MaintenanceBadge.tsx`, `MaintenanceCard.tsx`, `N3AdminActions.tsx`, `AdminSidebar.tsx`, `BottomNav.tsx` — inventario dei pattern legacy N1/N2/N3 da NON toccare in questa sessione
- `src/lib/formatFrequency.ts`, `src/lib/pluralize.ts` — riusati da `PromemoriaBadge` invece di ricalcolare inline (regola CLAUDE.md sugli helper condivisi)
- `src/types/database.ts` — riuso di `MaintenanceStatus`/`ObligationType` come fonte di verità dei tipi per `StatusBadge`/`TypeBadge`
- `src/app/(dashboard)/admin/residences/[id]/fornitori/FornitoriManager.tsx` — pattern di modale ad hoc esistente (hex hardcoded, `bg-black/40`), usato come riferimento negativo per il nuovo `Modal`
- `package.json` — confermata assenza di clsx/cva/tailwind-merge (motivato `src/lib/cn.ts` fatto in casa)
- `.impeccable/design.json`, `PRODUCT.md` (versione precedente) — stato di partenza della documentazione visiva

## Decisioni chiave
- **Token `status-*`/`shadow-elevated`/`z-*` in famiglia separata dai `semantic-*` legacy**: prima proposta di Filippo era aggiornare i token esistenti (impatto silenzioso su `PriorityBadge`/`MaintenanceBadge`/`MaintenanceCard`), poi esplicitamente ribaltata a favore di token nuovi e distinti, per non alterare il colore dei componenti N1/N2/N3 non toccati da questo task. Il confine tra le due famiglie è documentato in DESIGN.md come "Regola delle Due Generazioni".
- **`PromemoriaBadge` è un componente a parte, non una variante di `StatusBadge`**: nessuna prop di stato esiste sulla sua interfaccia — "Promemoria + Scaduta" è irrappresentabile per tipo, non solo per convenzione (garanzia strutturale richiesta dal prompt).
- **`ToastProvider` montato in root layout**: unica modifica a un file di shell (non una schermata) accettata come necessaria, perché senza provider nell'albero il componente `Toast` sarebbe inutilizzabile.
- **`/impeccable critique` adattato invece che eseguito standard**: il target erano componenti headless senza pagina renderizzata (nessuna schermata li usa ancora), quindi il flusso dual-agent + browser injection pensato per pagine live è stato sostituito da una revisione manuale riga-per-riga contro lo spec esatto del prompt — più precisa in questo caso specifico, ma è una deviazione dal flusso standard della skill da tenere a mente.
- **`Button` size="table" resta fissa a `h-8` (32px), non responsive**: a differenza di size="default" (ora `h-11 md:h-9`), il contesto d'uso dentro righe di tabella è ritenuto desktop-only (`(dashboard)` admin), quindi non è stato esteso il fix del touch target a quella variante.
- **DESIGN.md documenta il sistema v2 come canone anche se zero schermate lo usano**: coerente con lo scopo dichiarato di DESIGN.md ("AI agents generating new screens stay on-brand") — descrive la direzione futura, non lo stato renderizzato oggi. Il vecchio pattern "eyebrow uppercase+tracking" è stato marcato esplicitamente come ritirato, pur restando visibile in schermate non ancora migrate.

## Stato attuale
### Funziona
- `npx tsc --noEmit` verde su entrambi i commit (`4dde3a5`, `858cc60`)
- Detector deterministico `impeccable` pulito su tutti e sei i file `ui/`, sia prima che dopo i fix P1
- Contrasto colore verificato a mano per tutte le pill di stato (6.5:1 scaduta, 5:1 in corso, 6:1 promemoria, 7.8:1 pianificata/tipo) — ben oltre la soglia 4.5:1
- `DESIGN.md`/`.impeccable/design.json` rigenerati, JSON validato con `node -e "JSON.parse(...)"`, confermati da Filippo senza richieste di revisione

### Non funziona / da verificare
- **Nessun componente `ui/` è mai stato visto in un browser reale**: nessuna schermata li importa ancora, quindi non c'è nulla da testare a schermo in questa sessione — la prima verifica visiva avverrà solo alla prima migrazione di schermata
- Backlog P2/P3 dell'audit non ancora affrontato (dettaglio in Prossimi passi)
- Il pointer "Design Context" in CLAUDE.md proposto a fine sessione non è stato né confermato né rifiutato da Filippo (conversazione interrotta per l'handoff)

## Prossimi passi
1. Migrare la prima schermata reale ai componenti `ui/` — candidate naturali: `admin/residences` o `admin/administrators` (hanno già pattern tabellari/modali da sostituire)
2. Backlog P2/P3 dell'audit (non bloccante, post-demo): `Toast` senza `max-width` per messaggi lunghi; `Toast` errore non pausabile su hover/focus (WCAG 2.2.1); `TableHead` senza `scope="col"`; hover di `Button` primary/destructive hardcoded in hex invece che a token; dipendenza `onClose` nell'effect di `Modal` (re-bind se il consumer passa una funzione inline)
3. Decidere sul contrasto del bordo di sistema `#E4E6E2` (~1.05:1, sotto soglia 3:1 WCAG 1.4.11) — segnalato in audit come token di sistema, esplicitamente fuori scope in questa sessione
4. Decidere sul `border-l-4` di `MaintenanceCard` (bug class "side-stripe border", ereditato da più handoff precedenti, ancora non deciso)
5. Rispondere alla domanda in sospeso su CLAUDE.md "Design Context" (vedi Domande aperte)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- Vale la pena appendere un breve pointer "Design Context" (riassunto di PRODUCT.md) a CLAUDE.md per riferimento rapido degli agenti futuri? Proposto a fine sessione, mai risposto.
- Come gestire lo scarto tra DESIGN.md (che ora documenta il sistema v2 come canone: Display serif, `status-*`, componenti `ui/`) e le schermate live (che usano ancora N1/N2/N3 e i pattern precedenti) durante il periodo di transizione? Nessuna scadenza o piano di migrazione è stato fissato.
- Il finding sul contrasto del bordo `#E4E6E2` merita un task dedicato di revisione token, o resta backlog permanente perché il cambio avrebbe effetto su ogni card/input/tabella già in produzione?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Ogni nuovo componente condiviso in `src/components/ui/` deve avere focus management e navigazione da tastiera completi fin dalla prima versione (focus trap nei modali con focus iniziale/ripristino, `aria-invalid`/`aria-describedby` sui campi in stato di errore, `role`/`tabIndex`/`onKeyDown` su qualunque elemento reso cliccabile che non sia nativamente interattivo) — non rimandare a un giro "harden" successivo. Emerso da un `/impeccable audit` che ha trovato 3 P1 di accessibilità sui sei componenti condivisi appena creati nella stessa sessione.

- **Sezione "Regole di codice ricorrenti"**: Ogni componente condiviso pensato anche per le superfici `(app)` mobile-first deve avere un'altezza minima di 44px su schermi touch (pattern `h-11 md:h-9`, già usato da `Input` e `Button` in `src/components/ui/`); componenti esplicitamente riservati a contesti `(dashboard)` desktop (es. `Button` size="table" dentro righe di tabella) possono restare sotto quella soglia. Emerso dal fix del P1 touch-target su `Button`.

- **Sezione "Invarianti"**: Quando due generazioni di token/colori coesistono durante una migrazione incrementale (es. `--color-semantic-*` legacy vs `--color-status-*` v2 in `globals.css`), tenerle in famiglie di naming esplicitamente separate e mai riusare/sovrascrivere i token esistenti per introdurre nuovi valori — altrimenti si altera silenziosamente l'aspetto di componenti legacy non toccati dal task in corso. Documentare il confine tra le due famiglie in DESIGN.md.

- **Sezione "Metodo di lavoro"**: Il flusso standard `/impeccable critique` (dual-agent + ispezione browser) presuppone un target visitabile in browser. Per componenti condivisi headless non ancora adottati da nessuna schermata (una nuova libreria UI appena scritta), va adattato a una revisione manuale riga-per-riga contro lo spec esatto del prompt/CLAUDE.md — dichiarare esplicitamente la deviazione invece di forzare il flusso standard o saltare la verifica.

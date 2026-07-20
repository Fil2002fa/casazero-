---
name: CasaZero
description: Il libretto di manutenzione digitale dell'immobile — verde profondo, flat, essenziale
colors:
  brand-dark: "#04342C"
  brand-medium: "#0F6E56"
  brand-light: "#E1F5EE"
  brand-accent: "#9FE1CB"
  background: "#F4F3EF"
  surface: "#FFFFFF"
  border: "#E4E6E2"
  text-primary: "#20302A"
  text-secondary: "#6B7A74"
  neutral-500: "#737373"
  neutral-600: "#525252"
  neutral-700: "#404040"
  neutral-900: "#171717"
  semantic-red: "#A32D2D"
  semantic-red-bg: "#FCEBEB"
  semantic-amber: "#854F0B"
  semantic-amber-bg: "#FAEEDA"
  semantic-blue: "#185FA5"
  semantic-blue-bg: "#E6F1FB"
  status-overdue: "#B42318"
  status-inprogress: "#B45309"
  status-reminder: "#175CD3"
typography:
  display:
    fontFamily: "var(--font-source-serif), ui-serif, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.56
    letterSpacing: "normal"
  title:
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.23
    letterSpacing: "normal"
  micro:
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "normal"
rounded:
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brand-dark}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    typography: "{typography.title}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "#0B4A40"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.neutral-900}"
    rounded: "{rounded.lg}"
    typography: "{typography.title}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-600}"
    rounded: "{rounded.lg}"
    typography: "{typography.title}"
    padding: "0 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.status-overdue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    typography: "{typography.title}"
    padding: "0 16px"
    height: "36px"
  badge-status:
    rounded: "{rounded.full}"
    typography: "{typography.micro}"
    padding: "0 10px"
    height: "22px"
  badge-type:
    backgroundColor: "transparent"
    rounded: "{rounded.full}"
    typography: "{typography.micro}"
    padding: "0 10px"
    height: "22px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.neutral-900}"
    rounded: "{rounded.lg}"
    typography: "{typography.body}"
    padding: "0 12px"
    height: "36px"
---

# Design System: CasaZero

## 1. Overview

**Creative North Star: "Il Fascicolo Verde"**

CasaZero non è un'app consumer che chiede attenzione: è il registro digitale che un costruttore consegna insieme alle chiavi. Il verde profondo (`#04342C`) resta il colore del documento ufficiale, non una scelta decorativa. Sopra al sistema quasi monocromatico originario si è innestato, in questa sessione, un secondo strato deliberato: una voce serif (Source Serif 4) riservata ai soli titoli di pagina, ai nomi di residenza in testata e ai numeri chiave delle card di riepilogo — mai altrove. È il primo punto in cui il sistema smette di essere "un solo sans in due pesi" e introduce un contrasto tipografico intenzionale, sempre al servizio della stessa idea: il fascicolo è un documento, non un prodotto che invecchia in una stagione.

Il sistema resta deliberatamente silenzioso allo stato di riposo — niente ombre sulle superfici statiche, niente colore semantico senza uno stato reale da segnalare — ma ora distingue con più precisione i livelli di superficie: pagina, card/tabella (bordo 1px, mai ombra) ed elementi flottanti (modali, dropdown, toast), che condividono un'unica ombra di sistema tinta di verde primario, mai nera. Rifiuta esplicitamente il registro "app social di condominio" (PRODUCT.md): niente feed, niente badge sociali, niente elementi che invitano a scorrere. Rifiuta anche la dashboard SaaS generica: nessun hero-metrico, nessun grafico decorativo, nessun gradiente.

**Key Characteristics:**
- Palette verde profondo su fondo grigio-caldo, quasi monocromatica, con tre accenti semantici legacy (rosso/ambra/blu) e una seconda generazione di colori di stato (`status-overdue`/`status-inprogress`/`status-reminder`) riservata ai nuovi componenti condivisi
- Voce tipografica a due registri: sans (Inter, UI/body) ovunque tranne i punti di massima gerarchia, dove interviene il serif (Source Serif 4) — mai il contrario
- Flat by default: bordi sottili (1px) al posto di ombre sulle superfici statiche; un'unica ombra di sistema, tinta di verde primario, riservata a modali/dropdown/toast
- Due soli livelli di radius con ruoli fissi: 12px per i contenitori, 8px per i controlli, full solo per badge/avatar
- Scala di spaziatura chiusa a sei valori (4/8/12/16/24/48px): qualunque altro valore è un errore, non una scelta
- Interfaccia a doppio guscio: `(app)` mobile-first per residente/amministratore, `(dashboard)` desktop per il super admin — stesso linguaggio visivo, densità diversa

## 2. Colors

Palette quasi monocromatica: il verde profondo domina header, azioni primarie e stato attivo; tutto il resto è neutro caldo. Esistono oggi **due generazioni parallele** di colori di stato: i `semantic-*` legacy (usati dai componenti N1/N2/N3 non ancora migrati) e i `status-*` di seconda generazione (usati dai nuovi componenti condivisi `ui/`). Sono deliberatamente famiglie separate, non alias l'una dell'altra.

### Primary
- **Verde Fascicolo** (`#04342C` — brand-dark): header della sidebar admin, pulsanti primari, stato attivo nella bottom nav, testo su sfondo chiaro brand, overlay delle modali (`brand-dark/40`). È il colore "firma" del prodotto.
- **Verde Salvia Intenso** (`#0F6E56` — brand-medium): icone, link secondari, accenti dentro le card legacy.

### Secondary
- **Menta Latte** (`#E1F5EE` — brand-light): sfondo di badge/chip attivi legacy, stato "tutto in ordine".
- **Verde Acqua Tenue** (`#9FE1CB` — brand-accent): variante ancora più chiara per superfici bianche/su scuro, uso minimo.

### Neutral
- **Sabbia Grigia** (`#F4F3EF` — background): sfondo di tutte le pagine.
- **Bianco Carta** (`#FFFFFF` — surface): card, form, superfici di contenuto, modali.
- **Grigio Confine** (`#E4E6E2` — border): l'unico bordo che il sistema usa, 1px, ovunque servano card, input o wrapper tabella. *(Nota tecnica aperta: il contrasto non testuale di questo bordo su sfondo bianco è ~1.05:1, sotto la soglia 3:1 di WCAG 1.4.11 — segnalato in audit, non ancora affrontato: è un token di sistema, non un fix puntuale.)*
- **Verde-Nero Testo** (`#20302A` — text-primary) / **Grigio Caldo Testo** (`#6B7A74` — text-secondary): coppia legacy, ancora in uso nei componenti non migrati.
- **Scala neutra Tailwind** (`neutral-500` `#737373` · `neutral-600` `#525252` · `neutral-700` `#404040` · `neutral-900` `#171717`): la scala usata dai nuovi componenti `ui/` per testo secondario, label, bordi outline e testo di corpo — sostituisce progressivamente `text-primary`/`text-secondary` mano a mano che le schermate migrano.

### Semantic (legacy — N1/N2/N3)
- **Rosso Scadenza** (`#A32D2D` su `#FCEBEB`) · **Ambra In Corso** (`#854F0B` su `#FAEEDA`) · **Blu Consiglio** (`#185FA5` su `#E6F1FB`): usati solo da `PriorityBadge`, `MaintenanceBadge`, `MaintenanceCard`. Non toccare finché quei componenti non migrano al sistema v2.

### Status (v2 — componenti condivisi `ui/`)
- **Scaduta** (`#B42318`, sfondo = alpha 0.08 dello stesso colore): `StatusBadge` variant `scaduta`.
- **In corso** (`#B45309`, sfondo alpha 0.08): `StatusBadge` variant `in_corso`.
- **Promemoria** (`#175CD3`, sfondo alpha 0.08): esclusivo di `PromemoriaBadge` — mai combinabile con uno stato di scadenza, per costruzione del componente, non per convenzione.
- **Pianificata**: `neutral-600` su `neutral-600` alpha 0.07 (nessun colore semantico dedicato — è l'assenza di urgenza, non uno stato).
- **Completata**: `brand-dark` su `brand-dark` alpha 0.08 — riusa il primario invece di un verde "successo" dedicato.

### Named Rules
**La Regola del Silenzio.** Nessun colore di stato appare finché non c'è uno stato reale da comunicare. "Tutto in ordine"/"Completata" si mostrano in tinta del brand primario, mai in un verde "successo" acceso.

**La Regola della Promemoria Blu.** Le voci a modalità promemoria non confrontano mai date né mostrano "scaduto": vincolo di prodotto, non estetico. `PromemoriaBadge` lo rende strutturalmente impossibile — il componente non ha alcuna prop di stato.

**La Regola delle Due Generazioni.** `semantic-*` e `status-*` non sono intercambiabili: il primo alimenta solo i componenti N1/N2/N3 legacy, il secondo solo i componenti `ui/`. Un componente nuovo non usa mai `semantic-*`; un componente legacy non migra a `status-*` senza un task dedicato.

## 3. Typography

**Display Font:** Source Serif 4 (`var(--font-source-serif)`, fallback `ui-serif, Georgia, serif`) — introdotta in questa sessione, variable font caricata via `next/font`, un solo peso attivo (600).
**Body/UI Font:** Inter (`var(--font-inter)`, fallback `ui-sans-serif, system-ui, sans-serif`) — invariata, due soli pesi (400/500).

**Character:** Contrasto deliberato, non decorativo: il serif compare solo dove il documento vuole affermare la propria autorità (titolo di pagina, nome della residenza, il numero che riassume uno stato), il sans fa tutto il resto senza farsi notare. Le due famiglie non si mescolano mai nello stesso elemento.

### Hierarchy
- **Display** (600, `30px`/36, line-height 1.2, Source Serif 4): **uso esclusivo** — H1 di pagina, nome residenza nelle testate, numeri chiave delle card di riepilogo. Da nessun'altra parte.
- **Headline** (600, `18px`/28, line-height 1.56, Inter): H2 di sezione.
- **Title** (500, `14px`/20, line-height 1.4, Inter): titoli di card, nomi di voci, label dei form.
- **Body** (400, `14px`/20, line-height 1.43, Inter): testo corrente, descrizioni, note.
- **Label** (500, `13px`/16, line-height 1.23, Inter, `neutral-500`): metadati, eyebrow, label di campo. **Mai uppercase+tracking.**
- **Micro** (500, `12px`/16, line-height 1.33, Inter): badge di stato, sotto-testo di badge (es. tipo obbligo sotto la modalità).

Celle numeriche e date nei componenti `ui/` usano sempre `tabular-nums`.

### Named Rules
**La Regola dei Due Pesi (sans).** Solo 400 e 500 esistono su Inter. Mai bold (700): l'enfasi si ottiene con 500 + colore, non con peso extra.

**La Regola dell'Uso Esclusivo del Serif.** Source Serif 4 compare solo in tre punti (H1, nome residenza in testata, numero chiave di riepilogo). Ogni altro uso — bottoni, badge, corpo, tabelle — è un errore, non una variazione di stile.

**La Regola dell'Eyebrow Ritirata.** Il vecchio pattern "eyebrow uppercase + tracking 0.02em" (riservato al nome residenza nella versione precedente del sistema) è **superato**: il nome residenza ora usa il Display serif, e il ruolo Label non usa mai più uppercase+tracking. Se una schermata non ancora migrata mostra un eyebrow maiuscolo, è debito tecnico da correggere alla migrazione, non un pattern da replicare.

## 4. Elevation

Il sistema resta flat by default sulle superfici statiche: la profondità si comunica con bordi 1px (`border`, `#E4E6E2`) e con la differenza tonale `background`/`surface`, mai con ombre a riposo. La sessione ha introdotto un'ombra di sistema unica per gli elementi che lasciano il flusso del documento (modali, dropdown, toast), sostituendo gli usi ad hoc di `shadow-sm`/`shadow-lg` di Tailwind con un solo valore tinto di primario.

### Shadow Vocabulary
- **`shadow-elevated`** (`0 8px 24px rgb(4 52 44 / 0.08)`): unica ombra di sistema. Usata da `Modal` e `Toast`. Tinta di verde primario, non nera — coerente con l'overlay della modale (`brand-dark/40`, non `black/40`).

### Named Rules
**La Regola del Riposo Piatto.** A riposo, ogni superficie è piatta. L'ombra compare solo quando un elemento lascia il flusso del documento — mai come decorazione su card, bottoni o badge statici.

**La Regola dell'Ombra Unica.** Un solo valore di ombra esiste nel sistema v2 (`shadow-elevated`). Non introdurre `shadow-sm`/`shadow-md`/gradazioni intermedie: se un elemento fluttua, usa quella; se non fluttua, non ha ombra.

## 5. Components

I componenti condivisi vivono in `src/components/ui/` (Badge, Button, Modal, Toast, Input/Textarea/Select, Table). Sono la superficie che le prossime migrazioni di schermata adotteranno; i componenti legacy (`PriorityBadge`, `MaintenanceBadge`, `MaintenanceCard`, `N3AdminActions`) restano invariati finché non c'è un task dedicato alla loro migrazione.

### Buttons
- **Shape:** `rounded-lg` (8px).
- **Primary:** `bg-brand-dark` testo bianco, hover `#0B4A40`, altezza `h-11 md:h-9` (44px touch / 36px desktop da `md:` in su) — un solo primary per vista.
- **Secondary:** `bg-surface` bordo `border`, testo `neutral-900`, hover `bg-background`.
- **Ghost:** testo `neutral-600`, hover `brand-dark` alpha 0.06.
- **Destructive:** `bg-status-overdue` testo bianco — **esiste solo nel footer di una `Modal` di conferma**, mai come bottone in pagina.
- **Size "table":** `h-8` (32px), solo variant secondary/ghost dentro righe di tabella, mai primary.
- **Focus:** ring 3px `brand-dark` alpha 0.2, offset 2, sempre visibile.
- **Disabled:** opacity 40%, mai nascosto.

### Badges
Tre forme per tre livelli informativi, mai intercambiabili:
1. **Stato temporale** (`StatusBadge`): pill `rounded-full`, h-22px, px-2.5, testo micro (12/500). Colore = uno dei `status-*`/`neutral-600`/`brand-dark` descritti in Colors.
2. **Tipo** (`TypeBadge`, `obligation_type`): outline, sfondo sempre trasparente. "Obbligo di legge" bordo `brand-dark` alpha 0.25 testo `brand-dark`; "Raccomandata"/"Consiglio" bordo `border` testo `neutral-600`.
3. **Modalità** (`completion_mode`): **mai badge**, sempre testo piano — non esiste un componente per questo caso, per costruzione.
`PromemoriaBadge` è un componente a parte, non una variante di `StatusBadge`: nessuna prop di stato, unico testo possibile "Consigliata · ogni X mesi".

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** `surface` su `background`.
- **Shadow Strategy:** nessuna (vedi Elevation).
- **Border:** 1px `border`.
- **Internal Padding:** `p-6` (24px) standard, `p-4` (16px) dense. Mai `p-5`.
- **Eccezione legacy:** `MaintenanceCard` usa `border-l-4` colorato come indicatore di stato scaduto/in corso — pattern isolato, non da estendere; nessun componente `ui/` lo replica.

### Inputs / Fields
- **Style:** `Input`/`Textarea`/`Select` — `border` `rounded-lg`, testo 14px, altezza `h-11 md:h-9` (44px touch / 36px desktop).
- **Focus:** bordo `brand-dark` + ring 3px `brand-dark` alpha 0.12.
- **Error:** bordo `status-overdue`, `aria-invalid` automatico da `error`; `FieldError` accetta `id` per il collegamento `aria-describedby`.
- **Label:** 13/500 `neutral-700`, gap 8px sopra il campo. **Placeholder solo per esempi di formato**, mai come label. Facoltativo marcato per parola ("(facoltativo)"), mai asterisco.

### Modal
- `max-w-md` per conferme, `max-w-lg` per form; `rounded-xl`, `p-6`, overlay `brand-dark` alpha 0.4 (mai nero).
- Header: titolo 18/600 + chiusura ghost 32px. Footer: bottoni a destra, secondario prima del primario, gap 12px.
- Focus trap attivo: focus iniziale sul pannello, `Tab` intrappolato dentro, focus ripristinato al trigger alla chiusura.
- **Una modale non apre mai un'altra modale.**

### Toast
- Basso-destra desktop, basso-centro sopra la bottom nav su mobile. `bg-surface` `border` `rounded-lg` `shadow-elevated`, `p-3`, icona 16px colorata (verde successo / rosso errore) + testo 14/400.
- Successo 4s, errore 8s. Uno alla volta: un nuovo toast rimpiazza quello in corso.

### Table
- Wrapper `rounded-xl border`, scroll orizzontale nel proprio contenitore mai sulla singola cella.
- Riga `h-12` (48px), header 13/500 `neutral-500` **senza sfondo**, separatori 1px `border`, ultima riga senza bordo.
- Hover riga `bg-background`; `cursor-pointer` + `role="button"`/tastiera solo se la riga è cliccabile.
- Numeri e date a destra, `tabular-nums`; prima colonna peso 500 (prop `emphasis`).

### Navigation (legacy, invariata)
- **Bottom nav:** solo icone, stato attivo `bg-brand-light text-brand-dark` su tile `rounded-xl`.
- **Sidebar admin:** sfondo pieno `brand-dark`, voci bianco/opacità.

## 6. Do's and Don'ts

### Do:
- **Do** riservare il Display serif (Source Serif 4) esclusivamente a H1, nome residenza in testata, numeri chiave — mai altrove.
- **Do** usare `status-*` solo nei componenti `ui/` e `semantic-*` solo in quelli legacy — non incrociarli.
- **Do** usare `shadow-elevated` come unica ombra di sistema, riservata a elementi che lasciano il flusso (Modal, Toast, dropdown futuri).
- **Do** costruire ogni nuovo elemento interattivo con tutti gli stati richiesti (default, hover, focus, disabled, e keyboard quando applicabile) — vedi il fix del focus trap su `Modal` e della navigazione da tastiera su `TableRow`.
- **Do** riservare `border-l-4` colorato al solo `MaintenanceCard` legacy — è un'eccezione codificata, non un pattern.

### Don't:
- **Don't** introdurre pattern da "app social di condominio" — niente feed, bacheca, chat, badge/like (anti-reference esplicito di PRODUCT.md).
- **Don't** aggiungere hero-metrico, grafici decorativi o gradient text.
- **Don't** usare bold (700) o famiglie tipografiche aggiuntive oltre Inter + Source Serif 4.
- **Don't** usare uppercase+tracking sul ruolo Label/eyebrow — pattern ritirato in questa sessione, anche se qualche schermata non ancora migrata lo mostra ancora.
- **Don't** mostrare linguaggio di scadenza ("scaduta", confronto date) su voci a modalità promemoria: `PromemoriaBadge` lo rende impossibile per costruzione, non aggirarlo con un componente diverso.
- **Don't** usare `bg-black/*` per overlay di modali: l'overlay è sempre `brand-dark` alpha 0.4.
- **Don't** usare valori di z-index arbitrari (`z-50`, `z-[999]`): i componenti `ui/` usano la scala semantica `z-dropdown`/`z-sticky`/`z-modal-backdrop`/`z-modal`/`z-toast`/`z-tooltip`; i pattern legacy (`BottomNav`, modali ad hoc) restano un'eccezione nota, non un modello.
- **Don't** usare `border-l-4` colorato su nuovi componenti come accento decorativo generico — riservato al solo `MaintenanceCard`.
- **Don't** usare valori di spaziatura fuori dalla scala 4/8/12/16/24/48px nei componenti `ui/`.

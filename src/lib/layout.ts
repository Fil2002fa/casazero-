// Griglia unica del contenuto della dashboard. La usano il container delle pagine
// ((dashboard)/layout.tsx) e la barra identità costruttore, così il logo del
// costruttore cade esattamente sopra il titolo di pagina invece di galleggiare su
// una griglia propria. Una sola fonte di verità: il respiro si cambia qui.
//
// Solo padding: niente larghezza massima, niente centratura. Il contenuto occupa
// tutta la larghezza disponibile accanto alla sidebar. Il valore viene dalla scala
// di spaziatura chiusa del design system (4/8/12/16/24/48px — DESIGN.md); il px-8
// (32px) usato finora da Residenze/Attività era fuori scala.
export const CONTENT_GRID = 'px-6'

// Ritmo verticale del contenuto: 24px sotto la barra identità, 48px in fondo
// perché il contenuto non tocchi il bordo dell'area di scroll.
export const CONTENT_RHYTHM = 'pt-6 pb-12'

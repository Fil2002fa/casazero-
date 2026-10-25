import { AWAITING_DELIVERY_LABEL } from '@/lib/maintenance-status'

// Resa unica dello stato "in attesa di consegna": una voce conteggiabile il cui
// piano non e ancora partito perche la data di consegna non e registrata
// (isAwaitingDelivery in src/lib/maintenance-status.ts).
//
// PERCHE' UN FILE SOLO: le stesse parole comparivano, o meglio NON comparivano,
// su sei superfici — prima di questo blocco una voce senza data non mostrava
// niente, in nessuna di esse. Tenere qui testo e palette significa che
// cambiare la frase e un'unica modifica, e che il ramo residente e quello
// costruttore non possono divergere nel linguaggio.
//
// REGISTRO VISIVO: neutro, mai di allarme. Non e un ritardo e non e una
// scadenza: e un piano che non e partito. Il rosso e di 'scaduta', l'ambra di
// 'in_corso', il blu delle promemoria; qui si usa il fondo neutro, lo stesso
// che 'in_attesa' ha gia nelle due shell.
//
// Le promemoria non arrivano mai qui: isAwaitingDelivery le esclude, perche il
// loro rendering e sempre "Consigliata · ogni X mesi" (invariante di prodotto).

/** Le due shell hanno palette di token diverse; cambia solo questo. */
const SHELL = {
  app:       { box: 'bg-background text-text-secondary',   text: 'text-base' },
  dashboard: { box: 'bg-neutral-600/7 text-neutral-600',   text: 'text-sm'   },
} as const

/**
 * Blocco di dettaglio, al posto della riga "Prossima scadenza: …" quando la
 * voce non ha ancora una data. Stessa forma del blocco scadenza che sostituisce
 * (rounded-xl p-3), cosi la pagina non cambia struttura tra i due stati.
 */
export function AwaitingDeliveryNote({ shell }: { shell: keyof typeof SHELL }) {
  const s = SHELL[shell]
  return (
    <div className={`rounded-xl p-3 ${s.box}`}>
      <span className={s.text}>
        <strong>{AWAITING_DELIVERY_LABEL}</strong>
      </span>
      <p className="text-xs mt-0.5 opacity-80">
        Le scadenze partono dalla data di consegna, non ancora registrata.
      </p>
    </div>
  )
}

/**
 * Riga di lista, al posto di "Scade il …". Nessun colore: nelle liste la voce
 * deve leggersi come informazione, non come stato da sbrigare.
 */
export function AwaitingDeliveryLine({ className = '' }: { className?: string }) {
  return (
    <span className={`text-xs text-text-secondary ${className}`}>
      {AWAITING_DELIVERY_LABEL}
    </span>
  )
}

/**
 * Card della home residente quando non esiste una prossima scadenza perche il
 * piano non e partito. Senza conteggi e senza colori di allarme: dice cosa
 * manca e chi lo registrera, e non chiede niente a chi legge.
 */
export function AwaitingDeliveryHomeCard() {
  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <p className="text-sm font-medium text-text-primary">
        Il piano di manutenzione parte dalla data di consegna
      </p>
      <p className="text-xs text-text-secondary mt-1">
        Appena il costruttore la registra, qui compaiono le prime scadenze.
      </p>
    </div>
  )
}

/**
 * Chip della riga CHIUSA di un gruppo di voci: lo stato si deve leggere senza
 * espandere. Stessa posizione e stesso registro di "{n} in ritardo" nella
 * stessa riga, ma neutro: non e un ritardo.
 *
 * `count`/`total`: quando tutte le voci del gruppo sono in attesa il chip dice
 * solo lo stato (caso del piano filtrato su una sola unita non consegnata);
 * quando solo alcune lo sono, dice quante, altrimenti su "Tutte le unita" un
 * chip nudo farebbe credere che l'intero gruppo sia fermo.
 */
export function AwaitingDeliveryChip({ count, total }: { count: number; total: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-background text-text-secondary px-2 py-0.5 text-xs font-medium">
      {count === total ? AWAITING_DELIVERY_LABEL : `${count} in attesa di consegna`}
    </span>
  )
}

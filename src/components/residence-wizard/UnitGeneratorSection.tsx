'use client'

import { useRef, useState } from 'react'
import { MAX_UNITS } from '@/lib/residence-input'
import { GenField } from './WizardFields'
import { generatedLabel, type UnitRow } from './shared'

// Stato e logica del generatore a pattern (parte sempre dal numero 1;
// numerazioni diverse si ottengono modificando le righe della lista, che è la
// fonte di verità). Vive in un hook chiamato dal wizard — non nel componente —
// perché il wizard deve poterlo azzerare (ripristino dal bfcache) e cancellarne
// l'errore al submit, esattamente come quando lo stato stava nella pagina.
export function useUnitGenerator({
  units,
  onGenerate,
}: {
  units: UnitRow[]
  // Il chiamante sostituisce la lista e azzera errori di riga e di lista.
  onGenerate: (rows: UnitRow[]) => void
}) {
  const [prefix, setPrefix] = useState('Unità')
  const [count, setCount] = useState('')
  const [perFloor, setPerFloor] = useState('2')
  const [error, setError] = useState<string | null>(null)
  const countRef = useRef<HTMLInputElement>(null)
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)

  // Campi del generatore validi? Unica definizione, condivisa da anteprima,
  // "Genera" e generazione effettiva. Esplosa in due booleani (invece
  // dell'IIFE unica) per poter decidere quale campo mettere a fuoco
  // quando "Genera" fallisce.
  const countNum = parseInt(count, 10)
  const countValid = Number.isInteger(countNum) && countNum >= 1 && countNum <= MAX_UNITS
  const perFloorNum = parseInt(perFloor, 10)
  const perFloorValid = Number.isInteger(perFloorNum) && perFloorNum >= 1

  // Con 1 sola unità il piano è sempre 1 qualunque sia "Unità per piano"
  // (Math.floor(0/n)+1 === 1 per ogni n ≥ 1 in doGenerate sotto): il campo
  // non ha più alcun effetto e va nascosto, senza toccare il calcolo.
  const countIsOne = countValid && countNum === 1

  // Campo nascosto quando countIsOne: la sua validità non deve poter
  // bloccare "Genera". perFloor = 1 riproduce lo stesso identico risultato
  // di doGenerate per qualunque perFloor valido (vedi commento sopra), senza
  // leggere perFloor quando non è a schermo.
  const gen = countIsOne
    ? { count: 1, perFloor: 1 }
    : countValid && perFloorValid ? { count: countNum, perFloor: perFloorNum } : null

  function doGenerate() {
    if (!gen) return
    const p = prefix.trim()
    onGenerate(Array.from({ length: gen.count }, (_, i) => ({
      label: generatedLabel(p, i + 1),
      floor: String(Math.floor(i / gen.perFloor) + 1),
    })))
  }

  // Le righe con un nome compilato: righe vuote appena aggiunte non sono
  // lavoro da proteggere.
  const filledCount = units.filter(u => u.label.trim()).length

  function handleGenerate() {
    if (!gen) {
      setError(`Controlla i campi del generatore: numero di unità (da 1 a ${MAX_UNITS}) e unità per piano (almeno 1)`)
      if (!countValid) countRef.current?.focus()
      return
    }
    setError(null)
    // Conferma solo se in lista ci sono già unità con un nome.
    if (filledCount > 0) {
      setShowReplaceConfirm(true)
      return
    }
    doGenerate()
  }

  function confirmReplace() {
    setShowReplaceConfirm(false)
    doGenerate()
  }

  // Anteprima live: primi 3 nomi + "…" e intervallo piani.
  const preview = gen ? (() => {
    const p = prefix.trim()
    const names = Array.from({ length: Math.min(gen.count, 3) }, (_, i) => generatedLabel(p, i + 1))
    const maxFloor = Math.floor((gen.count - 1) / gen.perFloor) + 1
    const floors = maxFloor === 1 ? 'piano 1' : `piani 1–${maxFloor}`
    return `Verranno generate: ${names.join(', ')}${gen.count > 3 ? '…' : ''} · ${floors}`
  })() : null

  function reset() {
    setPrefix('Unità')
    setCount('')
    setPerFloor('2')
    setError(null)
    setShowReplaceConfirm(false)
  }

  return {
    prefix, setPrefix,
    count, setCount,
    perFloor, setPerFloor,
    error, setError,
    countRef,
    countIsOne,
    preview,
    filledCount,
    showReplaceConfirm, setShowReplaceConfirm,
    handleGenerate,
    confirmReplace,
    reset,
  }
}

export type UnitGenerator = ReturnType<typeof useUnitGenerator>

export function UnitGeneratorSection({ generator: g }: { generator: UnitGenerator }) {
  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Genera unità</h2>
      <p className="text-xs text-text-secondary">
        Scorciatoia per popolare la lista. Ogni riga resta poi modificabile singolarmente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <GenField ref={g.countRef} label="Numero di unità *" value={g.count} onChange={g.setCount} type="number" min="1" max={String(MAX_UNITS)} placeholder="es. 14" />
        <GenField label="Nome unità" value={g.prefix} onChange={g.setPrefix} placeholder="es. Unità, Int., A" />
      </div>
      {!g.countIsOne && (
        <GenField
          label="Unità per piano"
          value={g.perFloor}
          onChange={g.setPerFloor}
          type="number"
          min="1"
          hint="Per assegnare i piani in automatico: es. 2 = le prime due unità al piano 1, le successive al piano 2, e così via. Modificabile poi riga per riga."
        />
      )}
      {g.preview && (
        <p className="text-xs text-text-secondary">{g.preview}</p>
      )}
      <button
        type="button"
        onClick={g.handleGenerate}
        className="w-full py-2 border border-brand-dark text-brand-dark rounded-lg text-sm font-medium"
      >
        Genera
      </button>
      {g.error && (
        <p className="text-xs text-semantic-red">{g.error}</p>
      )}
    </section>
  )
}

// Modale conferma sostituzione lista unità. Va reso fuori dal <form>.
export function ReplaceUnitsConfirm({
  count, onCancel, onConfirm,
}: {
  count: number; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-surface rounded-xl border border-border p-5 w-full max-w-sm space-y-3">
        <p className="text-sm font-medium text-text-primary">Sostituire le unità?</p>
        <p className="text-sm text-text-secondary">
          Le {count} unità in lista verranno sostituite da quelle generate.
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium"
          >
            Sostituisci
          </button>
        </div>
      </div>
    </div>
  )
}

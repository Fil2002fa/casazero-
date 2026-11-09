// Tipi e funzioni condivisi dai componenti del wizard "Nuova residenza".
// Estratti da new/page.tsx senza cambiare comportamento, per riusarli nella
// pagina di revisione da documento (che li alimenta con valori iniziali).

import { RESIDENCE_FEATURES, type FeatureKey } from '@/lib/residence-features'

export const WIZARD_CATEGORIES = [
  { label: 'Coperture e tetto',      value: 'Coperture'    },
  { label: 'Ventilazione',           value: 'Ventilazione' },
  { label: 'Termico e clima',        value: 'Termico'      },
  { label: 'Elettrico',              value: 'Elettrico'    },
  { label: 'Fotovoltaico',           value: 'Fotovoltaico' },
  { label: 'Finiture e serramenti',  value: 'Finiture'     },
  { label: 'Sicurezza in copertura', value: 'Sicurezza'    },
  { label: 'Scarichi e spurghi',     value: 'Spurghi'      },
  { label: 'Ascensore',              value: 'Ascensore'    },
  { label: 'Antincendio',            value: 'Antincendio'  },
  { label: 'Idrico e sanitario',     value: 'Idrico'       },
  { label: 'Accessi ed esterni',     value: 'Accessi'      },
]

export type UnitRow = { label: string; floor: string }

// Tutte e 19 le dotazioni a false. Il wizard dichiara sempre il vocabolario
// intero, "no" compresi: chi attraversa la schermata ha risposto. Lo stato
// "non dichiarato" del DB (p_features NULL) resta a chi crea residenze senza
// passare di qui — vedi il commento in new/actions.ts.
export function emptyFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    RESIDENCE_FEATURES.map(f => [f.key, false])
  ) as Record<FeatureKey, boolean>
}

// Fonte di verità unica per i nomi generati: usata sia dall'anteprima
// sia dalla generazione vera, così non possono divergere.
export function generatedLabel(prefix: string, n: number): string {
  return prefix ? `${prefix} ${n}` : String(n)
}

// Ritorna un messaggio d'errore per riga (indice → messaggio); vuoto = tutto valido.
export function validateUnitRows(rows: UnitRow[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const seen = new Set<string>()
  rows.forEach((row, i) => {
    const problems: string[] = []
    const label = row.label.trim()
    if (!label) {
      problems.push('nome obbligatorio')
    } else if (seen.has(label.toLowerCase())) {
      problems.push('nome già usato')
    } else {
      seen.add(label.toLowerCase())
    }
    const floor = Number(row.floor)
    if (row.floor.trim() === '' || !Number.isInteger(floor) || floor < 0) {
      problems.push('piano: numero intero da 0 in su')
    }
    if (problems.length) errors[i] = problems.join(' · ')
  })
  return errors
}

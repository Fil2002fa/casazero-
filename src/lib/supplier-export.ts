/**
 * Scheda "Fornitori" dell'Excel di residenza: una riga per fornitore
 * collegato alla residenza. SOLO per il super_admin: l'anagrafica fornitori
 * è un dato interno del costruttore (RLS 038/039 e decisione D5), quindi la
 * route non chiama nemmeno questo modulo per l'admin. Modulo puro, verificato
 * da scripts/verify-residence-export.mjs.
 *
 * Due fonti unite, come la pagina Fornitori della residenza: suppliers
 * .residence_id è la residenza di prima creazione, supplier_installations è
 * il collegamento vero. Leggerne una sola perde fornitori in silenzio.
 *
 * La partita IVA resta testo (zeri iniziali). Nessuna categoria: il modello
 * legacy non si mostra (stessa scelta della pagina).
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { SISTEMA_LABELS, SISTEMI } from './document-classification'
import { humanizeDocumentTitle } from './documentTitle'
import { normalizeEmbed } from './postgrest-embed'
import { textCell, type ExportCell } from './xlsx-helpers'

export type SupplierExportSupplier = {
  id: string
  name: string
  phone: string | null
  email: string | null
  vat_number: string | null
}

export type SupplierExportInstallation = {
  supplier_id: string
  sistema: string
  source: string
  source_document_id: string | null
}

export const SUPPLIER_EXPORT_HEADERS = [
  'Fornitore',
  'Partita IVA',
  'Telefono',
  'Email',
  'Impianti in questa residenza',
  'Origine del collegamento',
  'Documenti collegati',
] as const

/** Riga di supplier_installations come la restituisce PostgREST (fornitore in embed). */
export type RawSupplierInstallation = {
  sistema: string
  source: string
  source_document_id: string | null
  suppliers: unknown
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function toSupplier(value: unknown): SupplierExportSupplier | null {
  const s = normalizeEmbed<Record<string, unknown>>(value)
  const id = str(s?.id)
  const name = str(s?.name)
  if (!s || !id || !name) return null
  return { id, name, phone: str(s.phone), email: str(s.email), vat_number: str(s.vat_number) }
}

/**
 * Unisce le due fonti in un elenco di fornitori e uno di collegamenti.
 * `byResidenceId` = suppliers con residence_id = questa residenza.
 */
export function mergeSupplierSources(
  byResidenceId: unknown[],
  installationRows: RawSupplierInstallation[],
): { suppliers: SupplierExportSupplier[]; installations: SupplierExportInstallation[] } {
  const byId = new Map<string, SupplierExportSupplier>()
  for (const raw of byResidenceId) {
    const s = toSupplier(raw)
    if (s) byId.set(s.id, s)
  }
  const installations: SupplierExportInstallation[] = []
  for (const row of installationRows) {
    const s = toSupplier(row.suppliers)
    if (!s) continue
    byId.set(s.id, s)
    installations.push({
      supplier_id: s.id,
      sistema: row.sistema,
      source: row.source,
      source_document_id: row.source_document_id,
    })
  }
  return { suppliers: [...byId.values()], installations }
}

function sistemaLabel(sistema: string): string {
  return (SISTEMA_LABELS as Record<string, string>)[sistema] ?? sistema
}

function originText(sources: Set<string>): string | null {
  const fromDocument = sources.has('documento')
  const manual = sources.has('manuale')
  if (fromDocument && manual) return 'Da documento e manuale'
  if (fromDocument) return 'Da documento'
  if (manual) return 'Manuale'
  return null
}

/**
 * Una riga per fornitore, in ordine alfabetico. `documentTitles` = titolo per
 * id dei documenti della residenza (per "Documenti collegati").
 */
export function supplierExportRows(
  suppliers: SupplierExportSupplier[],
  installations: SupplierExportInstallation[],
  documentTitles: ReadonlyMap<string, string>,
): ExportCell[][] {
  const sistemiOrder = new Map((SISTEMI as string[]).map((s, i) => [s, i]))
  const bySupplier = new Map<string, SupplierExportInstallation[]>()
  for (const inst of installations) {
    const list = bySupplier.get(inst.supplier_id)
    if (list) list.push(inst)
    else bySupplier.set(inst.supplier_id, [inst])
  }

  return [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
    .map(supplier => {
      const links = bySupplier.get(supplier.id) ?? []
      const sistemi = [...new Set(links.map(l => l.sistema))]
        .sort((a, b) => (sistemiOrder.get(a) ?? 99) - (sistemiOrder.get(b) ?? 99))
        .map(sistemaLabel)
      const titles = [...new Set(
        links
          .map(l => (l.source_document_id ? documentTitles.get(l.source_document_id) : undefined))
          .filter((t): t is string => typeof t === 'string' && t !== '')
          .map(humanizeDocumentTitle),
      )]
      return [
        textCell(supplier.name),
        textCell(supplier.vat_number),
        textCell(supplier.phone),
        textCell(supplier.email),
        textCell(sistemi.length > 0 ? sistemi.join(', ') : null),
        textCell(originText(new Set(links.map(l => l.source)))),
        textCell(titles.length > 0 ? titles.join(', ') : null),
      ]
    })
}


'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Phone, Mail, Tag, Hash, Wrench } from 'lucide-react'
import {
  createSupplier as createResidenceSupplier,
  deleteSupplier as deleteResidenceSupplier,
} from '@/app/(dashboard)/admin/residences/[id]/fornitori/actions'
import {
  createSupplierForBuilder,
  updateSupplierAnagrafica,
} from '@/app/(dashboard)/admin/fornitori/actions'
import { SISTEMI, SISTEMA_LABELS, type Sistema } from '@/lib/document-classification'

type Installation = { sistema: Sistema; residenceName: string }

type Supplier = {
  id: string
  name: string
  phone: string | null
  email: string | null
  // Scope 'residence': modello legacy, testo libero. Scope 'builder': asse
  // sistema/residenza vive in supplier_installations (039), non qui.
  categories?: string[]
  vatNumber?: string | null
  installations?: Installation[]
}

// Ramo unico per prop di scope (CLAUDE.md, mai JSX duplicato tra rami): la
// pagina di residenza resta l'unica proprietaria di 'residence', quella di
// costruttore di 'builder'. Ogni differenza di comportamento nel componente
// si legge da qui, mai da un secondo componente parallelo.
type Scope =
  | { kind: 'residence'; residenceId: string }
  | { kind: 'builder'; builderId: string; residences: { id: string; name: string }[] }

export function FornitoriManager({
  scope,
  suppliers,
}: {
  scope: Scope
  suppliers: Supplier[]
}) {
  const router = useRouter()
  const [addPending, startAddTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [editPending, startEditTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    const formData = new FormData(e.currentTarget)
    startAddTransition(async () => {
      const res = scope.kind === 'residence'
        ? await createResidenceSupplier(scope.residenceId, formData)
        : await createSupplierForBuilder(scope.builderId, formData)
      if (res.error) setAddError(res.error)
      else {
        setShowForm(false)
        router.refresh()
      }
    })
  }

  function openDeleteModal(id: string) {
    setConfirmDeleteId(id)
    setDeleteError(null)
  }

  function closeDeleteModal() {
    if (deletePending) return
    setConfirmDeleteId(null)
    setDeleteError(null)
  }

  function handleConfirmDelete() {
    if (!confirmDeleteId || scope.kind !== 'residence') return
    startDeleteTransition(async () => {
      const res = await deleteResidenceSupplier(confirmDeleteId, scope.residenceId)
      if (res.error) {
        const isFk = res.error.toLowerCase().includes('foreign key')
          || res.error.toLowerCase().includes('violates')
        setDeleteError(isFk
          ? 'Impossibile rimuovere: fornitore collegato a manutenzioni esistenti.'
          : res.error)
      } else {
        setConfirmDeleteId(null)
        router.refresh()
      }
    })
  }

  function openEdit(id: string) {
    setEditingId(id)
    setEditError(null)
  }

  function closeEdit() {
    if (editPending) return
    setEditingId(null)
    setEditError(null)
  }

  function handleEditSubmit(e: React.FormEvent<HTMLFormElement>, supplierId: string) {
    e.preventDefault()
    setEditError(null)
    const formData = new FormData(e.currentTarget)
    startEditTransition(async () => {
      const res = await updateSupplierAnagrafica(supplierId, formData)
      if (res.error) setEditError(res.error)
      else {
        setEditingId(null)
        router.refresh()
      }
    })
  }

  function sortedInstallations(list: Installation[]): Installation[] {
    return [...list].sort((a, b) => SISTEMI.indexOf(a.sistema) - SISTEMI.indexOf(b.sistema))
  }

  return (
    <div className="space-y-4">

      {/* Modale conferma rimozione — solo scope residenza (039: la cancellazione
          di un fornitore builder-level cascata su supplier_installations, e non
          c'è ancora una UI che avverta di cosa sparisce insieme). */}
      {scope.kind === 'residence' && confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 max-w-sm w-full shadow-lg space-y-3">
            <p className="text-sm font-medium text-[#20302A]">Rimuovere questo fornitore?</p>
            <p className="text-xs text-text-secondary">L&apos;operazione non è reversibile.</p>
            {deleteError && (
              <p className="text-xs text-semantic-red bg-semantic-red-bg rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={closeDeleteModal}
                disabled={deletePending}
                className="flex-1 border border-[#E4E6E2] rounded-xl py-2.5 text-sm text-text-secondary disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletePending}
                className="flex-1 bg-[#04342C] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {deletePending ? '…' : 'Rimuovi'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{suppliers.length} fornitore/i</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Aggiungi
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Nuovo fornitore</p>
          <input
            type="text"
            name="name"
            placeholder="Nome fornitore *"
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <input
            type="tel"
            name="phone"
            placeholder="Telefono"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          {scope.kind === 'residence' ? (
            <div>
              <label className="text-xs text-text-secondary block mb-1">Categorie (virgola separata)</label>
              <input
                type="text"
                name="categories"
                placeholder="es. Termico, Elettrico, Fotovoltaico"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
          ) : (
            <>
              <input
                type="text"
                name="vat_number"
                placeholder="Partita IVA (facoltativa)"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
              <div>
                <label className="text-xs text-text-secondary block mb-1">Residenza *</label>
                <select
                  name="residence_id"
                  required
                  defaultValue=""
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                >
                  <option value="" disabled>Seleziona…</option>
                  {scope.residences.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {addError && <p className="text-xs text-semantic-red">{addError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={addPending} className="flex-1 py-2 bg-brand-dark text-white rounded-lg text-sm disabled:opacity-50">
              {addPending ? '…' : 'Salva'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary">
              Annulla
            </button>
          </div>
        </form>
      )}

      {suppliers.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {scope.kind === 'residence'
              ? 'Nessun fornitore. Aggiungine uno per associarlo alle manutenzioni.'
              : 'Nessun fornitore in anagrafica. Aggiungine uno.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <div key={s.id} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{s.name}</p>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-xs text-text-secondary mt-1.5">
                      <Phone className="w-3 h-3" strokeWidth={1.6} />
                      {s.phone}
                    </a>
                  )}
                  {s.email && (
                    <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                      <Mail className="w-3 h-3" strokeWidth={1.6} />
                      {s.email}
                    </a>
                  )}
                  {scope.kind === 'residence' ? (
                    s.categories && s.categories.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-2">
                        <Tag className="w-3 h-3 text-text-secondary" strokeWidth={1.6} />
                        {s.categories.map(c => (
                          <span key={c} className="text-[10px] bg-brand-light text-brand-dark px-1.5 py-0.5 rounded-full">
                            {c}
                          </span>
                        ))}
                      </div>
                    )
                  ) : (
                    <>
                      {s.vatNumber && (
                        <p className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                          <Hash className="w-3 h-3" strokeWidth={1.6} />
                          P.IVA {s.vatNumber}
                        </p>
                      )}
                      {s.installations && s.installations.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="flex items-center gap-1.5 text-[10px] font-medium text-text-secondary uppercase tracking-wide">
                            <Wrench className="w-3 h-3" strokeWidth={1.6} />
                            Ha realizzato
                          </p>
                          {sortedInstallations(s.installations).map((inst, i) => (
                            <p key={i} className="text-xs text-text-secondary pl-[18px]">
                              {SISTEMA_LABELS[inst.sistema]} · {inst.residenceName}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {scope.kind === 'residence' ? (
                  <button
                    onClick={() => openDeleteModal(s.id)}
                    disabled={deletePending}
                    className="p-1.5 text-text-secondary hover:text-semantic-red transition-colors"
                    title="Rimuovi"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                  </button>
                ) : (
                  <button
                    onClick={() => (editingId === s.id ? closeEdit() : openEdit(s.id))}
                    disabled={editPending}
                    className="p-1.5 text-text-secondary hover:text-brand-dark transition-colors"
                    title="Modifica"
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.6} />
                  </button>
                )}
              </div>

              {scope.kind === 'builder' && editingId === s.id && (
                <form
                  onSubmit={e => handleEditSubmit(e, s.id)}
                  className="mt-3 pt-3 border-t border-border space-y-2"
                >
                  <input
                    type="text"
                    name="name"
                    defaultValue={s.name}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={s.phone ?? ''}
                    placeholder="Telefono"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  <input
                    type="email"
                    name="email"
                    defaultValue={s.email ?? ''}
                    placeholder="Email"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  <input
                    type="text"
                    name="vat_number"
                    defaultValue={s.vatNumber ?? ''}
                    placeholder="Partita IVA (facoltativa)"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  {editError && <p className="text-xs text-semantic-red">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={editPending} className="flex-1 py-2 bg-brand-dark text-white rounded-lg text-sm disabled:opacity-50">
                      {editPending ? '…' : 'Salva'}
                    </button>
                    <button type="button" onClick={closeEdit} className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary">
                      Annulla
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

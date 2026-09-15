'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Phone, Mail, Hash, Wrench, X } from 'lucide-react'
import {
  createSupplier as createResidenceSupplier,
  deleteSupplier as deleteResidenceSupplier,
} from '@/app/(dashboard)/admin/residences/[id]/fornitori/actions'
import {
  createSupplierForBuilder,
  updateSupplierAnagrafica,
  addSupplierInstallation,
  removeSupplierInstallation,
} from '@/app/(dashboard)/admin/fornitori/actions'
import { SISTEMI, SISTEMA_LABELS, type Sistema } from '@/lib/document-classification'
import { pluralize } from '@/lib/pluralize'

type Installation = { id: string; sistema: Sistema; residenceId: string; residenceName: string }
type InstallationGroup = { residenceId: string; residenceName: string; installations: Installation[] }

type Supplier = {
  id: string
  name: string
  phone: string | null
  email: string | null
  // Scope 'residence': sistemi collegati a QUESTA residenza via
  // supplier_installations, sola lettura (la gestione dei collegamenti
  // resta sulla pagina builder). Scope 'builder': vedi `installations`,
  // che porta anche la residenza per il raggruppamento multi-residenza.
  installedSystemsHere?: Sistema[]
  // Scope 'residence': almeno uno dei collegamenti qui ha source =
  // 'documento'. Sempre sottoinsieme di installedSystemsHere non vuoto: la
  // riga che lo dichiara sta sotto i lavori e non ha senso senza.
  addedFromDocumentHere?: boolean
  // Obbligatoria per ENTRAMBI gli scope: il form "Modifica anagrafica" (ora
  // aperto da tutte e due le pagine) precompila la P.IVA da qui e la rimanda
  // sempre a updateSupplierAnagrafica. Una pagina che non la passasse
  // aprirebbe il campo vuoto, e il primo salvataggio cancellerebbe una
  // P.IVA esistente — anche quella registrata dalla conferma di una DiCo.
  vatNumber: string | null
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
  const [installPending, startInstallTransition] = useTransition()
  const [showInstallFormFor, setShowInstallFormFor] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [removeInstallationPending, startRemoveInstallationTransition] = useTransition()
  const [confirmRemoveInstallation, setConfirmRemoveInstallation] = useState<{ id: string; label: string } | null>(null)
  const [removeInstallationError, setRemoveInstallationError] = useState<string | null>(null)

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

  // Una riga per residenza (requisito: il nome dell'edificio non si ripete
  // per ogni sistema). Gruppi ordinati per nome residenza, sistemi dentro
  // ogni gruppo nell'ordine canonico di SISTEMI, non nell'ordine di arrivo.
  function groupedInstallations(list: Installation[]): InstallationGroup[] {
    const byResidence = new Map<string, InstallationGroup>()
    for (const inst of list) {
      const group = byResidence.get(inst.residenceId)
        ?? { residenceId: inst.residenceId, residenceName: inst.residenceName, installations: [] }
      group.installations.push(inst)
      byResidence.set(inst.residenceId, group)
    }
    const groups = [...byResidence.values()]
    for (const g of groups) {
      g.installations.sort((a, b) => SISTEMI.indexOf(a.sistema) - SISTEMI.indexOf(b.sistema))
    }
    groups.sort((a, b) => a.residenceName.localeCompare(b.residenceName))
    return groups
  }

  function openInstallForm(supplierId: string) {
    setShowInstallFormFor(supplierId)
    setInstallError(null)
  }

  function closeInstallForm() {
    if (installPending) return
    setShowInstallFormFor(null)
    setInstallError(null)
  }

  function handleInstallSubmit(e: React.FormEvent<HTMLFormElement>, supplierId: string) {
    e.preventDefault()
    setInstallError(null)
    const formData = new FormData(e.currentTarget)
    const residenceId = (formData.get('residence_id') as string) ?? ''
    const sistema = (formData.get('sistema') as string) ?? ''
    startInstallTransition(async () => {
      const res = await addSupplierInstallation(supplierId, residenceId, sistema)
      if (res.error) setInstallError(res.error)
      else {
        setShowInstallFormFor(null)
        router.refresh()
      }
    })
  }

  function openRemoveInstallation(id: string, label: string) {
    setConfirmRemoveInstallation({ id, label })
    setRemoveInstallationError(null)
  }

  function closeRemoveInstallation() {
    if (removeInstallationPending) return
    setConfirmRemoveInstallation(null)
    setRemoveInstallationError(null)
  }

  function handleConfirmRemoveInstallation() {
    if (!confirmRemoveInstallation) return
    startRemoveInstallationTransition(async () => {
      const res = await removeSupplierInstallation(confirmRemoveInstallation.id)
      if (res.error) setRemoveInstallationError(res.error)
      else {
        setConfirmRemoveInstallation(null)
        router.refresh()
      }
    })
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

      {/* Modale conferma rimozione collegamento — solo scope builder. Cancella
          la riga di supplier_installations, mai il fornitore. */}
      {scope.kind === 'builder' && confirmRemoveInstallation && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 max-w-sm w-full shadow-lg space-y-3">
            <p className="text-sm font-medium text-[#20302A]">Rimuovere questo collegamento?</p>
            <p className="text-xs text-text-secondary">{confirmRemoveInstallation.label}</p>
            {removeInstallationError && (
              <p className="text-xs text-semantic-red bg-semantic-red-bg rounded-lg px-3 py-2">
                {removeInstallationError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={closeRemoveInstallation}
                disabled={removeInstallationPending}
                className="flex-1 border border-[#E4E6E2] rounded-xl py-2.5 text-sm text-text-secondary disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmRemoveInstallation}
                disabled={removeInstallationPending}
                className="flex-1 bg-[#04342C] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {removeInstallationPending ? '…' : 'Rimuovi'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">
          {scope.kind === 'builder' ? pluralize(suppliers.length, 'fornitore', 'fornitori') : `${suppliers.length} fornitore/i`}
        </p>
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
              <label className="text-xs text-text-secondary block mb-1">Sistema *</label>
              <select
                name="sistema"
                required
                defaultValue=""
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
              >
                <option value="" disabled>Seleziona…</option>
                {SISTEMI.map(sys => (
                  <option key={sys} value={sys}>{SISTEMA_LABELS[sys]}</option>
                ))}
              </select>
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
                  {scope.kind === 'residence' ? (
                    <>
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-xs text-text-secondary mt-1.5">
                          <Phone className="w-3 h-3" strokeWidth={1.6} />
                          {s.phone}
                        </a>
                      )}
                      {/* Email a capo anche a metà parola, mai troncata: è una stringa
                          senza spazi che altrimenti allarga la card, e su telefono non
                          c'è il passaggio del mouse per leggerla intera. */}
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="flex items-start gap-1.5 text-xs text-text-secondary mt-1">
                          <Mail className="w-3 h-3 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                          <span className="min-w-0 break-all">{s.email}</span>
                        </a>
                      )}
                      {/* Il vuoto non dice nulla: senza questa riga una card senza contatti
                          sembra una card caricata a metà. */}
                      {!s.phone && !s.email && (
                        <p className="text-xs text-text-secondary mt-1.5">
                          Nessun contatto. Aggiungilo dalla scheda fornitore.
                        </p>
                      )}
                      {s.installedSystemsHere && s.installedSystemsHere.length > 0 && (
                        <p className="flex items-center gap-1.5 text-xs text-text-secondary mt-2">
                          <Wrench className="w-3 h-3" strokeWidth={1.6} />
                          Lavori in questa residenza: {s.installedSystemsHere.map(sys => SISTEMA_LABELS[sys]).join(', ')}
                        </p>
                      )}
                      {/* ml allinea il testo a quello dei lavori, dopo icona (w-3) e gap-1.5. */}
                      {s.addedFromDocumentHere && (
                        <p className="text-[10px] text-text-secondary mt-0.5 ml-[18px]">
                          Aggiunto dalla dichiarazione di conformità.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {s.vatNumber && (
                        <p className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                          <Hash className="w-3 h-3" strokeWidth={1.6} />
                          P.IVA {s.vatNumber}
                        </p>
                      )}
                      {(s.phone || s.email) && (
                        <div className="flex items-center gap-3 flex-wrap text-xs text-text-secondary mt-1">
                          {s.phone && (
                            <a href={`tel:${s.phone}`} className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3" strokeWidth={1.6} />
                              {s.phone}
                            </a>
                          )}
                          {s.email && (
                            <a href={`mailto:${s.email}`} className="flex min-w-0 items-start gap-1.5">
                              <Mail className="w-3 h-3 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                              <span className="min-w-0 break-all">{s.email}</span>
                            </a>
                          )}
                        </div>
                      )}

                      <div className="mt-2.5">
                        <p className="flex items-center gap-1.5 text-[10px] font-medium text-text-secondary uppercase tracking-wide mb-1">
                          <Wrench className="w-3 h-3" strokeWidth={1.6} />
                          Lavori realizzati
                        </p>

                        {!s.installations || s.installations.length === 0 ? (
                          <div className="bg-background rounded-lg px-3 py-2.5 space-y-1.5">
                            <p className="text-xs text-text-secondary">
                              Nessun lavoro collegato. Serve a sapere a chi girare un difetto.
                            </p>
                            <button
                              type="button"
                              onClick={() => openInstallForm(s.id)}
                              className="text-xs font-medium text-brand-dark"
                            >
                              + Collega un lavoro
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {groupedInstallations(s.installations).map(group => (
                              <div key={group.residenceId} className="flex items-start gap-2 flex-wrap">
                                <span className="text-xs text-text-primary shrink-0 mt-0.5">{group.residenceName}</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {group.installations.map(inst => (
                                    <span
                                      key={inst.id}
                                      className="inline-flex items-center gap-1 text-[10px] text-text-secondary bg-background border border-border px-1.5 py-0.5 rounded-full"
                                    >
                                      {SISTEMA_LABELS[inst.sistema]}
                                      <button
                                        type="button"
                                        onClick={() => openRemoveInstallation(
                                          inst.id,
                                          `${SISTEMA_LABELS[inst.sistema]} · ${group.residenceName}`
                                        )}
                                        className="text-text-secondary hover:text-semantic-red"
                                        title="Rimuovi collegamento"
                                      >
                                        <X className="w-2.5 h-2.5" strokeWidth={2} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => openInstallForm(s.id)}
                              className="text-xs font-medium text-brand-dark"
                            >
                              + Collega un lavoro
                            </button>
                          </div>
                        )}

                        {showInstallFormFor === s.id && (
                          <form
                            onSubmit={e => handleInstallSubmit(e, s.id)}
                            className="mt-2 bg-background border border-border rounded-lg p-3 space-y-2"
                          >
                            <select
                              name="residence_id"
                              required
                              defaultValue=""
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                            >
                              <option value="" disabled>Residenza…</option>
                              {scope.residences.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            <select
                              name="sistema"
                              required
                              defaultValue=""
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                            >
                              <option value="" disabled>Sistema…</option>
                              {SISTEMI.map(sys => (
                                <option key={sys} value={sys}>{SISTEMA_LABELS[sys]}</option>
                              ))}
                            </select>
                            {installError && <p className="text-xs text-semantic-red">{installError}</p>}
                            <div className="flex gap-2">
                              <button type="submit" disabled={installPending} className="flex-1 py-1.5 bg-brand-dark text-white rounded-lg text-xs disabled:opacity-50">
                                {installPending ? '…' : 'Collega'}
                              </button>
                              <button type="button" onClick={closeInstallForm} className="px-3 py-1.5 border border-border rounded-lg text-xs text-text-secondary">
                                Annulla
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center">
                  <button
                    onClick={() => (editingId === s.id ? closeEdit() : openEdit(s.id))}
                    disabled={editPending}
                    className="p-1.5 text-text-secondary hover:text-brand-dark transition-colors"
                    title="Modifica"
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.6} />
                  </button>
                  {scope.kind === 'residence' && (
                    <button
                      onClick={() => openDeleteModal(s.id)}
                      disabled={deletePending}
                      className="p-1.5 text-text-secondary hover:text-semantic-red transition-colors"
                      title="Rimuovi"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                    </button>
                  )}
                </div>
              </div>

              {/* Stesso form per i due scope, nessun ramo: updateSupplierAnagrafica
                  è riservata al super_admin, come entrambe le pagine che lo aprono. */}
              {editingId === s.id && (
                <form
                  onSubmit={e => handleEditSubmit(e, s.id)}
                  className="mt-3 pt-3 border-t border-border space-y-3"
                >
                  <p className="text-sm font-medium text-text-primary">Modifica anagrafica</p>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Nome *</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={s.name}
                      required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Telefono</label>
                    <input
                      type="tel"
                      name="phone"
                      defaultValue={s.phone ?? ''}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={s.email ?? ''}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Partita IVA — facoltativa</label>
                    <input
                      type="text"
                      name="vat_number"
                      defaultValue={s.vatNumber ?? ''}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                    />
                  </div>
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

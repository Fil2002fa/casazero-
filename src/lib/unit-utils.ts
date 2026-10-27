export function unitHasNoActiveAccount(members: { ended_at: string | null }[]): boolean {
  return members.length === 0 || !members.some(m => m.ended_at === null)
}

export function unitNotDelivered(deliveryDate: string | null): boolean {
  return deliveryDate === null
}

// Ciclo di vita unico dell'unità: unisce data di consegna e account attivo.
// Una data futura conta come consegnata (la data è registrata). Senza data
// ma con un residente attivo resta "non consegnata": il piano non è ancorato
// alla consegna, e l'incoerenza va mostrata, non nascosta.
export type UnitLifecycle =
  | { stato: 'non_consegnata'; residenteGiaAttivo: boolean }
  | { stato: 'consegnata_senza_residente' }
  | { stato: 'residente_attivo' }

// Stato del residente per la card della pagina Unità: unica fonte per il
// testo a destra (schermo grande) e per la coda della riga (schermo piccolo).
// Non consegnata: niente da dire, salvo l'incoerenza "residente già attivo".
export type UnitResidentStatus =
  | { stato: 'nessuno' }
  | { stato: 'da_invitare' }
  | { stato: 'invito_inviato' }
  | { stato: 'residente'; nome: string | null }
  | { stato: 'residente_gia_attivo' }

export function unitResidentStatus(input: {
  deliveryDate: string | null
  members: { ended_at: string | null }[]
  hasActiveInvite: boolean
  residentName: string | null
}): UnitResidentStatus {
  const noAccount = unitHasNoActiveAccount(input.members)
  if (unitNotDelivered(input.deliveryDate)) {
    return noAccount ? { stato: 'nessuno' } : { stato: 'residente_gia_attivo' }
  }
  if (!noAccount) return { stato: 'residente', nome: input.residentName }
  return input.hasActiveInvite ? { stato: 'invito_inviato' } : { stato: 'da_invitare' }
}

export function unitLifecycleStatus(
  deliveryDate: string | null,
  members: { ended_at: string | null }[],
): UnitLifecycle {
  const noAccount = unitHasNoActiveAccount(members)
  if (unitNotDelivered(deliveryDate)) return { stato: 'non_consegnata', residenteGiaAttivo: !noAccount }
  return noAccount ? { stato: 'consegnata_senza_residente' } : { stato: 'residente_attivo' }
}

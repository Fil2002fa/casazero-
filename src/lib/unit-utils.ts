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

export function unitLifecycleStatus(
  deliveryDate: string | null,
  members: { ended_at: string | null }[],
): UnitLifecycle {
  const noAccount = unitHasNoActiveAccount(members)
  if (unitNotDelivered(deliveryDate)) return { stato: 'non_consegnata', residenteGiaAttivo: !noAccount }
  return noAccount ? { stato: 'consegnata_senza_residente' } : { stato: 'residente_attivo' }
}

// Messaggi utente per le violazioni di vincolo della 039 che una scrittura
// su suppliers / supplier_installations può innescare davvero (partita IVA
// duplicata, collegamento duplicato). Non c'è modo di distinguerle da un
// altro unique-violation via error.code (PostgREST restituisce sempre 23505
// per entrambe): si individua il vincolo per nome dal messaggio.
//
// Fonte unica: la pagina fornitori builder e la conferma della proposta dalle
// DiCo scrivono sulle stesse tabelle, e la stessa violazione deve dire la
// stessa cosa su entrambe le superfici. Vive fuori dai file 'use server'
// perché quelli possono esportare solo funzioni async.
const VAT_UNIQUE_INDEX = 'idx_suppliers_builder_vat'
const INSTALLATION_UNIQUE_CONSTRAINT = 'supplier_installations_unici'

// Esportata a parte perché la conferma della proposta dalle DiCo non si limita
// a tradurre questa violazione: la usa per decidere di abortire (la P.IVA del
// documento è di un altro fornitore → il match per nome era sbagliato).
export function isVatUniqueViolation(message: string): boolean {
  return message.includes(VAT_UNIQUE_INDEX)
}

export function friendlySupplierError(message: string): string {
  if (isVatUniqueViolation(message)) {
    return 'Partita IVA già usata da un altro fornitore di questo costruttore.'
  }
  if (message.includes(INSTALLATION_UNIQUE_CONSTRAINT)) {
    return 'Questo fornitore ha già un lavoro collegato per questo sistema in questa residenza.'
  }
  return message
}

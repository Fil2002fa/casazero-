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

export function friendlySupplierError(message: string): string {
  if (message.includes(VAT_UNIQUE_INDEX)) {
    return 'Partita IVA già usata da un altro fornitore di questo costruttore.'
  }
  if (message.includes(INSTALLATION_UNIQUE_CONSTRAINT)) {
    return 'Questo fornitore ha già un lavoro collegato per questo sistema in questa residenza.'
  }
  return message
}

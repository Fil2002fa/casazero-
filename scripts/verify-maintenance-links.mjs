// ============================================================
// CasaZero — verifica del link alla voce nelle email di manutenzione.
// Uso:  node --experimental-strip-types scripts/verify-maintenance-links.mjs
//       (oppure: npm run verify:link)
// ------------------------------------------------------------
// COSA GARANTISCE: che maintenanceItemUrl (src/lib/notifications.ts) scelga il
// percorso dal RUOLO del destinatario, e che i tre template del cron mettano
// nell'href esattamente l'URL ricevuto, senza ricostruirlo.
//
//   client               → /manutenzioni/<id>        (PWA residente)
//   admin, super_admin   → /admin/manutenzioni/<id>  (dashboard)
//   ruolo mancante       → /manutenzioni             (elenco, il link di prima)
//
// E che il ruolo del link segua l'ACCESSO alla voce (linkRoleForAccess), non il
// solo profiles.role: admin non assegnato e super_admin di un altro builder
// vanno all'elenco, perché la RLS nasconde la voce e il dettaglio darebbe 404.
// La lettura di assegnazioni e builder (getItemLinkRoles) è DB e non si prova
// qui: questo script copre la regola pura.
//
// PERCHE' ESISTE: il layout della PWA ((app)/layout.tsx:12) rimanda ogni ruolo
// diverso da client a /admin perdendo il percorso. Un link per ruolo sbagliato
// non da errore: porta in silenzio sulla home della dashboard.
//
// exit 0 = tutti i casi ok; exit 1 = almeno un caso divergente; exit 2 =
// import fallito.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const NOTIFICATIONS = new URL('../src/lib/notifications.ts', import.meta.url)

let n
try {
  n = await import(NOTIFICATIONS.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-maintenance-links.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  maintenanceItemUrl, linkRoleForAccess, emailMaintenanceDue, emailPromemoriaDue, emailMaintenanceReminder,
} = n

let fallimenti = 0
let eseguiti = 0

function check(label, ottenuto, atteso) {
  eseguiti++
  const a = JSON.stringify(ottenuto)
  const b = JSON.stringify(atteso)
  if (a === b) return
  fallimenti++
  console.error(`✗ ${label}\n    atteso:   ${b}\n    ottenuto: ${a}`)
}

const APP = 'https://app.example.test'
const ID = '4faf340b-fd85-4498-966b-a08e515aa6c8'

// --- helper: un caso per ruolo ------------------------------------------------
check('client → PWA residente',
  maintenanceItemUrl(APP, 'client', ID), `${APP}/manutenzioni/${ID}`)
check('admin → dashboard',
  maintenanceItemUrl(APP, 'admin', ID), `${APP}/admin/manutenzioni/${ID}`)
check('super_admin → dashboard',
  maintenanceItemUrl(APP, 'super_admin', ID), `${APP}/admin/manutenzioni/${ID}`)

// --- ruolo mancante: mai un percorso di shell scelto a caso --------------------
check('ruolo null → elenco', maintenanceItemUrl(APP, null, ID), `${APP}/manutenzioni`)
check('ruolo undefined → elenco', maintenanceItemUrl(APP, undefined, ID), `${APP}/manutenzioni`)
check('ruolo sconosciuto → elenco', maintenanceItemUrl(APP, 'boh', ID), `${APP}/manutenzioni`)
check('ruolo stringa vuota → elenco', maintenanceItemUrl(APP, '', ID), `${APP}/manutenzioni`)

// --- ruolo per ACCESSO alla voce: mai un link che la RLS trasforma in 404 --------
// Specchio della RLS di maintenance_items. Il caso B39v: filippoloro02 (admin)
// membro di un'unità di Cavaccio senza esservi assegnato → elenco, non dettaglio.
const urlPer = (ruolo, access) => maintenanceItemUrl(APP, linkRoleForAccess(ruolo, access), ID)
const elenco = `${APP}/manutenzioni`
const dettaglioAdmin = `${APP}/admin/manutenzioni/${ID}`

check('admin assegnato alla residenza → dettaglio admin',
  urlPer('admin', { assignedToResidence: true, sameBuilderAsResidence: false }), dettaglioAdmin)
check('admin NON assegnato (anche se dello stesso builder) → elenco',
  urlPer('admin', { assignedToResidence: false, sameBuilderAsResidence: true }), elenco)
check('super_admin dello stesso builder della residenza → dettaglio admin',
  urlPer('super_admin', { assignedToResidence: false, sameBuilderAsResidence: true }), dettaglioAdmin)
check('super_admin di un altro builder → elenco',
  urlPer('super_admin', { assignedToResidence: false, sameBuilderAsResidence: false }), elenco)
check('client → PWA residente, a prescindere dall\'accesso admin',
  urlPer('client', { assignedToResidence: false, sameBuilderAsResidence: false }), `${APP}/manutenzioni/${ID}`)
check('ruolo sconosciuto → elenco',
  urlPer('boh', { assignedToResidence: true, sameBuilderAsResidence: true }), elenco)
check('admin assegnato: l\'assegnazione conta, non il builder',
  urlPer('admin', { assignedToResidence: true, sameBuilderAsResidence: false }), dettaglioAdmin)

// --- l'id non può rompere il percorso ------------------------------------------
check('id con caratteri riservati viene codificato',
  maintenanceItemUrl(APP, 'client', 'a/b?c'), `${APP}/manutenzioni/a%2Fb%3Fc`)

// --- i tre template del cron: href = URL ricevuto, nient'altro -----------------
const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1])
const urlClient = maintenanceItemUrl(APP, 'client', ID)
const urlAdmin = maintenanceItemUrl(APP, 'admin', ID)

check('emailMaintenanceDue (residente) usa l\'URL ricevuto',
  hrefs(emailMaintenanceDue('Pulizia condotti', 'residente', '2026-09-20', urlClient)), [urlClient])
check('emailMaintenanceDue (amministratore) usa l\'URL ricevuto',
  hrefs(emailMaintenanceDue('Verifica estintori', 'amministratore', '2026-10-05', urlAdmin)), [urlAdmin])
check('emailPromemoriaDue usa l\'URL ricevuto',
  hrefs(emailPromemoriaDue('Controllo inverter', 1, urlClient)), [urlClient])
check('emailMaintenanceReminder usa l\'URL ricevuto',
  hrefs(emailMaintenanceReminder('Pulizia condotti', '2026-09-20', urlAdmin)), [urlAdmin])

// Il vecchio link generico non deve sopravvivere nei template.
for (const [nome, html] of [
  ['emailMaintenanceDue', emailMaintenanceDue('T', 'residente', '2026-09-20', urlClient)],
  ['emailPromemoriaDue', emailPromemoriaDue('T', 1, urlClient)],
  ['emailMaintenanceReminder', emailMaintenanceReminder('T', '2026-09-20', urlClient)],
]) {
  check(`${nome}: nessun href generico /manutenzioni`, hrefs(html).includes(`${APP}/manutenzioni`), false)
}

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi su ${eseguiti} divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi ok`)

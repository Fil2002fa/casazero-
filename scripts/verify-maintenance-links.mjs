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
  maintenanceItemUrl, emailMaintenanceDue, emailPromemoriaDue, emailMaintenanceReminder,
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

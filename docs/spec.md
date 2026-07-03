> DEPRECATO — riferimento storico v1. Le regole correnti sono in CLAUDE.md.
> Questo documento descrive il progetto com'era all'inizio. La nomenclatura N1/N2/N3
> è ABOLITA (sostituita dal modello a due assi completion_mode × obligation_type),
> il catalogo è passato da 27 a 19 voci attive. Non usare mai questo file come
> istruzioni di sessione.

# CasaZero — Specifica tecnica v1

Documento di riferimento per lo sviluppo. Da usare come istruzioni per Claude Code:
copiare questo file nella cartella del progetto come CLAUDE.md (o referenziarlo da esso).

## 1. Visione e posizionamento

CasaZero è il libretto di manutenzione digitale dell'immobile che un costruttore consegna
insieme alla casa. Non è un gestionale per amministratori né un'app social di condominio.

Tre pilastri:

1. **Scadenzario automatico** — catalogo di 27 manutenzioni con priorità N1/N2/N3 e frequenze.
2. **Fascicolo dell'immobile** — storico permanente e certificato di ogni intervento, legato
   all'unità immobiliare (non alla persona): si trasferisce al nuovo proprietario alla vendita.
3. **Documenti** — archivio per categoria di certificati, garanzie, manuali, planimetrie.

Elementi distintivi: campo "garanzia collegata" su ogni manutenzione, report annuale PDF
automatico, onboarding via QR code alla consegna chiavi, white-label leggero per costruttore.

Cliente pilota: Furlan Costruzioni, residenza Residenza Cavaccio (14 unità clienti +
1 amministratore di condominio). L'architettura è multi-tenant fin dal primo giorno.

## 2. Stack tecnico

- Frontend + backend: Next.js (App Router, TypeScript), un solo codebase per app cliente,
  vista amministratore e dashboard super admin.
- PWA: installabile, manifest + service worker, notifiche Web Push.
- Database/Auth/Storage: Supabase (Postgres con Row Level Security, Supabase Auth,
  Storage per allegati e documenti).
- Auth: Google Sign-In + magic link via email. Nessuna registrazione autonoma: accessi
  creati da inviti (vedi §7). Niente OTP custom.
- Email transazionali: Resend (o equivalente) per notifiche e magic link.
- PDF: generazione report annuale lato server (es. @react-pdf/renderer o Puppeteer).
- Hosting: Vercel. Ambiente di sviluppo: Windows.

## 3. Design system (palette C — "Verde profondo")

- Sfondo app: #F4F3EF (grigio caldo)
- Superfici/card: #FFFFFF, bordo #E4E6E2, radius 10–12px
- Verde brand scuro (header, pulsanti primari): #04342C
- Verde brand medio (accenti, icone): #0F6E56
- Verde chiaro (chip, sfondi icona, testo su scuro): #E1F5EE / #9FE1CB
- Testo primario: #20302A · secondario: grigio caldo medio
- Semantici: rosso #A32D2D su #FCEBEB (scadute/N2), ambra #854F0B su #FAEEDA
  (in corso/N3), blu #185FA5 su #E6F1FB (consigli/N1)
- Tipografia: sans-serif di sistema o Inter; due pesi (400/500); sentence case
- Bottom nav a sole icone: Home, Documenti, Manutenzioni, Fascicolo, Profilo
- Stile: flat, niente gradienti né ombre pesanti, molto whitespace
- White-label: logo e colore primario configurabili per costruttore (CSS custom properties)

## 4. Ruoli e permessi

| Ruolo | Ambito | Può fare |
|---|---|---|
| Cliente (residente) | La propria unità + parti comuni della propria residenza | Vedere documenti e manutenzioni; completare N2 della propria unità; vedere (non completare) N3; consultare fascicolo della propria unità; commentare una manutenzione; gestire profilo |
| Amministratore di condominio | Solo le residenze assegnate | Tutto il ciclo N3 (prendi in carico → in corso → completata + allegati); caricare documenti di residenza; vedere panoramica manutenzioni |
| Super admin (costruttore) | Tutte le residenze del proprio tenant | Creare residenze da template; creare/invitare account; caricare documenti; configurare fornitori, garanzie, frequenze; vedere tutto |

Ogni accesso è vincolato da RLS su Postgres: nessuna query può uscire dal proprio tenant/residenza.
Più persone (familiari) possono essere membri della stessa unità con account separati.

## 5. Modello dati (entità principali)

Il fascicolo appartiene all'unità immobiliare. I dati restano quando cambiano i proprietari.

- **builders** — costruttore/tenant: nome, logo, colore primario
- **residences** — residenza: builder_id, nome, indirizzo, classe energetica, foto
- **units** — unità immobiliare: residence_id, etichetta (es. "Unità 7")
- **profiles** — utenti (estende auth): nome, email, telefono, ruolo
- **unit_members** — relazione utente↔unità con data inizio/fine (storicizza i passaggi di proprietà)
- **admin_assignments** — relazione amministratore↔residenza
- **maintenance_templates** — le 27 voci di catalogo: titolo, categoria, descrizione,
  frequenza (mesi), priorità (N1/N2/N3), ambito (unità | condominio)
- **maintenance_items** — istanza per residenza o unità: template_id, scope_id, frequenza
  e priorità eventualmente personalizzate, testo "garanzia collegata", supplier_id,
  prossima scadenza, stato (in_attesa | scaduta | in_corso | completata)
- **completions** — registro immutabile (il fascicolo): item_id, unit_id/residence_id,
  data intervento, eseguito_da (utente o testo libero fornitore), note, created_at.
  Mai cancellabile né modificabile dopo la creazione.
- **attachments** — file (foto/fatture/verbali) collegati a completions o documents
- **documents** — documenti: scope (unità o residenza), categoria (proprietà | tecnici |
  energetici | conformità | amministrativi), titolo, file, data
- **suppliers** — fornitori per residenza: nome, telefono, email, categorie coperte
- **notifications** — coda notifiche: destinatario, tipo, payload, stato invio (push/email)
- **comments** — thread per maintenance_item (sostituisce i ticket in v1)
- **invites** — token di invito: unit_id o residenza+ruolo, email, scadenza, QR

## 6. Regole di business N1/N2/N3

Calcolo scadenza: prossima_scadenza = data_ultimo_completamento (o data_consegna) + frequenza.
Un job giornaliero (cron Vercel/Supabase) valuta scadenze e genera notifiche.

### N1 — Consigliata (solo cliente)

- Alla scadenza: notifica push+email "CasaZero ti consiglia di…".
- Non completabile. Resta visibile nella sezione "Consigliate" (nessuna sparizione
  automatica: decisione presa in revisione, sostituisce la regola 24/48h del documento
  originale). Il timer riparte automaticamente alla scadenza successiva.
- Azioni: Dettagli, contatto assistenza CasaZero.

### N2 — Obbligatoria (a carico del cliente)

- Alla scadenza: notifica al cliente; la card appare rossa in home.
- Promemoria automatico ogni 2 settimane finché non completata.
- Azioni cliente: Segna completata (form: data, note facoltative, foto/fattura
  facoltativa), Dettagli, Contatta fornitore, commento.
- Al completamento: record in completions, sparisce dal feed, ricalcolo scadenza.

### N3 — A carico dell'amministratore di condominio

- Alla scadenza: notifica all'amministratore; promemoria mensile finché non completata.
- Cicli di stato amministratore: Scaduta → Prendi in carico → In corso (+ Allega
  verbale/foto) → Segna completata.
- I clienti della residenza vedono la N3 con il suo stato ma non possono completarla;
  possono aprire Dettagli e contattare amministratore o assistenza.
- Al completamento: sparisce dal feed di tutti, record nel fascicolo (visibile col filtro
  "Condominio"), notifica ai residenti, ricalcolo scadenza.

## 7. Onboarding e autenticazione

### Nuova consegna (QR)

1. Il super admin crea l'unità e genera un invito QR (token univoco, scadenza 30 gg).
2. Il cliente scansiona il QR sul contratto → pagina di benvenuto personalizzata
   ("Benvenuto a casa, …" + riepilogo: documenti caricati, 27 manutenzioni, fascicolo attivo).
3. Sceglie Google Sign-In o email (magic link) → l'account viene legato all'unità.
4. Prompt di installazione PWA ("aggiungi alla schermata home").

Più familiari: il primo membro (o il super admin) può generare inviti aggiuntivi per
la stessa unità.

### Edifici esistenti (wizard date)

- Il super admin crea la residenza dal template e per ogni voce inserisce data di
  consegna o data dell'ultimo intervento noto; il sistema ricalcola tutte le scadenze.
- Questo abilita l'ingresso dei clienti CasaZero già esistenti.

### Passaggio di proprietà

- Il super admin chiude il unit_member corrente e genera un nuovo invito QR.
- Il fascicolo e i documenti dell'unità restano intatti per il nuovo proprietario.

## 8. Notifiche

- Canali: Web Push (PWA) + email come fallback sempre attivo (nessuna scadenza
  deve andare persa se l'utente non installa la PWA).
- Eventi: manutenzione in scadenza/scaduta, promemoria periodici (regole §6), N3 cambiata
  di stato, nuovo documento caricato, nuovo commento.
- Preferenze di notifica nel profilo (email sempre on per N2/N3 scadute).

## 9. Schermate v1

App cliente (prototipate): Home (copertina residenza, "N scadenze richiedono attenzione",
card scadenze con codice colore, accessi rapidi Documenti/Fascicolo) · Dettaglio manutenzione
(badge priorità, descrizione, riquadro garanzia, fornitore della residenza, form completamento,
storico voce) · Fascicolo (conformità %, contatori, filtro Tutti/Unità/Condominio, timeline
interventi con allegati, download report annuale) · Lista manutenzioni (filtri Tutte/In corso/
Completate/Consigliate) · Documenti (ricerca + categorie + download) · Profilo (dati, residenza,
preferenze notifiche, gestione accessi familiari) · Login/benvenuto QR.

Vista amministratore (prototipata): contatori scadute/in corso/anno, lista N3 con azioni
per stato, allegati verbale, nota trasparenza verso i residenti.

Dashboard super admin (essenziale, stesse route /admin): lista residenze · crea residenza
da template (wizard date per esistenti) · gestione unità e inviti · upload documenti ·
configurazione fornitori, garanzie e frequenze per residenza · panoramica manutenzioni ·
impostazioni white-label del costruttore.

## 10. Report annuale PDF

Generato on-demand (e a fine anno) per unità e per residenza: intestazione white-label,
percentuale conformità, elenco interventi completati con date/esecutore/allegati conteggiati,
voci scadute non eseguite. È la prova documentale per garanzie e rivendita.

## 11. Fuori scope v1 (fase 2)

Chat di gruppo condominiale · assistente "CasaZero AI" · timeline costruzione stile Amazon ·
app native iOS/Android (store) · ticket strutturati (in v1: thread commenti per manutenzione) ·
statistiche globali avanzate e consumi energetici · marketplace fornitori con commissioni.

## 12. Milestone di sviluppo (per Claude Code)

- **M1 — Fondamenta**: progetto Next.js + Supabase, schema DB completo con RLS,
  seed delle 27 manutenzioni template, auth (Google + magic link), layout PWA con palette C.
- **M2 — Motore manutenzioni**: calcolo scadenze, cron notifiche, regole N1/N2/N3,
  flusso completamento N2 con allegati, ciclo N3 amministratore.
- **M3 — Fascicolo e documenti**: timeline completions, conformità %, upload/download
  documenti per categoria, commenti per manutenzione.
- **M4 — Onboarding e admin**: inviti QR, wizard date edifici esistenti, dashboard
  essenziale super admin, white-label.
- **M5 — Rifinitura**: report PDF, notifiche push, preferenze profilo, seed demo
  "Residenza Cavaccio" (14 unità) per la presentazione a Furlan.

Criterio di completamento v1: demo end-to-end con la Residenza Cavaccio — dal QR di
benvenuto al report annuale scaricato.

## Appendice A — Catalogo 27 manutenzioni (seed)

Formato: titolo — categoria — frequenza — priorità — ambito.

### Coperture e tetto

1. Pulizia grondaie e canali di gronda — Coperture — 24 mesi — N3 — condominio
2. Controllo canali di gronda — Coperture — 24 mesi (alternata alla 1) — N3 — condominio
3. Controllo manto di copertura (giugno) — Coperture — 12 mesi — N3 — condominio
4. Verifica lucernari — Coperture — 12 mesi — N3 — condominio
5. Controllo antenna TV/parabola — Coperture — 12 mesi — N3 — condominio

### Ventilazione / aerazione

6. Condotti evacuazione vapori di cottura — Ventilazione — 12 mesi — N2 — unità
7. Condotti aerazione bagni ciechi — Ventilazione — 12 mesi — N2 — unità
8. VMC: sostituzione filtri — Ventilazione — 12 mesi — N2 — unità
9. VMC: pulizia condotti — Ventilazione — 8 mesi — N2 — unità

### Termico e clima

10. Carica refrigerante climatizzazione — Termico — 12 mesi — N2 — unità
11. Pulizia filtri unità interne A/C — Termico — 12 mesi — N2 — unità
12. Pressione vasi di espansione — Termico — 12 mesi — N2 — unità
13. Pompa di circolazione impianto a pavimento — Termico — 12 mesi — N2 — unità
14. Registrazione manutenzione su libretto impianto — Termico — 12 mesi — N2 — unità

### Elettrico

15. Test differenziale impianto elettrico — Elettrico — 1 mese — N2 — unità
16. Controllo visivo prese e comandi — Elettrico — 1 mese — N1 — unità
17. Verifica messa a terra condominiale — Elettrico — 36 mesi — N3 — condominio

### Fotovoltaico

18. Test differenziale generale FV — Fotovoltaico — 1 mese — N2 — unità
19. Controllo inverter e quadri FV — Fotovoltaico — 1 mese — N1 — unità
20. Integrità moduli FV + pulizia — Fotovoltaico — 12 mesi — N3 — condominio

### Finiture e serramenti

21. Imbiancatura interni (pittura semi-lavabile) — Finiture — 36 mesi — N1 — unità
22. Pulizia muri esterni — Finiture — 24 mesi — N1 — condominio
23. Trattamento idrorepellente muri esterni — Finiture — 60 mesi — N1 — condominio
24. Controllo serramenti — Finiture — 6 mesi — N2 — unità

### Sicurezza in copertura

25. Verifica linee vita — Sicurezza — 12 mesi — N3 — condominio

### Scarichi e spurghi

26. Fosse biologiche e condensa grassi: pulizia — Spurghi — 6 mesi — N3 — condominio
27. Pozzetti di ispezione e condotte: pulizia — Spurghi — 3 mesi — N3 — condominio

Frequenze e priorità sono il default del template: il super admin può personalizzarle
per residenza dalla dashboard. Le descrizioni estese arriveranno dai fornitori e si
inseriscono dalla dashboard senza modifiche al codice.
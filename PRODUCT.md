# Product

## Register

product

## Users

- **Residente**: proprietario di un'unità immobiliare che ha appena ricevuto le chiavi. Usa la PWA `(app)` da mobile per sapere cosa va fatto e quando, consultare il fascicolo della propria unità e archiviare documenti. Non è un utente esperto di gestione immobiliare: vuole risposte rapide, non un gestionale.
- **Amministratore di condominio**: gestisce le manutenzioni a carico delle parti condominiali per una residenza. Opera nella stessa PWA `(app)` in modalità amministratore.
- **Super admin (costruttore, es. Furlan Costruzioni)**: configura residenze, piani di manutenzione, inviti e amministratori da `(dashboard)` desktop. Multi-tenant fin dal primo giorno — più costruttori, più residenze.

## Product Purpose

CasaZero è il libretto di manutenzione digitale dell'immobile che un costruttore consegna al momento della vendita. Tre pilastri: scadenzario automatico delle manutenzioni, fascicolo dell'immobile (storico permanente e certificato, legato all'unità e non alla persona — si trasferisce col passaggio di proprietà), archivio documenti per categoria.

Non è un gestionale per amministratori né un'app social di condominio. Successo = il residente sa sempre cosa fare senza doverlo chiedere, e il fascicolo è un registro di cui builder e proprietari si fidano senza riserve nel tempo (anche a distanza di anni, anche con proprietari diversi).

## Brand Personality

**Essenziale e diretto.** Un utensile senza fronzoli: fa un lavoro preciso — dire cosa è dovuto, quando, e cosa è già stato fatto — e si toglie di mezzo. Non cerca di intrattenere né di sembrare "amichevole" a forza di copy.

Sotto questa essenzialità c'è un registro istituzionale non negoziabile: il fascicolo è un documento legale immutabile, non un feed. Il tono deve restare sobrio e affidabile lì dove la posta in gioco è la fiducia nel record (fascicolo, completamenti, garanzie), anche se il resto dell'interfaccia resta minimale e funzionale.

## Anti-references

**App social di condominio.** Niente chat, bacheca, feed, notifiche "social", badge, like, commenti. CasaZero non mette in relazione i residenti tra loro — ogni utente vede solo la propria unità (o l'ambito che gli compete). Qualsiasi pattern che suggerisca conversazione, community o attività in tempo reale condivisa è fuori scope.

Per estensione, restano fuori anche: dashboard SaaS generiche con hero-metrico e grafici decorativi, e gestionali amministrativi densi di tabelle/filtri in stile software anni 2000 — CasaZero preferisce poche informazioni ben gerarchizzate a molte informazioni compresse.

## Design Principles

- **Il fascicolo è un documento legale, non un feed.** Ogni superficie che tocca `completions` deve comunicare immutabilità e permanenza, mai transitorietà o modificabilità — niente pattern "social" (like, commenti, edit inline) su ciò che per legge non si tocca.
- **La promemoria non è mai "scaduta".** Vincolo di linguaggio strutturale: le voci a modalità promemoria non confrontano mai date né mostrano stato di scadenza, indipendentemente da cosa dica il DB. È una garanzia di prodotto, non una scelta cosmetica.
- **Ogni ruolo vede solo ciò che gli serve.** Residente, amministratore e super admin hanno bisogni diversi e superfici diverse (`(app)` vs `(dashboard)`); non esporre complessità gestionale a chi non deve gestire nulla.
- **Lo stato si legge a colpo d'occhio.** Chi apre l'app deve capire "sono in regola / c'è qualcosa da fare / è solo un consiglio" senza leggere date o paragrafi — colore e gerarchia fanno il lavoro che il testo non deve fare.
- **White-label leggero, mai invasivo.** Logo e colore primario del costruttore si sovrappongono al sistema esistente (CSS custom properties) senza romperne la struttura o la leggibilità.

## Accessibility & Inclusion

WCAG AA come baseline: contrasto testo/sfondo verificato, navigazione da tastiera, semantica corretta per screen reader. Nessun requisito oltre lo standard è stato segnalato esplicitamente, ma va tenuto presente che l'utenza residente non è necessariamente giovane o esperta di app — preferire target touch generosi e testo leggibile per default, anche senza un requisito formale superiore ad AA.

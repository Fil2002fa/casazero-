# FASE 0 — diagnosi read-only

Sei in modalità READ-ONLY. Non modificare file, non scrivere, non
eseguire comandi git che mutino stato. Nessun commit.

## Delega a subagent

Delega l'esplorazione del codice a un subagent read-only con brief
ristretto. Formato di ritorno obbligatorio per ogni riscontro:
  FINDING: una riga
  EVIDENCE: path:riga + estratto di codice reale
  CONFIDENCE: alta | media | bassa
Il report torna nella sessione principale; il rumore
dell'esplorazione resta nel contesto del subagent.

## Vincoli da dichiarare prima di iniziare

Ampiezza attesa e vincolo strutturale vanno dichiarati nella
diagnosi, non scoperti al diff. Default se non specificato:
- esporre la pagina INTERA, mai una variante ridotta a porta singola
- mai JSX duplicato tra rami di ruolo: componente condiviso, si
  ramifica solo sulle prop che differiscono davvero

## Output

1. Riscontri numerati, ognuno con la sua EVIDENCE.
2. Piano commit numerato (1, 2, 3...), ognuno indipendentemente
   verificabile, con il comando esatto che lo prova.
3. STOP e attesa di approvazione esplicita. Non implementare nulla.

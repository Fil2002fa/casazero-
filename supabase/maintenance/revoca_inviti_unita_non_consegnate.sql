-- ============================================================
-- Pulizia dati: revoca degli inviti attivi delle unità non consegnate
--
-- Regola: un'unità non consegnata (units.delivery_date IS NULL) non ha
-- inviti attivi. "Invito attivo" = used_at IS NULL AND expires_at > now(),
-- stessa definizione del codice (createInvite, createBulkInvites, revoca in
-- registerDelivery). "Revoca" = DELETE della riga, come revokeInvite.
--
-- Non tocca: inviti usati (used_at valorizzato), inviti scaduti, inviti di
-- residenza (unit_id NULL), unit_members (un residente già attivo resta).
-- Scope: TUTTE le unità con delivery_date NULL, di ogni costruttore
-- (archivio compreso). Per limitarlo, aggiungere il filtro su builder_id
-- indicato in ogni statement.
--
-- SQL Editor senza transazioni: statement singoli, idempotenti, da lanciare
-- uno alla volta nell'ordine V1 → V2 → D1 → V3.
-- ============================================================

-- V1 (prima) — dettaglio degli inviti che verranno revocati
SELECT b.name AS costruttore, r.name AS residenza, u.label AS unita,
       i.id AS invite_id, i.created_at, i.expires_at
FROM invites i
JOIN units u      ON u.id = i.unit_id
JOIN residences r ON r.id = u.residence_id
JOIN builders b   ON b.id = r.builder_id
WHERE u.delivery_date IS NULL
  AND i.used_at IS NULL
  AND i.expires_at > now()
  -- AND r.builder_id = '<uuid builder>'
ORDER BY b.name, r.name, u.label;

-- V2 (prima) — totale da revocare: annotare il numero, D1 deve restituire
-- lo stesso numero di righe
SELECT count(*) AS inviti_da_revocare
FROM invites i
JOIN units u ON u.id = i.unit_id
WHERE u.delivery_date IS NULL
  AND i.used_at IS NULL
  AND i.expires_at > now();
  -- filtro builder: AND u.residence_id IN (SELECT id FROM residences WHERE builder_id = '<uuid builder>')

-- D1 — revoca. Idempotente: un secondo lancio non trova righe e restituisce 0.
DELETE FROM invites i
USING units u
WHERE u.id = i.unit_id
  AND u.delivery_date IS NULL
  AND i.used_at IS NULL
  AND i.expires_at > now()
  -- filtro builder: AND u.residence_id IN (SELECT id FROM residences WHERE builder_id = '<uuid builder>')
RETURNING i.id AS invite_id_revocato, i.unit_id;

-- V3 (dopo) — atteso 0
SELECT count(*) AS inviti_attivi_su_unita_non_consegnate_attesi_0
FROM invites i
JOIN units u ON u.id = i.unit_id
WHERE u.delivery_date IS NULL
  AND i.used_at IS NULL
  AND i.expires_at > now();

-- ============================================================
-- ESITO — eseguito il 2026-10-27 da Filippo nel SQL Editor, senza filtro builder
-- V1 prima:  2 inviti, entrambi in residenza teolo: Appartamento 2, TestR9ssss
-- V2 prima:  2
-- D1 righe:  2 revocate (coincide con V2)
-- V3 dopo:   0 (atteso 0)
-- ============================================================

-- ============================================================
-- CasaZero — 036: scrittura su suppliers per l'amministratore
-- ANTEPRIMA. Applica Filippo nel SQL Editor; subito dopo incolla nel footer
-- l'output della SELECT finale (convenzione 027/030/031/033/034/035).
-- ------------------------------------------------------------
-- CONCERN UNICO: dare al ruolo `admin` INSERT/UPDATE/DELETE su suppliers,
-- limitatamente alle residenze che segue. Nessun'altra tabella, nessun DDL,
-- nessuna policy esistente modificata.
--
-- DECISIONE DI PRODOTTO CHE LA MOTIVA: la gestione dei fornitori spetta
-- all'amministratore di condominio, non al costruttore. E' lui che ingaggia
-- le ditte negli anni, dopo la consegna dell'immobile.
--
-- INCOERENZA CHE CHIUDE (misurata, non supposta):
--   • src/app/(dashboard)/admin/residences/[id]/fornitori/page.tsx:15
--     ammette gia' entrambi i ruoli: requireRole(['admin', 'super_admin']).
--   • .../fornitori/actions.ts:41 fa lo stesso controllo applicativo
--     (['admin','super_admin'].includes(profile.role)) prima dell'insert.
--   • ma su suppliers esistono solo due policy (002_rls.sql:413-425):
--       "suppliers: lettura se si ha accesso alla residenza"  FOR SELECT
--       "suppliers: super_admin gestisce"                     FOR ALL
--     nessuna delle due concede scritture all'admin.
--   Risultato oggi: l'admin supera il controllo applicativo e viene fermato
--   dal default-deny della RLS. La pagina esiste, il permesso no.
--
-- PERCHE' RIUSA czero_can_access_residence (002_rls.sql:29-55) invece di
-- riscrivere la EXISTS su admin_assignments: e' la stessa funzione che
-- governa gia' l'accesso dell'admin a residences, units, maintenance_items,
-- documents e alla SELECT su suppliers. Duplicare la logica qui creerebbe
-- una seconda definizione di "residenza che l'admin segue", da tenere
-- allineata a mano. La funzione e' STABLE SECURITY DEFINER con search_path
-- fisso: nessuna RLS ricorsiva, nessuna search_path injection.
--
-- PERCHE' IL CONGIUNTO czero_user_role() = 'admin' E' NECESSARIO:
-- czero_can_access_residence e' vera anche per super_admin (stesso builder) e
-- per client (unita' nella residenza). Senza il congiunto sul ruolo, questa
-- policy concederebbe scrittura sui fornitori anche ai residenti. E' lo
-- stesso schema gia' usato da "items: admin aggiorna stato" (002_rls.sql:296-301).
--
-- PERCHE' USING **E** WITH CHECK, non solo USING:
--   • USING      -> quali righe gia' esistenti l'admin puo' vedere per
--                   UPDATE/DELETE (valutata sulla riga PRIMA della modifica).
--   • WITH CHECK -> com'e' la riga DOPO INSERT/UPDATE.
-- Con la sola USING, PostgreSQL la riuserebbe implicitamente come WITH CHECK
-- e il risultato sarebbe equivalente; la si scrive comunque esplicita perche'
-- il vincolo che protegge sia leggibile nel file: senza WITH CHECK sul
-- residence_id post-scrittura, un admin potrebbe (a) inserire un fornitore
-- su una residenza che non segue passando un residence_id arbitrario, e
-- (b) "spostare" con UPDATE un proprio fornitore su una residenza altrui —
-- la USING avrebbe gia' approvato la riga nel suo stato di partenza.
--
-- COSA NON TOCCA:
--   • "suppliers: super_admin gestisce" (002_rls.sql:417-425): invariata. Le
--     policy PERMISSIVE si sommano in OR, quindi il costruttore conserva
--     esattamente i permessi di prima.
--   • "suppliers: lettura se si ha accesso alla residenza" (002:413-415):
--     invariata. L'admin leggeva gia' i fornitori delle sue residenze; qui si
--     aggiungono solo le scritture.
--   • grants a livello di privilegio: authenticated ha gia'
--     DELETE, INSERT, SELECT, UPDATE su suppliers (registrato nel footer
--     della 031, riga 138). Nessun GRANT necessario: mancava solo la policy.
--   • completions e ogni altra tabella: fuori scope.
--
-- NOTA SUL DELETE — audit delle FK entranti (agli atti, nessuna azione qui).
-- FOR ALL include DELETE, quindi prima di concederlo si e' inventariato tutto
-- cio' che punta a suppliers(id) nell'intero schema. Risultato: UNA sola FK.
--
--   maintenance_items.supplier_id -> suppliers(id)   [001_schema.sql:142]
--     nessuna clausola ON DELETE -> NO ACTION (default Postgres).
--     Mai alterata dopo la 001: nessun ADD/DROP CONSTRAINT su questa FK in
--     tutta la cartella migrations.
--
-- NESSUNA FK E' ON DELETE CASCADE. Un fornitore agganciato a una voce di
-- manutenzione non e' cancellabile nemmeno con questa policy: la FK rifiuta
-- (errore 23503) prima ancora che la RLS entri in gioco, e non viene
-- cancellata nessuna riga collegata. Il DELETE concesso all'admin copre solo
-- i fornitori non agganciati ad alcuna voce.
--
-- completions NON dipende da suppliers: la tabella non ha colonna supplier_id
-- ne' alcuna FK verso suppliers (001_schema.sql:156-167). Chi ha eseguito
-- l'intervento e' registrato in performed_by_name, testo libero denormalizzato
-- proprio per il fornitore esterno (001_schema.sql:163). Il fascicolo legale
-- e' quindi strutturalmente immune alla cancellazione di un fornitore: nessuna
-- riga di storico si perde, nessuna diventa orfana. Invariante rispettata.
--
-- La policy amplia il permesso, non aggira il vincolo di integrita'.
--
-- PERCHE' NON C'E' NOTIFY pgrst: non c'e' DDL su tabelle/colonne/funzioni.
-- La schema-cache di PostgREST non indicizza le policy. Stesso criterio
-- della 035; stessa forma della 016, l'altra migrazione di sola CREATE POLICY.
--
-- NUMERAZIONE: 036 e' il primo numero libero. L'ultima migrazione chiusa e'
-- la 035; nella cartella non esistono duplicati. Esiste un solo buco storico,
-- il 029: quel numero non e' mai stato usato (nessun file con quel prefisso
-- compare in tutta la storia git, si passa dalla 028 alla 030). Non e' una
-- migrazione mancante da recuperare: e' un numero saltato.
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS prima del CREATE. Rieseguirla ricrea la
-- stessa policy senza toccare le altre due.
-- ============================================================

-- ------------------------------------------------------------
-- 1) POLICY — scrittura admin limitata alle residenze assegnate
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "suppliers: admin gestisce quelli delle residenze assegnate" ON suppliers;

CREATE POLICY "suppliers: admin gestisce quelli delle residenze assegnate"
  ON suppliers FOR ALL
  USING (
    public.czero_user_role() = 'admin'
    AND public.czero_can_access_residence(residence_id)
  )
  WITH CHECK (
    public.czero_user_role() = 'admin'
    AND public.czero_can_access_residence(residence_id)
  );

-- ============================================================
-- 2) AUTO-VERIFICA (ultima istruzione: il suo output va nel footer)
--    Atteso: 3 righe, tutte PERMISSIVE su public.suppliers —
--      "suppliers: admin gestisce quelli delle residenze assegnate" | ALL    | using + with_check valorizzati
--      "suppliers: lettura se si ha accesso alla residenza"         | SELECT | solo using
--      "suppliers: super_admin gestisce"                            | ALL    | solo using (invariata)
--    Il controllo che conta e' la TERZA riga identica a prima dell'apply e la
--    PRIMA con with_check NON NULL: e' la meta' che impedisce di creare o
--    spostare un fornitore su una residenza non seguita.
-- ============================================================
SELECT policyname,
       cmd,
       permissive,
       roles::text AS roles,
       qual        AS using_expr,
       with_check  AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'suppliers'
 ORDER BY policyname;

-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il __/__/2026) --
--
-- 1. Righe restituite dall'auto-verifica (atteso 3):
--
-- 2. Policy nuova presente, con with_check_expr NON NULL:
--
-- 3. "suppliers: super_admin gestisce" invariata rispetto a prima dell'apply:
--
-- 4. Prova funzionale lato app (account filippoloro02, ruolo admin):
--    creazione fornitore su una residenza seguita -> attesa: riuscita;
--    la stessa operazione era bloccata prima dell'apply.
--
-- CONCLUSIONE:
-- ============================================================

-- ============================================================
-- CasaZero — 033: seed voci catalogo P1-P16 + condition_key sulle
-- condizionali esistenti + raffinamento P17 (messa a terra).
-- ANTEPRIMA. Applica Filippo nel SQL Editor. SOLO dati su
-- maintenance_templates: nessuna RPC, nessun wizard, nessuna policy RLS,
-- nessun DERIVED_MAP, nessun backfill, nessuna UI.
-- ------------------------------------------------------------
-- CONCERN UNICO: portare a catalogo le 16 voci normative mancanti, tutte
-- SPENTE (is_active=false) e CONDIZIONATE (is_conditional=true +
-- condition_key). Nulla entra nei piani con questa migrazione: l'accensione
-- e la RPC condizionale sono cicli successivi.
--
-- Le voci restano invisibili finche' non vengono attivate: is_active=false
-- le esclude dalla composizione piano, e la RPC oggi non filtra ancora su
-- is_conditional (flag inerte). Quindi questo seed e' a impatto zero sulle
-- residenze esistenti, Residenza Cavaccio inclusa.
--
-- IDEMPOTENTE per costruzione: ogni riga entra solo se non esiste gia' un
-- template con lo stesso title (guardia NOT EXISTS). Rieseguire il file non
-- crea duplicati. Scelta deliberata dopo il caso 032, dove non era chiaro
-- se lo script avesse girato: qui rilanciare e' sempre sicuro.
-- ============================================================

-- ------------------------------------------------------------
-- CATEGORIE NUOVE INTRODOTTE QUI: Ascensore, Antincendio, Idrico, Accessi.
--
-- Perche' non riusare `Sicurezza` per l'antincendio (P5-P10): nel wizard
-- quella categoria e' etichettata "Sicurezza in copertura"
-- (src/app/(dashboard)/admin/residences/new/page.tsx:15) ed esiste per le
-- linee vita. La RPC 012 assegna la data di ultima esecuzione con
-- `p_category_dates->>mt.category` (012_create_residence_atomic.sql:54):
-- accorpare gli estintori a `Sicurezza` li legherebbe silenziosamente alla
-- data della sicurezza in copertura. Categoria separata, non cosmetica.
--
-- GAP NOTO E VOLUTO: le 4 categorie nuove non sono in WIZARD_CATEGORIES.
-- Il wizard non mostrera' un campo data per esse e la RPC fara' COALESCE su
-- p_delivery_date. Degrado, non errore. Va chiuso nel commit UI insieme
-- all'accensione delle voci: prima di allora nessuna e' attiva, quindi il
-- gap non e' raggiungibile.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 1) LE 16 VOCI NUOVE (P1-P16)
-- Tutte: scope=condominium, completion_mode=amministratore -> priority=N3
-- (coerente con modeToPriority: amministratore -> N3), is_active=false,
-- is_conditional=true. obligation_type: 'A' per P1-P10, 'B' per P11-P16.
-- sort_order 30-45, in coda ai 29 esistenti (max attuale 29).
--
-- Le sotto-scadenze stanno nel testo della voce, mai come voci separate
-- (P4 periodicita' per combustibile/potenza, P5 revisione e collaudo,
-- P6 prova di pressione, P8 caso DM 10/03/1998, P9 sorveglianza e verifica
-- generale, P14 uso intenso). Eccezione unica: l'ascensore e' P1 + P2,
-- perche' la legge impone un verificatore diverso dal manutentore.
-- ------------------------------------------------------------
INSERT INTO public.maintenance_templates
  (title, category, description, frequency_months, priority, scope,
   sort_order, completion_mode, obligation_type, is_active, is_conditional, condition_key)
SELECT v.title, v.category, v.description, v.frequency_months, v.priority::maintenance_priority,
       v.scope::maintenance_scope, v.sort_order, v.completion_mode::completion_mode,
       v.obligation_type::obligation_type, false, true, v.condition_key
FROM (VALUES

  -- P1 — DPR 162/1999 art. 15 c. 4
  ('Manutenzione ordinaria ascensore (dispositivi di sicurezza)', 'Ascensore',
   'Manutenzione semestrale dei dispositivi di sicurezza dell''impianto: funi, paracadute, freni, porte di piano. DPR 162/1999 art. 15 c. 4. Eseguita da ditta abilitata, con esiti annotati sul libretto di impianto.',
   6, 'N3', 'condominium', 30, 'amministratore', 'A', 'ascensore'),

  -- P2 — DPR 162/1999 art. 13. Voce separata da P1 per obbligo di legge.
  ('Verifica periodica biennale ascensore', 'Ascensore',
   'Verifica periodica eseguita da organismo notificato, ASL o ARPA. DPR 162/1999 art. 13. Il verificatore deve essere un soggetto DIVERSO dal manutentore: per questo e'' una voce distinta dalla manutenzione semestrale e non va accorpata. Produce il verbale di verifica periodica.',
   24, 'N3', 'condominium', 31, 'amministratore', 'A', 'ascensore'),

  -- P3 — DPR 74/2013 art. 7; D.Lgs. 192/2005. Voce NUOVA, non un
  -- raffinamento di fc529672 (climatizzazione/pompa di calore): quella e'
  -- unit/residente/B non condizionale, questa e' condominium/amministratore/A
  -- condizionata a centrale_termica. Assi diversi e maintenance_items
  -- esistenti gia' puntano a fc529672.
  ('Manutenzione caldaia / impianto termico', 'Termico',
   'Manutenzione del generatore e dell''impianto termico secondo le istruzioni del libretto del costruttore. DPR 74/2013 art. 7; D.Lgs. 192/2005. Aggiorna il libretto di impianto e produce il rapporto di manutenzione. Distinta dal controllo di efficienza energetica, che e'' una voce dedicata.',
   12, 'N3', 'condominium', 32, 'amministratore', 'A', 'centrale_termica'),

  -- P4 — DPR 74/2013 art. 8 All. A; DM 10/02/2014
  ('Controllo efficienza energetica caldaia (RCEE e bollino)', 'Termico',
   'Controllo di efficienza energetica con rilascio del RCEE e del bollino. DPR 74/2013 art. 8 All. A; DM 10/02/2014. Dovuto per impianti invernali oltre 10 kW ed estivi oltre 12 kW. La periodicita'' dipende da combustibile e potenza: 48 mesi per gas 10-100 kW, il caso tipico impostato qui; 24 mesi per liquido o solido 10-100 kW e per gas oltre 100 kW; 12 mesi per liquido o solido oltre 100 kW. Da registrare nel catasto regionale degli impianti.',
   48, 'N3', 'condominium', 33, 'amministratore', 'A', 'generatore_gas'),

  -- P5 — UNI 9994-1:2024; DM 10/03/1998; DM 01/09/2021
  ('Controllo periodico estintori', 'Antincendio',
   'Controllo semestrale da tecnico manutentore qualificato. UNI 9994-1:2024; DM 10/03/1998; DM 01/09/2021. Scadenze interne alla stessa voce: revisione a 60 mesi per polvere e CO2, 72 mesi per alogenati, 24-48-60 mesi per estintori a base acqua secondo tipologia; collaudo del serbatoio a 120 mesi. Aggiorna cartellino di manutenzione e registro antincendio.',
   6, 'N3', 'condominium', 34, 'amministratore', 'A', 'presidi_antincendio'),

  -- P6 — UNI 10779:2021; UNI EN 671-3
  ('Controllo rete idranti e naspi', 'Antincendio',
   'Controllo semestrale della rete di idranti e naspi da ditta specializzata. UNI 10779:2021; UNI EN 671-3. Tipicamente presente con autorimessa oltre 1.000 mq. Scadenza interna alla stessa voce: prova di pressione delle tubazioni ogni 60 mesi a 1,2 MPa. Esiti sul registro antincendio.',
   6, 'N3', 'condominium', 35, 'amministratore', 'A', 'rete_idranti'),

  -- P7 — DM 10/03/1998 art. 4; UNI 11473
  ('Controllo porte tagliafuoco REI e maniglioni antipanico', 'Antincendio',
   'Controllo semestrale delle porte tagliafuoco REI e dei maniglioni antipanico sulle vie di esodo, da tecnico qualificato. DM 10/03/1998 art. 4; UNI 11473. Esiti sul registro dei controlli.',
   6, 'N3', 'condominium', 36, 'amministratore', 'A', 'porte_rei'),

  -- P8 — UNI 11222; UNI EN 50172
  ('Verifica illuminazione di emergenza', 'Antincendio',
   'Verifica dell''impianto di illuminazione di sicurezza da manutentore qualificato. UNI 11222; UNI EN 50172. Periodicita'' 12 mesi, che scende a 6 mesi se l''attivita'' e'' soggetta al DM 10/03/1998. Esiti sul registro dei controlli periodici.',
   12, 'N3', 'condominium', 37, 'amministratore', 'A', 'illuminazione_emergenza'),

  -- P9 — UNI 11224; DM 10/03/1998
  ('Manutenzione impianto rivelazione incendi (IRAI)', 'Antincendio',
   'Manutenzione semestrale dell''impianto di rivelazione e allarme incendio da azienda specializzata. UNI 11224; DM 10/03/1998. Scadenze interne alla stessa voce: sorveglianza ogni 30 giorni, verifica generale a 12 anni. Registro antincendio e modelli A/B della UNI 11224.',
   6, 'N3', 'condominium', 38, 'amministratore', 'A', 'impianto_rivelazione_incendi'),

  -- P10 — UNI 9494-3; DM 10/03/1998
  ('Manutenzione evacuatori di fumo e calore (EFC)', 'Antincendio',
   'Manutenzione semestrale degli evacuatori di fumo e calore da ditta certificata. UNI 9494-3; DM 10/03/1998. Registro dei controlli e verbale di primo funzionamento.',
   6, 'N3', 'condominium', 39, 'amministratore', 'A', 'evacuatori_fumo'),

  -- P11 — D.Lgs. 18/2023; Linee guida legionella 2015
  ('Pulizia e sanificazione serbatoi e autoclave acqua potabile', 'Idrico',
   'Pulizia e sanificazione dei serbatoi di accumulo e dell''autoclave dell''acqua potabile, da ditta specializzata. D.Lgs. 18/2023; Linee guida legionella 2015. Periodicita'' annuale di prassi. Produce il rapporto di sanificazione.',
   12, 'N3', 'condominium', 40, 'amministratore', 'B', 'autoclave'),

  -- P12 — prassi tecnica. Tenuta distinta da P11: vedi nota in coda.
  ('Verifica funzionale autoclave', 'Idrico',
   'Verifica funzionale dell''autoclave: pressostato, membrana del vaso, pompa e tenute. Prassi tecnica, periodicita'' annuale. Distinta dalla sanificazione del serbatoio, che e'' un intervento sanitario con documento proprio. Produce il rapporto di manutenzione.',
   12, 'N3', 'condominium', 41, 'amministratore', 'B', 'autoclave'),

  -- P13 — Linee guida legionella 2015; D.Lgs. 18/2023
  ('Valutazione rischio legionella e campionamenti', 'Idrico',
   'Valutazione del rischio legionella (DVRL/PSA) e campionamenti, da tecnico qualificato o laboratorio. Linee guida legionella 2015; D.Lgs. 18/2023. Periodicita'' annuale di prassi. I verbali di campionamento vanno conservati 10 anni.',
   12, 'N3', 'condominium', 42, 'amministratore', 'B', 'acs_centralizzata'),

  -- P14 — Dir. 2006/42/CE (D.Lgs. 17/2010); UNI EN 12453 e 12635
  ('Manutenzione cancelli e portoni motorizzati', 'Accessi',
   'Manutenzione di cancelli e portoni motorizzati da tecnico qualificato, con verifica delle forze di impatto e dei dispositivi di sicurezza. Direttiva 2006/42/CE recepita dal D.Lgs. 17/2010; UNI EN 12453 e UNI EN 12635. Periodicita'' 12 mesi, che scende a 6 mesi in caso di uso intenso. Registro di manutenzione e fascicolo tecnico.',
   12, 'N3', 'condominium', 43, 'amministratore', 'B', 'cancello_motorizzato'),

  -- P15 — prassi tecnica
  ('Manutenzione impianto sollevamento acque reflue', 'Spurghi',
   'Manutenzione della stazione di sollevamento delle acque reflue da ditta specializzata: pompe, galleggianti, quadro elettrico. Prassi tecnica, periodicita'' annuale. Produce il rapporto di intervento.',
   12, 'N3', 'condominium', 44, 'amministratore', 'B', 'sollevamento_reflue'),

  -- P16 — UNI 10847:2017; UNI 10683
  ('Pulizia canne fumarie collettive', 'Termico',
   'Pulizia della canna fumaria collettiva da spazzacamino qualificato. UNI 10847:2017; UNI 10683. Si applica alle canne collettive a combustibile solido o liquido: il gas e'' escluso. Rapporto di pulizia ed eventuale videoispezione.',
   12, 'N3', 'condominium', 45, 'amministratore', 'B', 'canna_fumaria_collettiva')

) AS v(title, category, description, frequency_months, priority, scope,
       sort_order, completion_mode, obligation_type, condition_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_templates t WHERE t.title = v.title
);

-- ------------------------------------------------------------
-- 2) condition_key sulle 4 CONDIZIONALI GIA' ESISTENTI
-- Erano is_conditional=true con condition_key NULL fin dalla 030.
-- Nessun altro campo toccato: restano attive e invariate nei piani.
-- ------------------------------------------------------------
UPDATE public.maintenance_templates SET condition_key = 'lucernari'
  WHERE id = 'b95a07e2-062e-4714-91d1-3e5cc64131b7' AND condition_key IS DISTINCT FROM 'lucernari';

UPDATE public.maintenance_templates SET condition_key = 'antenna_centralizzata'
  WHERE id = '3fb467a8-157a-4c31-88f5-2d8dd61f7527' AND condition_key IS DISTINCT FROM 'antenna_centralizzata';

UPDATE public.maintenance_templates SET condition_key = 'fossa_biologica'
  WHERE id = '1e40bc1e-a521-4664-80c9-6496cf900348' AND condition_key IS DISTINCT FROM 'fossa_biologica';

UPDATE public.maintenance_templates SET condition_key = 'impianto_fotovoltaico'
  WHERE id = '7296f859-9ad6-45bb-8d1a-298f93a50146' AND condition_key IS DISTINCT FROM 'impianto_fotovoltaico';

-- ------------------------------------------------------------
-- 3) P17 — RAFFINAMENTO della voce esistente "Verifica messa a terra
-- condominiale" (4a74e428). NON una voce nuova.
-- DPR 462/2001; D.Lgs. 81/2008 art. 86. Frequenza gia' 60 mesi: invariata.
-- Titolo invariato: rinominarlo cambierebbe il testo mostrato nei piani
-- esistenti che gia' puntano a questo template, senza aggiungere nulla.
-- Cambia SOLO is_conditional + condition_key, come da istruzione.
-- ------------------------------------------------------------
UPDATE public.maintenance_templates
   SET is_conditional = true, condition_key = 'luogo_di_lavoro'
 WHERE id = '4a74e428-62dc-436f-813f-eb58ddfa9bfe'
   AND (is_conditional IS DISTINCT FROM true OR condition_key IS DISTINCT FROM 'luogo_di_lavoro');

-- P17, obligation_type 'B' -> 'A'. Eseguito a mano da Filippo il 2026-08-01,
-- codificato qui perche' il file resti riproducibile da solo.
-- MOTIVO (sua formulazione, agli atti): la condizionalita' governa SE la voce
-- compare, obligation_type governa CHE NATURA ha quando c'e'. P1/P2 sono 'A'
-- pur essendo condizionate all'ascensore; il DPR 462/2001 e' cogente quando il
-- condominio e' luogo di lavoro. Supera la segnalazione lasciata in appendice.
UPDATE public.maintenance_templates
   SET obligation_type = 'A'
 WHERE id = '4a74e428-62dc-436f-813f-eb58ddfa9bfe'
   AND obligation_type IS DISTINCT FROM 'A';

-- PostgREST: ricarica la schema-cache.
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- AUTO-VERIFICA IN CODA — SELECT, non DDL. Ultima istruzione dello script,
-- quindi il SQL Editor ne mostra il risultato: e' l'esito dell'apply, senza
-- query separate. Gira nella stessa transazione, quindi se questi numeri
-- sono giusti lo script sta per committare.
-- Attesi: 16 | 5 | 21 | 45   (voci nuove | condizionali aggiornate |
-- totale condizionali con chiave = 16 nuove + 4 preesistenti + P17 |
-- sort_order massimo)
-- Se non compare alcun risultato o i numeri non tornano, lo script e' stato
-- annullato: leggi il banner di errore dell'editor e riportane il testo.
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.maintenance_templates
    WHERE sort_order BETWEEN 30 AND 45 AND is_active = false AND is_conditional = true)
    AS voci_nuove_atteso_16,
  (SELECT count(*) FROM public.maintenance_templates
    WHERE id IN ('b95a07e2-062e-4714-91d1-3e5cc64131b7','3fb467a8-157a-4c31-88f5-2d8dd61f7527',
                 '1e40bc1e-a521-4664-80c9-6496cf900348','7296f859-9ad6-45bb-8d1a-298f93a50146',
                 '4a74e428-62dc-436f-813f-eb58ddfa9bfe')
      AND is_conditional = true AND condition_key IS NOT NULL)
    AS esistenti_aggiornate_atteso_5,
  (SELECT count(*) FROM public.maintenance_templates
    WHERE is_conditional = true AND condition_key IS NOT NULL)
    AS totale_condizionali_atteso_21,
  (SELECT max(sort_order) FROM public.maintenance_templates)
    AS sort_order_max_atteso_45;

-- ============================================================
-- VERIFICA POST-APPLY — elenco delle voci con UUID, per il commit
-- DERIVED_MAP. Eseguire dopo l'apply e incollare l'output nel footer.
-- ============================================================
-- SELECT id, title, category, condition_key, frequency_months,
--        obligation_type, completion_mode, scope, sort_order
-- FROM public.maintenance_templates
-- WHERE is_conditional = true
-- ORDER BY is_active DESC, sort_order;
--
-- Controllo che nessun piano sia stato toccato (atteso: identico a prima
-- del seed, nessun item con i template nuovi):
-- SELECT count(*) AS items_su_voci_nuove
-- FROM public.maintenance_items mi
-- JOIN public.maintenance_templates mt ON mt.id = mi.template_id
-- WHERE mt.sort_order BETWEEN 30 AND 45;   -- atteso: 0
-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il 2026-08-01) --
--
-- 0. AUTO-VERIFICA IN CODA (output verbatim):
--    voci_nuove=16 | esistenti_aggiornate=5 | totale_condizionali=21 | sort_order_max=45
--    templates_dopo_seed = 45
--    -> corrisponde agli attesi 16 | 5 | 21 | 45.
--
-- 1. Le 21 voci condizionali con UUID (per il commit DERIVED_MAP).
--    Formato: id | title | category | freq | obl | condition_key | is_active | is_conditional | sort_order
--
--    -- 5 preesistenti, ATTIVE --
--    b95a07e2-062e-4714-91d1-3e5cc64131b7 | Verifica lucernari                          | Coperture    | 12 | B | lucernari                    | true  | true | 4
--    3fb467a8-157a-4c31-88f5-2d8dd61f7527 | Controllo antenna TV/parabola               | Coperture    | 12 | B | antenna_centralizzata        | true  | true | 5
--    4a74e428-62dc-436f-813f-eb58ddfa9bfe | Verifica messa a terra condominiale         | Elettrico    | 60 | A | luogo_di_lavoro              | true  | true | 17
--    1e40bc1e-a521-4664-80c9-6496cf900348 | Fosse biologiche e condensa grassi: pulizia | Spurghi      |  6 | B | fossa_biologica              | true  | true | 26
--    7296f859-9ad6-45bb-8d1a-298f93a50146 | Manutenzione impianto fotovoltaico          | Fotovoltaico | 12 | B | impianto_fotovoltaico        | true  | true | 29
--
--    -- 16 nuove, SPENTE --
--    a47686ee-3f1d-4721-a3f6-6e4c282fdb0d | Manutenzione ordinaria ascensore (dispositivi di sicurezza) | Ascensore   |  6 | A | ascensore                    | false | true | 30
--    d582bfad-41c4-4823-9a40-26e6c3acbf92 | Verifica periodica biennale ascensore                       | Ascensore   | 24 | A | ascensore                    | false | true | 31
--    08d73253-7cd3-42bf-9676-52267bfeeb90 | Manutenzione caldaia / impianto termico                     | Termico     | 12 | A | centrale_termica             | false | true | 32
--    55ed1153-d229-4587-8959-d945a9cc344a | Controllo efficienza energetica caldaia (RCEE e bollino)    | Termico     | 48 | A | generatore_gas               | false | true | 33
--    fc20e159-4b1b-4a71-8d25-f1c70b16d9a0 | Controllo periodico estintori                               | Antincendio |  6 | A | presidi_antincendio          | false | true | 34
--    b25e9c86-9e90-47ee-afce-f89db3fe50c4 | Controllo rete idranti e naspi                              | Antincendio |  6 | A | rete_idranti                 | false | true | 35
--    18452296-fccb-491b-a27b-34fb0bd02214 | Controllo porte tagliafuoco REI e maniglioni antipanico     | Antincendio |  6 | A | porte_rei                    | false | true | 36
--    4390667e-4a6e-4d6d-8f54-f7e996b4513b | Verifica illuminazione di emergenza                         | Antincendio | 12 | A | illuminazione_emergenza      | false | true | 37
--    dbe47b50-413c-45e8-80e2-2aa65024fef0 | Manutenzione impianto rivelazione incendi (IRAI)            | Antincendio |  6 | A | impianto_rivelazione_incendi | false | true | 38
--    8b0ca75c-14c4-40fa-a846-121aa5b22ad9 | Manutenzione evacuatori di fumo e calore (EFC)              | Antincendio |  6 | A | evacuatori_fumo              | false | true | 39
--    ad4d4154-5eba-4e74-bdd3-8ce9c0d9f461 | Pulizia e sanificazione serbatoi e autoclave acqua potabile | Idrico      | 12 | B | autoclave                    | false | true | 40
--    b6525a25-e227-4c81-8942-3c7bca20d82f | Verifica funzionale autoclave                               | Idrico      | 12 | B | autoclave                    | false | true | 41
--    c65893f9-745a-4332-9148-15c77c280077 | Valutazione rischio legionella e campionamenti              | Idrico      | 12 | B | acs_centralizzata            | false | true | 42
--    7ed48ab6-d4e0-4fd9-bfdd-7777e92918b8 | Manutenzione cancelli e portoni motorizzati                 | Accessi     | 12 | B | cancello_motorizzato         | false | true | 43
--    b5a0b565-eb80-41f1-b9e3-412aa9283092 | Manutenzione impianto sollevamento acque reflue             | Spurghi     | 12 | B | sollevamento_reflue          | false | true | 44
--    9d6ed668-7c73-4943-a0a9-0c698afe7bda | Pulizia canne fumarie collettive                            | Termico     | 12 | B | canna_fumaria_collettiva     | false | true | 45
--
-- 2. items_su_voci_nuove = 0 (verificato live da Claude via query read-only il
--    2026-08-01: l'output incollato non conteneva questa query. Nessun piano
--    toccato dal seed, come atteso da is_active=false).
--
-- 3. P17 obligation_type = 'A' (verificato live: la riga 4a74e428 legge
--    A | luogo_di_lavoro). L'UPDATE manuale e' ora codificato nella sezione 3.
--
-- CONCLUSIONE: seed applicato per intero. 45 template totali, 21 condizionali
-- con chiave (16 nuovi spenti + 5 preesistenti aggiornati), sort_order max 45,
-- zero item creati. Impatto sui piani esistenti: nessuno.
-- ============================================================
--
-- ============================================================
-- APPENDICE — decisioni di merito prese qui, agli atti.
--
-- • e08ab7e6 "Registrazione manutenzione su libretto impianto" (disattivato):
--   NON riattivato. Il libretto e' un DOCUMENTO, appartiene alla checklist
--   di consegna (B4), non e' una manutenzione periodica. Compare in
--   checklist tramite DERIVED_MAP di P3.
--
-- • 9986aef6 "Pressione vasi di espansione" e e56d9543 "Pompa di
--   circolazione impianto a pavimento" (disattivati): NON riattivati e non
--   accorpati. Sono sotto-componenti unit/residente dell'impianto della
--   singola unita', mentre P3 e' la centrale termica condominiale. Non
--   coincidono: nessuna delle due e' l'equivalente spento di P3.
--
-- • 362d2d92 "Carica refrigerante climatizzazione" (disattivato): nessuna
--   relazione con P1-P17, afferisce a fc529672. Lasciato com'e'.
--
-- • P11 e P12 condividono condition_key='autoclave', frequenza, scope,
--   modalita' e tipo. Tenute SEPARATE: sono due attivita' diverse
--   (sanificazione sanitaria vs verifica meccanica), con esecutori diversi
--   nella prassi e documenti diversi nel fascicolo. Accorparle seppellirebbe
--   l'adempimento legionella dentro una manutenzione meccanica, e il
--   documento prodotto (rapporto di sanificazione) e' proprio cio' che ne
--   prova l'assolvimento. Entrambe nascono spente: se preferisci una voce
--   sola, e' un UPDATE banale prima dell'accensione.
--
-- • 4a74e428 (P17) aveva obligation_type='B'. RISOLTO: portato ad 'A' con
--   l'UPDATE nella sezione 3. Principio fissato da Filippo il 2026-08-01, da
--   applicare a ogni voce futura: la CONDIZIONALITA' governa SE la voce
--   compare, obligation_type governa CHE NATURA ha quando c'e'. Le due cose
--   sono indipendenti — P1/P2 sono 'A' pur essendo condizionate all'ascensore.
--   Non declassare una voce a 'B' solo perche' e' condizionata.
--
-- • DEBITO APERTO — WIZARD_CATEGORIES. Le 4 categorie nuove (Ascensore,
--   Antincendio, Idrico, Accessi) non sono in WIZARD_CATEGORIES
--   (src/app/(dashboard)/admin/residences/new/page.tsx:8). Il wizard non
--   mostra un campo data per esse e la RPC fa COALESCE su p_delivery_date:
--   le voci nuove non riceveranno mai una data di ultima esecuzione
--   personalizzata. PREREQUISITO del commit wizard, da fare prima di
--   accendere queste voci. Non raggiungibile finche' restano is_active=false.
-- ============================================================

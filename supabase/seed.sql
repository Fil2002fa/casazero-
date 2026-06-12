-- ============================================================
-- CasaZero — Seed: 27 manutenzioni template (Appendice A)
-- Applica DOPO 001_schema.sql
-- ============================================================

INSERT INTO maintenance_templates
  (title, category, frequency_months, priority, scope, sort_order)
VALUES
  -- Coperture e tetto
  ('Pulizia grondaie e canali di gronda',           'Coperture',    24, 'N3', 'condominium',  1),
  ('Controllo canali di gronda',                     'Coperture',    24, 'N3', 'condominium',  2),
  ('Controllo manto di copertura (giugno)',           'Coperture',    12, 'N3', 'condominium',  3),
  ('Verifica lucernari',                             'Coperture',    12, 'N3', 'condominium',  4),
  ('Controllo antenna TV/parabola',                  'Coperture',    12, 'N3', 'condominium',  5),

  -- Ventilazione / aerazione
  ('Condotti evacuazione vapori di cottura',         'Ventilazione', 12, 'N2', 'unit',         6),
  ('Condotti aerazione bagni ciechi',                'Ventilazione', 12, 'N2', 'unit',         7),
  ('VMC: sostituzione filtri',                       'Ventilazione', 12, 'N2', 'unit',         8),
  ('VMC: pulizia condotti',                          'Ventilazione',  8, 'N2', 'unit',         9),

  -- Termico e clima
  ('Carica refrigerante climatizzazione',            'Termico',      12, 'N2', 'unit',        10),
  ('Pulizia filtri unità interne A/C',               'Termico',      12, 'N2', 'unit',        11),
  ('Pressione vasi di espansione',                   'Termico',      12, 'N2', 'unit',        12),
  ('Pompa di circolazione impianto a pavimento',     'Termico',      12, 'N2', 'unit',        13),
  ('Registrazione manutenzione su libretto impianto','Termico',      12, 'N2', 'unit',        14),

  -- Elettrico
  ('Test differenziale impianto elettrico',          'Elettrico',     1, 'N2', 'unit',        15),
  ('Controllo visivo prese e comandi',               'Elettrico',     1, 'N1', 'unit',        16),
  ('Verifica messa a terra condominiale',            'Elettrico',    36, 'N3', 'condominium', 17),

  -- Fotovoltaico
  ('Test differenziale generale FV',                 'Fotovoltaico',  1, 'N2', 'unit',        18),
  ('Controllo inverter e quadri FV',                 'Fotovoltaico',  1, 'N1', 'unit',        19),
  ('Integrità moduli FV + pulizia',                  'Fotovoltaico', 12, 'N3', 'condominium', 20),

  -- Finiture e serramenti
  ('Imbiancatura interni (pittura semi-lavabile)',   'Finiture',     36, 'N1', 'unit',        21),
  ('Pulizia muri esterni',                           'Finiture',     24, 'N1', 'condominium', 22),
  ('Trattamento idrorepellente muri esterni',        'Finiture',     60, 'N1', 'condominium', 23),
  ('Controllo serramenti',                           'Finiture',      6, 'N2', 'unit',        24),

  -- Sicurezza in copertura
  ('Verifica linee vita',                            'Sicurezza',    12, 'N3', 'condominium', 25),

  -- Scarichi e spurghi
  ('Fosse biologiche e condensa grassi: pulizia',   'Spurghi',       6, 'N3', 'condominium', 26),
  ('Pozzetti di ispezione e condotte: pulizia',      'Spurghi',       3, 'N3', 'condominium', 27);

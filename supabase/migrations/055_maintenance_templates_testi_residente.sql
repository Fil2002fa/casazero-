alter table public.maintenance_templates
  add column if not exists why_it_matters text,
  add column if not exists who_does_it text,
  add column if not exists what_to_keep text,
  add column if not exists how_to jsonb,
  add column if not exists technical_notes text;

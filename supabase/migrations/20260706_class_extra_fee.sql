-- ============================================================
-- Ajout d'une somme fixe à payer par classe (extra_fee)
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query
-- ============================================================

alter table public.classes
  add column if not exists extra_fee numeric(12,2) not null default 0;

comment on column public.classes.extra_fee is
  'Somme fixe supplémentaire à payer par élève de la classe (dette), modifiable par l''utilisateur.';

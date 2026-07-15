-- ============================================================
-- Correctif multi-établissement : l'année scolaire est unique PAR ÉCOLE
-- ------------------------------------------------------------
-- La migration multi-établissement a bien corrigé subjects (unicité par
-- école) mais a oublié academic_years : le libellé "2026-2027" restait
-- unique GLOBALEMENT. Résultat : impossible de créer une 2e école
-- (violation de "academic_years_label_key").
-- Ce script aligne academic_years sur le même modèle que subjects.
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query.
-- ============================================================

alter table public.academic_years
  drop constraint if exists academic_years_label_key;

alter table public.academic_years
  add constraint academic_years_school_label_key unique (school_id, label);

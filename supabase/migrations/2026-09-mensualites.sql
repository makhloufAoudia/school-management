-- ============================================================
-- MENSUALITÉS — le parent lit l'année scolaire de son école
-- ------------------------------------------------------------
-- Le calcul des mensualités (lib/dues.ts) part du début de l'année
-- scolaire. Jusqu'ici seul l'admin et l'enseignant pouvaient lire
-- academic_years : le parent retombait sur « septembre -> juin ».
-- Avec cette règle, parent et admin voient exactement les mêmes mois.
--
-- Rien d'autre ne change : les paiements, les montants figés
-- (monthly_dues) et leurs règles de sécurité existent déjà.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ============================================================

drop policy if exists "parent read years" on public.academic_years;
create policy "parent read years" on public.academic_years
  for select
  using (current_role_is('parent') and school_id = current_school_id());

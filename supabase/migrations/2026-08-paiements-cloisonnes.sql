-- ============================================================
-- CHACUN NE VOIT QUE SES PROPRES PAIEMENTS
-- ------------------------------------------------------------
-- Avant : un enseignant pouvait lire, en base, les échéances
-- mensuelles (monthly_dues) et les dûs de classe (class_dues) de
-- TOUTE l'école — donc la situation financière de chaque famille.
-- Aucun écran ne les affichait, mais l'accès existait.
--
-- Après :
--   * enseignant  -> uniquement SES salaires (salary_payments) ;
--   * parent      -> uniquement les paiements et les dûs de SES enfants ;
--   * administration -> tout, dans son école.
--
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ============================================================

-- ---------- 1. L'enseignant ne lit plus les dûs des élèves ----------
drop policy if exists "teacher read dues" on public.class_dues;
drop policy if exists "teacher read dues" on public.monthly_dues;
drop policy if exists "teacher read fee history" on public.class_fee_history;

-- ---------- 2. L'enseignant garde ses propres salaires ----------
-- (rappel de la règle existante, réécrite ici pour être sûr qu'elle est
--  bien en place et limitée à son école)
drop policy if exists "teacher own salaries" on public.salary_payments;
create policy "teacher own salaries" on public.salary_payments
  for select
  using (
    school_id = current_school_id()
    and exists (
      select 1 from teachers t
      where t.id = salary_payments.teacher_id
        and t.profile_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Vérification, connecté avec un compte enseignant :
--
--   select count(*) from public.monthly_dues;   -- 0
--   select count(*) from public.class_dues;     -- 0
--   select count(*) from public.payments;       -- 0
--   select * from public.salary_payments;       -- uniquement les siens
-- ------------------------------------------------------------

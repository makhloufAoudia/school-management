-- ============================================================
--  À COLLER EN UNE SEULE FOIS DANS SUPABASE > SQL EDITOR
--  ------------------------------------------------------------
--  Regroupe les deux mises à jour :
--    1. l'enseignant ne voit que SA classe et SES élèves ;
--    2. chacun ne voit que SES propres paiements.
--
--  Sans danger : aucune donnée n'est modifiée ni supprimée,
--  seules les règles d'accès (RLS) changent. Peut être relancé
--  plusieurs fois sans effet de bord.
-- ============================================================

-- ============================================================
-- L'ENSEIGNANT NE VOIT QUE SA CLASSE ET SES ÉLÈVES
-- ------------------------------------------------------------
-- Avant : un enseignant voyait la liste de TOUTES les classes de
-- l'école (menu déroulant « Classe » des pages Élèves et Cours).
-- Après : il ne voit que les classes auxquelles il est rattaché,
-- c'est-à-dire (fonction public.teaches_class) :
--     * les classes où il donne un cours ;
--     * les classes dont il est professeur principal.
--
-- Les autres enseignants restaient déjà invisibles pour lui
-- (policy « teacher own record » sur la table teachers) : cette
-- migration ne fait que fermer la dernière porte, celle des classes.
--
-- Ses élèves : inchangé — ce sont ceux de ses classes, via les
-- policies « teacher students of own courses » et
-- « head teacher reads own class students ».
--
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- Prérequis : 2026-08-prof-principal.sql (fonction teaches_class).
-- ============================================================

drop policy if exists "teacher read classes" on public.classes;
create policy "teacher read classes" on public.classes
  for select
  using (
    current_role_is('teacher')
    and school_id = current_school_id()
    and public.teaches_class(classes.id)
  );

-- ------------------------------------------------------------
-- Vérification, connecté avec un compte enseignant :
--
--   select id, name from public.classes order by name;
--     -> uniquement ses classes
--   select id, first_name, last_name from public.teachers;
--     -> uniquement sa propre fiche
--   select count(*) from public.students;
--     -> uniquement les élèves de ses classes
-- ------------------------------------------------------------

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


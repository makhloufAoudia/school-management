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

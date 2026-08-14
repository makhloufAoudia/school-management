-- ============================================================
-- L'ENSEIGNANT CRÉE SES PROPRES COURS
-- ------------------------------------------------------------
-- Jusqu'ici seul l'administrateur pouvait créer un cours ; l'enseignant
-- devait passer par une demande d'emploi du temps. Il peut désormais
-- créer un cours directement, mais uniquement :
--   * dans une classe où il est rattaché (prof principal, ou il y donne
--     déjà un cours) — voir public.teaches_class ;
--   * en se désignant lui-même comme enseignant du cours.
--
-- La modification et la suppression d'un cours restent réservées à
-- l'administration (l'enseignant passe par une demande).
--
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- Prérequis : 2026-08-droits-enseignant.sql et 2026-08-prof-principal.sql.
-- ============================================================

-- ---------- Fiche enseignant du compte connecté ----------
-- SECURITY DEFINER : utilisable dans une policy sans rejouer la RLS de
-- la table teachers.
create or replace function public.my_teacher_id()
returns uuid
language sql security definer set search_path = public stable
as $$
  select id from teachers where profile_id = auth.uid() limit 1;
$$;

-- ---------- Création d'un cours par l'enseignant ----------
-- school_id est rempli par le trigger set_school_id_courses avant que ce
-- with check ne soit évalué : inutile de l'envoyer depuis l'application.
drop policy if exists "teacher insert own course" on public.courses;
create policy "teacher insert own course" on public.courses
  for insert
  with check (
    current_role_is('teacher')
    and school_id = current_school_id()
    and class_id is not null
    and public.teaches_class(class_id)
    and teacher_id = public.my_teacher_id()
  );

-- Vérification, connecté en tant qu'enseignant :
--   select public.my_teacher_id();
--   select id, name, public.teaches_class(id) from public.classes order by name;

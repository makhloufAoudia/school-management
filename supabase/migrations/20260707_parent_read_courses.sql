-- Permet au parent de lire les cours de la/les classe(s) de ses enfants.
-- Sans cette policy, la table `courses` (RLS activé) ne renvoie rien au parent.
--
-- IMPORTANT : la vérification passe par une fonction SECURITY DEFINER.
-- Une sous-requête directe sur `students` provoquerait une récursion infinie,
-- car `students` a déjà une policy qui interroge `courses`
-- (students -> courses -> students -> ...).
-- La fonction SECURITY DEFINER s'exécute avec les droits du propriétaire et
-- ignore le RLS de `students`, ce qui casse la boucle.

create or replace function public.is_guardian_of_class(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from students s
    where s.class_id = cid
      and s.guardian_id = auth.uid()
  );
$$;

drop policy if exists "parent read courses" on courses;

create policy "parent read courses" on courses for select
  using (public.is_guardian_of_class(class_id));

-- ============================================================
-- PROFESSEUR PRINCIPAL D'UNE CLASSE
-- ------------------------------------------------------------
-- Ajoute l'enseignant responsable de la classe, choisi au moment de
-- créer ou modifier la classe. Il obtient sur SES classes les mêmes
-- droits qu'un enseignant qui y donne un cours : voir les élèves, en
-- ajouter et les corriger (jamais les supprimer).
--
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- Prérequis : 2026-08-droits-enseignant.sql déjà appliqué.
-- ============================================================

alter table public.classes
  add column if not exists head_teacher_id uuid references teachers(id) on delete set null;

create index if not exists classes_head_teacher_idx
  on public.classes (head_teacher_id)
  where head_teacher_id is not null;

-- ---------- L'enseignant est-il rattaché à cette classe ? ----------
-- Soit il y donne un cours, soit il en est le professeur principal.
create or replace function public.teaches_class(cid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from courses c
    join teachers t on t.id = c.teacher_id
    where c.class_id = cid and t.profile_id = auth.uid()
  )
  or exists (
    select 1
    from classes cl
    join teachers t on t.id = cl.head_teacher_id
    where cl.id = cid and t.profile_id = auth.uid()
  );
$$;

-- ---------- Le professeur principal voit les élèves de sa classe ----------
-- Policy supplémentaire : les règles RLS s'additionnent, celle des cours
-- existante reste valable.
drop policy if exists "head teacher reads own class students" on public.students;
create policy "head teacher reads own class students" on public.students
  for select
  using (
    school_id = current_school_id()
    and class_id is not null
    and public.teaches_class(class_id)
  );

-- Vérification :
--   select name, head_teacher_id from public.classes;

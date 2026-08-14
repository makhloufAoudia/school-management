-- ============================================================
-- DROITS DE L'ENSEIGNANT + DEMANDES D'EMPLOI DU TEMPS
-- ------------------------------------------------------------
-- 1. L'enseignant gère les élèves des classes où il a un cours :
--    il peut en ajouter et les modifier, mais PAS les supprimer.
-- 2. Il gère librement ses supports de cours (déjà en place).
-- 3. Il ne modifie pas l'emploi du temps : il dépose une demande,
--    que l'administration accepte ou refuse.
--
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- Prérequis : schema.sql + 2026-07-multitenant.sql appliqués.
-- ============================================================

-- ---------- 1. L'enseignant enseigne-t-il dans cette classe ? ----------
-- SECURITY DEFINER : évite la récursion RLS students <-> courses.
create or replace function public.teaches_class(cid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from courses c
    join teachers t on t.id = c.teacher_id
    where c.class_id = cid and t.profile_id = auth.uid()
  );
$$;

-- ---------- 2. Élèves : ajout et modification par l'enseignant ----------
-- La suppression reste réservée à l'administration : aucune policy DELETE.
drop policy if exists "teacher insert students" on public.students;
create policy "teacher insert students" on public.students
  for insert
  with check (
    current_role_is('teacher')
    and school_id = current_school_id()
    and class_id is not null
    and public.teaches_class(class_id)
  );

drop policy if exists "teacher update students" on public.students;
create policy "teacher update students" on public.students
  for update
  using (
    current_role_is('teacher')
    and school_id = current_school_id()
    and class_id is not null
    and public.teaches_class(class_id)
  )
  with check (
    current_role_is('teacher')
    and school_id = current_school_id()
    and class_id is not null
    and public.teaches_class(class_id)
  );

-- ---------- 3. Demandes de modification de l'emploi du temps ----------
create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  -- Cours visé. NULL quand l'enseignant propose un nouveau cours.
  course_id uuid references courses(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete cascade,
  kind text not null default 'update' check (kind in ('create', 'update', 'delete')),
  -- Valeurs souhaitées (NULL = inchangé)
  class_id uuid references classes(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  day_of_week int check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  room text,
  note text,                                   -- motif de l'enseignant
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  admin_note text,                             -- réponse de l'administration
  created_at timestamptz not null default now()
);

create index if not exists schedule_requests_pending_idx
  on public.schedule_requests (school_id, created_at desc)
  where status = 'pending';

-- school_id rempli automatiquement à l'insertion (même trigger que les
-- autres tables métier).
drop trigger if exists set_school_id_schedule_requests on public.schedule_requests;
create trigger set_school_id_schedule_requests
  before insert on public.schedule_requests
  for each row execute function public.set_school_id();

alter table public.schedule_requests enable row level security;

-- L'administration voit et décide, dans son école uniquement.
drop policy if exists "admin all" on public.schedule_requests;
create policy "admin all" on public.schedule_requests
  for all
  using (current_role_is('admin') and school_id = current_school_id())
  with check (current_role_is('admin') and school_id = current_school_id());

-- L'enseignant dépose ses propres demandes...
drop policy if exists "teacher insert own request" on public.schedule_requests;
create policy "teacher insert own request" on public.schedule_requests
  for insert
  with check (
    current_role_is('teacher')
    and requested_by = auth.uid()
    and school_id = current_school_id()
    and status = 'pending'
  );

-- ...et suit leur avancement, sans pouvoir les modifier après coup.
drop policy if exists "teacher read own requests" on public.schedule_requests;
create policy "teacher read own requests" on public.schedule_requests
  for select
  using (requested_by = auth.uid());

-- Vérification :
--   select status, count(*) from public.schedule_requests group by status;

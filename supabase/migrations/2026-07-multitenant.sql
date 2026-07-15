-- ============================================================
-- Migration MULTI-ÉCOLES (multi-tenant "pooled")
-- Objectif : héberger plusieurs écoles autonomes dans une seule base,
-- chaque école ne voyant QUE ses données (isolation par RLS + school_id).
--
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query.
-- ⚠️ FAIRE UNE SAUVEGARDE AVANT. Idempotent autant que possible.
-- Prérequis : schema.sql + 2026-07-fees.sql déjà appliqués.
-- ============================================================

-- ---------- 1. Table des écoles ----------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,               -- identifiant court (sous-domaine éventuel)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schools enable row level security;

-- ---------- 2. Colonne school_id sur chaque table métier ----------
-- (nullable pour l'instant : on remplira via le backfill à l'étape 4)
alter table public.profiles          add column if not exists school_id uuid references schools(id) on delete set null;
alter table public.academic_years    add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.classes           add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.teachers          add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.students          add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.subjects          add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.courses           add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.attendance        add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.grades            add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.course_materials  add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.payments          add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.salary_payments   add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.expenses          add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.class_dues        add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.monthly_dues      add column if not exists school_id uuid references schools(id) on delete cascade;
alter table public.class_fee_history add column if not exists school_id uuid references schools(id) on delete cascade;

-- ---------- 3. Helper : école de l'utilisateur courant ----------
-- SECURITY DEFINER + stable : évite la récursion RLS et se met en cache par requête.
create or replace function public.current_school_id()
returns uuid
language sql security definer set search_path = public stable
as $$
  select school_id from profiles where id = auth.uid();
$$;

-- ---------- 4. Backfill : rattacher tout l'existant à une école par défaut ----------
do $$
declare
  sid uuid;
begin
  -- Réutilise l'école par défaut si le script est rejoué.
  select id into sid from schools where slug = 'principale';
  if sid is null then
    insert into schools (name, slug) values ('École principale', 'principale')
    returning id into sid;
  end if;

  update profiles          set school_id = sid where school_id is null;
  update academic_years    set school_id = sid where school_id is null;
  update classes           set school_id = sid where school_id is null;
  update teachers          set school_id = sid where school_id is null;
  update students          set school_id = sid where school_id is null;
  update subjects          set school_id = sid where school_id is null;
  update courses           set school_id = sid where school_id is null;
  update attendance        set school_id = sid where school_id is null;
  update grades            set school_id = sid where school_id is null;
  update course_materials  set school_id = sid where school_id is null;
  update payments          set school_id = sid where school_id is null;
  update salary_payments   set school_id = sid where school_id is null;
  update expenses          set school_id = sid where school_id is null;
  update class_dues        set school_id = sid where school_id is null;
  update monthly_dues      set school_id = sid where school_id is null;
  update class_fee_history set school_id = sid where school_id is null;
end $$;

-- ---------- 5. school_id devient obligatoire sur les tables métier ----------
-- (profiles reste nullable : un futur "super-admin plateforme" peut n'appartenir
--  à aucune école.)
alter table public.academic_years    alter column school_id set not null;
alter table public.classes           alter column school_id set not null;
alter table public.teachers          alter column school_id set not null;
alter table public.students          alter column school_id set not null;
alter table public.subjects          alter column school_id set not null;
alter table public.courses           alter column school_id set not null;
alter table public.attendance        alter column school_id set not null;
alter table public.grades            alter column school_id set not null;
alter table public.course_materials  alter column school_id set not null;
alter table public.payments          alter column school_id set not null;
alter table public.salary_payments   alter column school_id set not null;
alter table public.expenses          alter column school_id set not null;
alter table public.class_dues        alter column school_id set not null;
alter table public.monthly_dues      alter column school_id set not null;
alter table public.class_fee_history alter column school_id set not null;

-- ---------- 6. Remplissage automatique de school_id à l'insertion ----------
-- Le code applicatif n'a donc PAS besoin d'envoyer school_id : il est déduit
-- du compte connecté. (Un service_role peut toujours forcer une valeur explicite.)
create or replace function public.set_school_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.school_id is null then
    new.school_id := current_school_id();
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
  tables text[] := array[
    'academic_years','classes','teachers','students','subjects','courses',
    'attendance','grades','course_materials','payments','salary_payments',
    'expenses','class_dues','monthly_dues','class_fee_history'
  ];
begin
  foreach tbl in array tables loop
    execute format('drop trigger if exists set_school_id_%1$s on public.%1$s;', tbl);
    execute format(
      'create trigger set_school_id_%1$s before insert on public.%1$s
         for each row execute function public.set_school_id();', tbl);
  end loop;
end $$;

-- ---------- 7. Inscription : rattacher le profil à son école ----------
-- L'école est passée dans les métadonnées à la création du compte
-- (raw_user_meta_data->>'school_id').
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, school_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'parent'),
    nullif(new.raw_user_meta_data->>'school_id','')::uuid
  );
  return new;
end;
$$;

-- ---------- 8. Matières : unicité par école (et non plus globale) ----------
alter table public.subjects drop constraint if exists subjects_name_key;
alter table public.subjects
  add constraint subjects_school_name_key unique (school_id, name);

-- ============================================================
-- 9. RLS : chaque policy filtre désormais par école
-- ============================================================

-- ---------- Table schools ----------
drop policy if exists "read own school" on public.schools;
create policy "read own school" on public.schools for select
  using (id = current_school_id());

drop policy if exists "admin update own school" on public.schools;
create policy "admin update own school" on public.schools for update
  using (current_role_is('admin') and id = current_school_id())
  with check (current_role_is('admin') and id = current_school_id());

-- ---------- "admin all" : accès total MAIS borné à l'école de l'admin ----------
do $$
declare
  tbl text;
  tables text[] := array[
    'academic_years','classes','teachers','students','subjects','courses',
    'attendance','grades','course_materials','payments','salary_payments',
    'expenses','class_dues','monthly_dues','class_fee_history'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'alter policy "admin all" on public.%1$s
         using (current_role_is(''admin'') and school_id = current_school_id())
         with check (current_role_is(''admin'') and school_id = current_school_id());',
      tbl);
  end loop;
end $$;

-- ---------- Profils ----------
-- ("own profile" et "update own profile" restent scindés par id = auth.uid())
alter policy "admin all profiles" on public.profiles
  using (current_role_is('admin') and school_id = current_school_id())
  with check (current_role_is('admin') and school_id = current_school_id());

-- ---------- Enseignants (lecture des référentiels) ----------
alter policy "teacher read years" on public.academic_years
  using (current_role_is('teacher') and school_id = current_school_id());

alter policy "teacher read classes" on public.classes
  using (current_role_is('teacher') and school_id = current_school_id());

alter policy "parent read classes" on public.classes
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.class_id = classes.id and s.guardian_id = auth.uid())
  );

alter policy "teacher read subjects" on public.subjects
  using (current_role_is('teacher') and school_id = current_school_id());

alter policy "teacher own record" on public.teachers
  using (profile_id = auth.uid() and school_id = current_school_id());

-- ---------- Élèves ----------
alter policy "teacher students of own courses" on public.students
  using (
    school_id = current_school_id()
    and exists (
      select 1 from courses c
      join teachers t on t.id = c.teacher_id
      where c.class_id = students.class_id and t.profile_id = auth.uid()
    )
  );

alter policy "parent own children" on public.students
  using (guardian_id = auth.uid() and school_id = current_school_id());

-- ---------- Cours ----------
alter policy "teacher own courses" on public.courses
  using (
    school_id = current_school_id()
    and exists (select 1 from teachers t where t.id = courses.teacher_id and t.profile_id = auth.uid())
  );

alter policy "parent read courses" on public.courses
  using (school_id = current_school_id() and public.is_guardian_of_class(class_id));

-- ---------- Présences ----------
alter policy "teacher attendance" on public.attendance
  using (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = attendance.course_id and t.profile_id = auth.uid()
    )
  )
  with check (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = attendance.course_id and t.profile_id = auth.uid()
    )
  );

alter policy "parent children attendance" on public.attendance
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.id = attendance.student_id and s.guardian_id = auth.uid())
  );

-- ---------- Notes ----------
alter policy "teacher grades" on public.grades
  using (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = grades.course_id and t.profile_id = auth.uid()
    )
  )
  with check (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = grades.course_id and t.profile_id = auth.uid()
    )
  );

alter policy "parent children grades" on public.grades
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.id = grades.student_id and s.guardian_id = auth.uid())
  );

-- ---------- Supports de cours ----------
alter policy "teacher own course materials" on public.course_materials
  using (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = course_materials.course_id and t.profile_id = auth.uid()
    )
  )
  with check (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join teachers t on t.id = c.teacher_id
      where c.id = course_materials.course_id and t.profile_id = auth.uid()
    )
  );

alter policy "parent read class materials" on public.course_materials
  using (
    school_id = current_school_id()
    and exists (
      select 1 from courses c join students s on s.class_id = c.class_id
      where c.id = course_materials.course_id and s.guardian_id = auth.uid()
    )
  );

-- ---------- Paiements ----------
alter policy "parent children payments" on public.payments
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.id = payments.student_id and s.guardian_id = auth.uid())
  );

-- ---------- Salaires ----------
alter policy "teacher own salaries" on public.salary_payments
  using (
    school_id = current_school_id()
    and exists (select 1 from teachers t where t.id = salary_payments.teacher_id and t.profile_id = auth.uid())
  );

-- ---------- Dûs de classe ----------
alter policy "teacher read dues" on public.class_dues
  using (current_role_is('teacher') and school_id = current_school_id());

alter policy "parent read class dues" on public.class_dues
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.class_id = class_dues.class_id and s.guardian_id = auth.uid())
  );

-- ---------- Échéances mensuelles ----------
alter policy "teacher read dues" on public.monthly_dues
  using (current_role_is('teacher') and school_id = current_school_id());

alter policy "parent read own dues" on public.monthly_dues
  using (
    school_id = current_school_id()
    and exists (select 1 from students s where s.id = monthly_dues.student_id and s.guardian_id = auth.uid())
  );

-- ---------- Historique des tarifs ----------
alter policy "teacher read fee history" on public.class_fee_history
  using (current_role_is('teacher') and school_id = current_school_id());

-- ============================================================
-- FIN. Prochaine étape (Phase 2) : provisioning d'une école + 1er admin,
-- via service_role (voir provision-school.sql).
-- ============================================================

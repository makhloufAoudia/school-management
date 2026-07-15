-- ============================================================
-- Schéma de gestion d'école privée
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- Types ----------
create type user_role as enum ('admin', 'teacher', 'parent');
create type student_status as enum ('active', 'suspended', 'left');
create type payment_method as enum ('cash', 'check', 'transfer', 'card');
create type payment_type as enum ('tuition', 'registration', 'transport', 'canteen', 'other');
create type attendance_status as enum ('present', 'absent', 'late', 'excused');

-- ---------- Profils (liés à auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role user_role not null default 'parent',
  created_at timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'parent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper : rôle de l'utilisateur courant (évite la récursion RLS)
create or replace function public.current_role_is(r user_role)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = r);
$$;

-- ---------- Année scolaire ----------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,          -- ex: "2026-2027"
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  sort_order int not null default 0
);

-- ---------- Classes ----------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  name text not null,                  -- ex: "3AM A"
  level text not null,                 -- ex: "3ème année moyenne"
  capacity int not null default 30,
  monthly_fee numeric(12,2) not null default 0,
  extra_fee numeric(12,2) not null default 0,   -- somme fixe à payer par élève de la classe
  created_at timestamptz not null default now()
);

-- ---------- Enseignants ----------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  specialty text,                      -- matière principale
  base_salary numeric(12,2) not null default 0,
  hire_date date default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Élèves ----------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete set null,
  guardian_id uuid references profiles(id) on delete set null,  -- parent
  first_name text not null,
  last_name text not null,
  birth_date date,
  gender text check (gender in ('M', 'F')),
  enrollment_date date not null default current_date,
  status student_status not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Matières & Cours ----------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid references teachers(id) on delete set null,
  day_of_week int check (day_of_week between 0 and 6),  -- 0 = dimanche
  start_time time,
  end_time time,
  room text
);

-- ---------- Présences & Notes ----------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  date date not null default current_date,
  status attendance_status not null default 'present',
  unique (student_id, course_id, date)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  term text not null,                  -- ex: "T1", "T2", "T3"
  label text not null,                 -- ex: "Devoir 1", "Examen"
  score numeric(5,2) not null,
  max_score numeric(5,2) not null default 20,
  created_at timestamptz not null default now()
);

-- ---------- Supports de cours (PDF sur Google Drive) ----------
create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  drive_file_id text not null,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Paiements élèves ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  amount numeric(12,2) not null,
  type payment_type not null default 'tuition',
  method payment_method not null default 'cash',
  period text,                         -- ex: "2026-09" pour septembre
  paid_at date not null default current_date,
  recorded_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Dûs de classe (sommes appliquées à toute une classe) ----------
create table public.class_dues (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  label text not null,                 -- ex: "Assurance", "Sortie scolaire"
  amount numeric(12,2) not null,
  period text not null,                -- ex: "2026-09"
  created_at timestamptz not null default now()
);

alter table class_dues enable row level security;
create policy "admin all" on class_dues for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "teacher read dues" on class_dues for select using (current_role_is('teacher'));
create policy "parent read class dues" on class_dues for select
  using (exists (select 1 from students s where s.class_id = class_dues.class_id and s.guardian_id = auth.uid()));

-- ---------- Salaires enseignants ----------
create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  amount numeric(12,2) not null,
  period text not null,                -- ex: "2026-09"
  method payment_method not null default 'transfer',
  paid_at date not null default current_date,
  recorded_by uuid references profiles(id),
  notes text
);

-- ---------- Dépenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null default 'other',  -- loyer, fournitures, entretien...
  amount numeric(12,2) not null,
  spent_at date not null default current_date,
  recorded_by uuid references profiles(id),
  notes text
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table profiles enable row level security;
alter table academic_years enable row level security;
alter table classes enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table subjects enable row level security;
alter table courses enable row level security;
alter table attendance enable row level security;
alter table grades enable row level security;
alter table course_materials enable row level security;
alter table payments enable row level security;
alter table salary_payments enable row level security;
alter table expenses enable row level security;

-- Profils : chacun voit le sien, admin voit tout
create policy "own profile" on profiles for select using (id = auth.uid());
create policy "update own profile" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admin all profiles" on profiles for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Admin : accès total partout
create policy "admin all" on academic_years for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on classes for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on teachers for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on students for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on subjects for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on courses for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on attendance for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on grades for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on course_materials for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on payments for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on salary_payments for all using (current_role_is('admin')) with check (current_role_is('admin'));
create policy "admin all" on expenses for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- Enseignants : lecture des référentiels, leurs cours/élèves,
-- écriture présences et notes pour leurs cours
create policy "teacher read years" on academic_years for select using (current_role_is('teacher'));
create policy "teacher read classes" on classes for select using (current_role_is('teacher'));
create policy "teacher read subjects" on subjects for select using (current_role_is('teacher'));

create policy "teacher own record" on teachers for select
  using (profile_id = auth.uid());

create policy "teacher own courses" on courses for select
  using (exists (select 1 from teachers t where t.id = courses.teacher_id and t.profile_id = auth.uid()));

create policy "teacher students of own courses" on students for select
  using (exists (
    select 1 from courses c
    join teachers t on t.id = c.teacher_id
    where c.class_id = students.class_id and t.profile_id = auth.uid()
  ));

create policy "teacher attendance" on attendance for all
  using (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = attendance.course_id and t.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = attendance.course_id and t.profile_id = auth.uid()
  ));

create policy "teacher grades" on grades for all
  using (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = grades.course_id and t.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = grades.course_id and t.profile_id = auth.uid()
  ));

create policy "teacher own course materials" on course_materials for all
  using (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = course_materials.course_id and t.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from courses c join teachers t on t.id = c.teacher_id
    where c.id = course_materials.course_id and t.profile_id = auth.uid()
  ));

create policy "parent read class materials" on course_materials for select
  using (exists (
    select 1 from courses c join students s on s.class_id = c.class_id
    where c.id = course_materials.course_id and s.guardian_id = auth.uid()
  ));

create policy "teacher own salaries" on salary_payments for select
  using (exists (select 1 from teachers t where t.id = salary_payments.teacher_id and t.profile_id = auth.uid()));

-- Parents : lecture seule sur leurs enfants
create policy "parent own children" on students for select
  using (guardian_id = auth.uid());

create policy "parent children payments" on payments for select
  using (exists (select 1 from students s where s.id = payments.student_id and s.guardian_id = auth.uid()));

create policy "parent children grades" on grades for select
  using (exists (select 1 from students s where s.id = grades.student_id and s.guardian_id = auth.uid()));

create policy "parent children attendance" on attendance for select
  using (exists (select 1 from students s where s.id = attendance.student_id and s.guardian_id = auth.uid()));

create policy "parent read classes" on classes for select
  using (exists (select 1 from students s where s.class_id = classes.id and s.guardian_id = auth.uid()));

-- Fonction SECURITY DEFINER : évite la récursion RLS students <-> courses.
create or replace function public.is_guardian_of_class(cid uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (select 1 from students s where s.class_id = cid and s.guardian_id = auth.uid());
$$;

create policy "parent read courses" on courses for select
  using (public.is_guardian_of_class(class_id));

-- ============================================================
-- Données de départ (exemple)
-- ============================================================
insert into academic_years (label, start_date, end_date, is_current)
values ('2026-2027', '2026-09-01', '2027-06-30', true);
-- ============================================================
-- Migration : échéances mensuelles + historique des tarifs
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- Échéances mensuelles (dûs générés par élève) ----------
-- Chaque ligne fige le tarif mensuel d'un élève pour une période donnée.
-- Le montant est copié depuis classes.monthly_fee AU MOMENT de la génération,
-- de sorte qu'un changement de tarif ultérieur n'affecte pas les mois déjà générés.
create table if not exists public.monthly_dues (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  period text not null,                       -- ex: "2026-09"
  amount numeric(12,2) not null,              -- tarif mensuel figé
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (student_id, period)
);

create index if not exists idx_monthly_dues_period on public.monthly_dues(period);

alter table public.monthly_dues enable row level security;

create policy "admin all" on public.monthly_dues for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy "teacher read dues" on public.monthly_dues for select
  using (current_role_is('teacher'));

create policy "parent read own dues" on public.monthly_dues for select
  using (exists (
    select 1 from students s
    where s.id = monthly_dues.student_id and s.guardian_id = auth.uid()
  ));

-- ---------- Historique des tarifs de classe ----------
-- Trace chaque modification du tarif mensuel (monthly_fee) d'une classe.
create table if not exists public.class_fee_history (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  old_fee numeric(12,2),
  new_fee numeric(12,2) not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_class_fee_history_class on public.class_fee_history(class_id, changed_at desc);

alter table public.class_fee_history enable row level security;

create policy "admin all" on public.class_fee_history for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy "teacher read fee history" on public.class_fee_history for select
  using (current_role_is('teacher'));

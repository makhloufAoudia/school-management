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

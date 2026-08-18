-- ============================================================
-- Migration : période d'un cours (date de début / date de fin)
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query
-- ============================================================
-- Un cours ne se limite plus à un créneau hebdomadaire : il peut
-- courir d'une date à une autre (ex. du 15/09/2026 au 30/06/2027,
-- ou un module court du 02/03 au 20/03). Le jour de la semaine et
-- les heures restent facultatifs : ils servent à l'emploi du temps.

alter table public.courses
  add column if not exists start_date date,
  add column if not exists end_date date;

comment on column public.courses.start_date is
  'Date de début du cours (facultative). Le cours n''est pas forcément lié à un jour unique.';
comment on column public.courses.end_date is
  'Date de fin du cours (facultative).';

-- La fin ne peut pas précéder le début.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_dates_order'
  ) then
    alter table public.courses
      add constraint courses_dates_order
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;
end $$;

-- Le jour de la semaine devient facultatif (un cours peut n'avoir qu'une période).
alter table public.courses alter column day_of_week drop not null;

create index if not exists idx_courses_dates on public.courses(start_date, end_date);

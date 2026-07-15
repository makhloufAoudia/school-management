-- ============================================================
-- TEST D'ISOLATION multi-écoles
-- Vérifie qu'un utilisateur d'une école ne voit JAMAIS les données
-- d'une autre école, sous RLS.
--
-- Tout est encapsulé dans une transaction qui se termine par ROLLBACK :
-- AUCUNE donnée n'est conservée. À lancer dans Supabase SQL Editor.
-- ============================================================

begin;

-- ---------- 1. Deux écoles de test + données ----------
-- (exécuté en tant que propriétaire = bypass RLS ; school_id explicite)
do $$
declare
  sa uuid; sb uuid;
  ya uuid; yb uuid;
  ca uuid; cb uuid;
begin
  insert into schools(name, slug) values ('TEST École A', 'test-a') returning id into sa;
  insert into schools(name, slug) values ('TEST École B', 'test-b') returning id into sb;

  insert into academic_years(label, start_date, end_date, is_current, school_id)
    values ('T-A', '2026-09-01','2027-06-30', true, sa) returning id into ya;
  insert into academic_years(label, start_date, end_date, is_current, school_id)
    values ('T-B', '2026-09-01','2027-06-30', true, sb) returning id into yb;

  insert into classes(academic_year_id, name, level, monthly_fee, school_id)
    values (ya, 'A-1', 'niv', 1000, sa) returning id into ca;
  insert into classes(academic_year_id, name, level, monthly_fee, school_id)
    values (yb, 'B-1', 'niv', 2000, sb) returning id into cb;

  insert into students(class_id, first_name, last_name, school_id)
    values (ca, 'Ali', 'A', sa);
  insert into students(class_id, first_name, last_name, school_id)
    values (cb, 'Beya', 'B', sb);

  -- Mémorise les ids d'école pour les étapes suivantes.
  perform set_config('test.school_a', sa::text, true);
  perform set_config('test.school_b', sb::text, true);
end $$;

-- ---------- 2. Faux profils admin (un par école) ----------
-- On contourne la FK vers auth.users le temps du test (rollback ensuite).
alter table public.profiles drop constraint if exists profiles_id_fkey;

do $$
declare
  sa uuid := current_setting('test.school_a')::uuid;
  sb uuid := current_setting('test.school_b')::uuid;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
begin
  insert into profiles(id, full_name, role, school_id) values (ua, 'Admin A', 'admin', sa);
  insert into profiles(id, full_name, role, school_id) values (ub, 'Admin B', 'admin', sb);
  perform set_config('test.user_a', ua::text, true);
  perform set_config('test.user_b', ub::text, true);
end $$;

-- ---------- 3. Impersonation Admin A -> ne voit que l'école A ----------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text,
  true
);

do $$
declare
  n_classes int;
  n_other int;
begin
  select count(*) into n_classes from classes;                 -- doit être 1 (école A)
  select count(*) into n_other  from classes
    where school_id = current_setting('test.school_b')::uuid;  -- doit être 0

  if n_classes <> 1 then
    raise exception 'ÉCHEC A: admin A voit % classes (attendu 1)', n_classes;
  end if;
  if n_other <> 0 then
    raise exception 'ÉCHEC A: admin A voit % classes de l''école B (attendu 0)', n_other;
  end if;
  raise notice 'OK : Admin A ne voit que son école (classes=%).', n_classes;
end $$;

-- ---------- 4. Impersonation Admin B -> ne voit que l'école B ----------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text,
  true
);

do $$
declare
  n_students int;
  n_other int;
begin
  select count(*) into n_students from students;                 -- doit être 1 (école B)
  select count(*) into n_other  from students
    where school_id = current_setting('test.school_a')::uuid;    -- doit être 0

  if n_students <> 1 then
    raise exception 'ÉCHEC B: admin B voit % élèves (attendu 1)', n_students;
  end if;
  if n_other <> 0 then
    raise exception 'ÉCHEC B: admin B voit % élèves de l''école A (attendu 0)', n_other;
  end if;
  raise notice 'OK : Admin B ne voit que son école (élèves=%).', n_students;
end $$;

-- ---------- 5. Nettoyage garanti ----------
reset role;
rollback;   -- annule TOUT (données de test + suppression temporaire de la FK)

-- Si aucun "ÉCHEC ..." n'est apparu et que vous voyez les deux "OK :",
-- l'isolation par école fonctionne. Le ROLLBACK restaure la FK profiles_id_fkey.

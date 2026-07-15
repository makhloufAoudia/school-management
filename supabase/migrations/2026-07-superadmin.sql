-- ============================================================
-- Migration SUPER-ADMIN PLATEFORME
-- Ajoute un niveau AU-DESSUS des admins d'école : un compte "plateforme"
-- qui gère toutes les écoles (les voir, en créer, les désactiver) sans
-- appartenir lui-même à une école (profiles.school_id peut rester NULL).
--
-- Prérequis : 2026-07-multitenant.sql déjà appliqué.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ⚠️ Sauvegarde recommandée avant.
-- ============================================================

-- ---------- 1. Marqueur super-admin sur les profils ----------
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- ---------- 2. Helper : l'utilisateur courant est-il super-admin ? ----------
-- SECURITY DEFINER + stable : évite la récursion RLS et se met en cache/requête.
create or replace function public.is_super_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select coalesce(
    (select is_super_admin from profiles where id = auth.uid()),
    false
  );
$$;

-- ---------- 3. Inscription : propager le flag depuis les métadonnées ----------
-- (Permet de créer un super-admin via le dashboard en mettant
--  "is_super_admin": true dans raw_user_meta_data.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, school_id, is_super_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'parent'),
    nullif(new.raw_user_meta_data->>'school_id','')::uuid,
    coalesce((new.raw_user_meta_data->>'is_super_admin')::boolean, false)
  );
  return new;
end;
$$;

-- ============================================================
-- 4. RLS : le super-admin gère la table schools (toutes les écoles)
-- ============================================================
-- Les policies existantes ("read own school", "admin update own school")
-- restent : les policies permissives s'additionnent (OR).

drop policy if exists "superadmin read all schools" on public.schools;
create policy "superadmin read all schools" on public.schools for select
  using (public.is_super_admin());

drop policy if exists "superadmin manage schools" on public.schools;
create policy "superadmin manage schools" on public.schools for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------- 5. Profils : le super-admin voit/gère tous les profils ----------
-- Utile pour rattacher/ajuster les admins de chaque école depuis l'app.
drop policy if exists "superadmin all profiles" on public.profiles;
create policy "superadmin all profiles" on public.profiles for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- 6. Désigner le PREMIER super-admin
-- ------------------------------------------------------------
-- Décommente et remplace l'UUID (Dashboard > Authentication > Users),
-- ou l'email, puis exécute :
--
--   update public.profiles set is_super_admin = true
--   where id = '<uuid-du-compte>';
--
-- Vérification :
--   select p.full_name, p.role, p.is_super_admin, p.school_id
--   from profiles p where p.is_super_admin;
-- ============================================================

-- ============================================================
-- BLOCAGE D'UN ADMINISTRATEUR
-- ------------------------------------------------------------
-- Ajoute un indicateur "compte bloqué" sur les profils.
-- Un admin bloqué :
--   - ne peut plus se connecter (bannissement côté Supabase Auth) ;
--   - est déconnecté dès sa requête suivante s'il avait une session
--     ouverte (contrôle dans le middleware) ;
--   - conserve toutes ses données : le blocage est réversible.
--
-- Le super-admin ne peut jamais être bloqué (garde côté application
-- + contrainte ci-dessous).
--
-- Prérequis : 2026-07-superadmin.sql déjà appliqué.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ============================================================

alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

-- Filet de sécurité : le super-admin ne peut pas être marqué bloqué.
alter table public.profiles
  drop constraint if exists super_admin_never_blocked;
alter table public.profiles
  add constraint super_admin_never_blocked
  check (not (is_super_admin and is_blocked));

-- Index : le middleware lit ce champ à chaque requête.
create index if not exists profiles_is_blocked_idx
  on public.profiles (is_blocked)
  where is_blocked;

-- Vérification :
--   select id, full_name, role, is_blocked from public.profiles
--   where is_blocked;

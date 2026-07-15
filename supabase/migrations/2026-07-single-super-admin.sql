-- ============================================================
-- Garantie : UN SEUL super-admin plateforme
-- ------------------------------------------------------------
-- Ajoute une protection au niveau de la base : au maximum un profil
-- peut avoir is_super_admin = true. Toute tentative d'en désigner un
-- second (INSERT ou UPDATE) est rejetée par PostgreSQL.
-- Les admins d'école restent de simples admins (role = 'admin').
--
-- Prérequis : 2026-07-superadmin.sql déjà appliqué.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ============================================================

-- 1) Contrôle préalable : combien de super-admins aujourd'hui ?
--    (Si le résultat est > 1, l'index ci-dessous échouera : il faut
--     d'abord retirer le flag aux comptes en trop.)
--    select id, full_name, is_super_admin from public.profiles
--    where is_super_admin;

-- 2) Index unique partiel : une seule ligne peut porter is_super_admin = true.
create unique index if not exists one_super_admin_only
  on public.profiles ((is_super_admin))
  where is_super_admin;

-- Vérification (doit renvoyer exactement 1 ligne) :
--   select id, full_name, is_super_admin from public.profiles
--   where is_super_admin;

-- ============================================================
-- DÉSIGNER LE SUPER-ADMIN DE LA PLATEFORME
-- ------------------------------------------------------------
-- Compte concerné : makhloufaoudia88@gmail.com
--
-- Ce script :
--   1. retire le flag à tout autre compte (l'index unique
--      one_super_admin_only n'autorise qu'UN seul super-admin) ;
--   2. pose is_super_admin = true sur le compte ci-dessus ;
--   3. le détache de toute école (le super-admin est au-dessus
--      des écoles : school_id doit rester NULL).
--
-- Prérequis : 2026-07-superadmin.sql et 2026-07-single-super-admin.sql
-- déjà appliqués.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ⚠️ Le compte doit déjà exister dans Authentication > Users.
-- ============================================================

do $$
declare
  v_email text := 'makhloufaoudia88@gmail.com';
  v_id    uuid;
begin
  -- Retrouve l'utilisateur par e-mail (insensible à la casse).
  select id into v_id
  from auth.users
  where lower(email) = lower(v_email);

  if v_id is null then
    raise exception
      'Compte % introuvable dans auth.users. Créez-le d''abord (Dashboard > Authentication > Users > Add user), puis relancez ce script.',
      v_email;
  end if;

  -- Le profil existe-t-il ? (créé normalement par le trigger handle_new_user)
  if not exists (select 1 from public.profiles where id = v_id) then
    insert into public.profiles (id, full_name, role, school_id, is_super_admin)
    values (v_id, 'Super administrateur', 'admin', null, false);
  end if;

  -- 1) Un seul super-admin : on retire le flag partout ailleurs.
  update public.profiles
     set is_super_admin = false
   where is_super_admin and id <> v_id;

  -- 2) On pose le flag + on détache de toute école.
  update public.profiles
     set is_super_admin = true,
         school_id      = null
   where id = v_id;

  raise notice 'Super-admin défini : % (%)', v_email, v_id;
end
$$;

-- ------------------------------------------------------------
-- VÉRIFICATION — doit renvoyer exactement 1 ligne,
-- avec l'e-mail makhloufaoudia88@gmail.com et school_id NULL.
-- ------------------------------------------------------------
select u.email,
       p.full_name,
       p.role,
       p.school_id,
       p.is_super_admin
from public.profiles p
join auth.users u on u.id = p.id
where p.is_super_admin;

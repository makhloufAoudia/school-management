-- ============================================================
-- Provisioning d'une nouvelle école + son 1er admin
-- À exécuter dans Supabase SQL Editor (contexte service_role).
-- ============================================================

-- Fonction : crée une école et son année scolaire par défaut, renvoie l'id.
create or replace function public.provision_school(
  p_name text,
  p_slug text,
  p_year_label text default '2026-2027',
  p_start date default '2026-09-01',
  p_end date default '2027-06-30'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  sid uuid;
begin
  insert into schools (name, slug) values (p_name, p_slug)
  returning id into sid;

  -- Année scolaire courante de la nouvelle école (school_id explicite).
  insert into academic_years (label, start_date, end_date, is_current, school_id)
  values (p_year_label, p_start, p_end, true, sid);

  return sid;
end;
$$;

-- ------------------------------------------------------------
-- MODE D'EMPLOI pour ajouter une école
-- ------------------------------------------------------------
-- 1) Créer l'école :
--      select provision_school('École El Nour', 'el-nour');
--    -> copie l'UUID renvoyé.
--
-- 2) Créer le compte admin de cette école :
--    Dashboard > Authentication > Users > Add user
--    Email + mot de passe, puis dans "User Metadata" (raw_user_meta_data) :
--      {
--        "full_name": "Administrateur El Nour",
--        "role": "admin",
--        "school_id": "<UUID renvoyé à l'étape 1>"
--      }
--    Le trigger handle_new_user crée automatiquement le profil rattaché
--    à l'école avec le rôle admin.
--
-- 3) Cet admin se connecte : il ne voit QUE les données de son école.
--    Tous les enseignants/parents qu'il crée héritent de school_id
--    automatiquement (trigger set_school_id).
-- ============================================================

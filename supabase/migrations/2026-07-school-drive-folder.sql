-- ============================================================
-- Isolation des PDF par école : chaque école a son sous-dossier Drive.
-- On mémorise l'ID du sous-dossier créé automatiquement.
-- À exécuter dans Supabase > SQL Editor. Idempotent.
-- ============================================================

alter table public.schools
  add column if not exists drive_folder_id text;

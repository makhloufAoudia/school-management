import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client "service_role" — À N'UTILISER QUE CÔTÉ SERVEUR (server actions).
// La clé service_role contourne la sécurité RLS : elle ne doit JAMAIS être
// exposée au navigateur. On n'utilise donc pas le préfixe NEXT_PUBLIC_.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

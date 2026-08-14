// Verifie que la cle SUPABASE_SERVICE_ROLE_KEY de .env.local fonctionne
// et possede bien les privileges d'administration.
// Lancement : double-clic sur verifier-cle-supabase.bat

const fs = require("fs");
const path = require("path");

function lireEnv(fichier) {
  const env = {};
  if (!fs.existsSync(fichier)) return env;
  for (const ligne of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) {
    if (!ligne || ligne.trimStart().startsWith("#")) continue;
    const i = ligne.indexOf("=");
    if (i < 0) continue;
    let v = ligne.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[ligne.slice(0, i).trim()] = v;
  }
  return env;
}

(async () => {
  console.log("=".repeat(60));
  console.log("  VERIFICATION DE LA CLE SUPABASE service_role");
  console.log("=".repeat(60));

  const env = lireEnv(path.join(__dirname, ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !cle) {
    console.log("URL ou cle absente de .env.local. Rien a tester.");
    return;
  }

  const format = cle.startsWith("sb_secret_")
    ? "nouveau format (sb_secret_)"
    : cle.startsWith("eyJ")
      ? "ANCIEN format JWT (legacy)"
      : "format inconnu";

  console.log("Projet :", url);
  console.log("Cle    :", cle.slice(0, 12) + "…" + cle.slice(-4), "|", format);
  console.log("");

  if (cle.startsWith("eyJ")) {
    console.log(">>> ATTENTION : c'est encore l'ancienne cle legacy.");
    console.log("    Relancez changer-cle-supabase.bat avec la cle sb_secret_.");
    console.log("");
  }

  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch {
    console.log("Module @supabase/supabase-js introuvable.");
    console.log("Lancez 'npm install' dans le dossier, puis reessayez.");
    return;
  }

  const supabase = createClient(url, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Test 1 : API d'administration des comptes (c'est ce que fait la page
  // Utilisateurs de l'application).
  console.log("Test 1/2 — API d'administration des comptes …");
  const { data: users, error: errUsers } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (errUsers) {
    console.log("  ECHEC :", errUsers.message);
  } else {
    console.log("  OK — acces administrateur accorde (" + (users?.users?.length ?? 0) + " compte lu)");
  }

  // Test 2 : lecture d'une table protegee par RLS. Une cle sans privilege
  // renverrait zero ligne ou une erreur.
  console.log("Test 2/2 — lecture directe de la table profiles …");
  const { data: profils, error: errProfils } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);
  if (errProfils) {
    console.log("  ECHEC :", errProfils.message);
  } else {
    console.log("  OK — " + (profils?.length ?? 0) + " ligne lue en contournant la RLS");
  }

  console.log("");
  console.log("=".repeat(60));
  if (!errUsers && !errProfils && cle.startsWith("sb_secret_")) {
    console.log("  *** TOUT EST BON ***");
    console.log("");
    console.log("  L'application fonctionne avec la nouvelle cle.");
    console.log("  Vous pouvez desactiver les anciennes cles dans Supabase :");
    console.log("  Settings > API Keys > onglet 'Legacy anon, service_role'");
  } else if (errUsers || errProfils) {
    console.log("  *** PROBLEME *** — ne desactivez PAS les cles legacy.");
    console.log("  Envoyez ce message d'erreur pour diagnostic.");
  }
  console.log("=".repeat(60));
})();

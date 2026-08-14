// Diagnostic du jeton Google Drive.
// Lit .env.local, demande un access_token a Google et affiche la reponse
// exacte. Aucun secret n'est affiche en entier.
// Lancement : node diagnostic-google.js   (ou double-clic sur tester-google.bat)

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

function masque(v) {
  if (!v) return "(absent)";
  return `${v.slice(0, 8)}…${v.slice(-4)}  [${v.length} caracteres]`;
}

(async () => {
  const env = lireEnv(path.join(__dirname, ".env.local"));
  const id = env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  const token = env.GOOGLE_REFRESH_TOKEN;

  console.log("=".repeat(60));
  console.log("  DIAGNOSTIC GOOGLE DRIVE");
  console.log("=".repeat(60));
  console.log("client_id     :", masque(id));
  console.log("client_secret :", masque(secret));
  console.log("refresh_token :", masque(token));
  console.log("");

  if (!id || !secret || !token) {
    console.log(">>> Une variable manque dans .env.local. Rien d'autre a tester.");
    return;
  }
  if (token.includes("GOOGLE_REFRESH_TOKEN")) {
    console.log(">>> Le jeton contient encore le prefixe 'GOOGLE_REFRESH_TOKEN='.");
    console.log("    Corrigez .env.local : la valeur doit commencer par 1//");
    return;
  }

  console.log("Appel de https://oauth2.googleapis.com/token …");
  let res, texte;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: id,
        client_secret: secret,
        refresh_token: token,
      }),
    });
    texte = await res.text();
  } catch (e) {
    console.log(">>> Impossible de joindre Google :", e.message);
    return;
  }

  console.log("Statut HTTP :", res.status);
  console.log("");

  if (res.ok) {
    console.log("*** LE JETON EST VALIDE ***");
    console.log("Google a bien renvoye un access_token.");
    console.log("Si le site affiche encore l'erreur, c'est que le serveur");
    console.log("n'a pas ete redemarre : lancez restart-school.bat.");
    return;
  }

  // Reponse d'erreur : elle ne contient aucun secret, on l'affiche telle quelle.
  console.log("Reponse de Google :");
  console.log(texte);
  console.log("");

  const d = texte.toLowerCase();
  if (d.includes("expired or revoked")) {
    console.log(">>> Le jeton a ete revoque ou a expire.");
    console.log("    Cause la plus frequente : l'ecran de consentement OAuth");
    console.log("    est en mode 'Test' — Google invalide alors les jetons au");
    console.log("    bout de 7 jours. Publiez l'application en Production :");
    console.log("    console.cloud.google.com > APIs & Services >");
    console.log("    OAuth consent screen > Publish app");
  } else if (d.includes("client_secret") || d.includes("unauthorized_client")) {
    console.log(">>> Le client_secret ne correspond pas au client_id,");
    console.log("    ou le jeton a ete obtenu avec un autre client OAuth.");
  } else if (d.includes("invalid_grant")) {
    console.log(">>> invalid_grant : le jeton n'est pas accepte pour ce client.");
    console.log("    Refaites l'autorisation depuis CE serveur :");
    console.log("    http://localhost:3001/api/google/auth");
    console.log("    (connecte en admin), puis relancez ce diagnostic.");
  }
})();

// Test complet du televersement Google Drive : jeton -> envoi d'un petit
// fichier dans le dossier configure -> suppression. Ne laisse aucune trace.
// Lancement : double-clic sur tester-upload-drive.bat

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
  console.log("  TEST DE TELEVERSEMENT GOOGLE DRIVE");
  console.log("=".repeat(60));

  const env = lireEnv(path.join(__dirname, ".env.local"));
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret,
          GOOGLE_REFRESH_TOKEN: refresh, GOOGLE_DRIVE_FOLDER_ID: dossier } = env;

  if (!id || !secret || !refresh || !dossier) {
    console.log("Variables Google incompletes dans .env.local.");
    return;
  }
  console.log("Dossier Drive :", dossier);
  console.log("");

  // --- 1. Jeton d'acces
  console.log("Etape 1/3 — obtention du jeton d'acces …");
  const rToken = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: id, client_secret: secret, refresh_token: refresh,
    }),
  });
  if (!rToken.ok) {
    console.log("  ECHEC :", await rToken.text());
    console.log("\n>>> Le jeton est refuse. Relancez tester-google.bat.");
    return;
  }
  const { access_token } = await rToken.json();
  console.log("  OK");

  // --- 2. Envoi d'un fichier temoin
  console.log("Etape 2/3 — envoi d'un fichier de test …");
  const limite = "----test-" + Math.random().toString(36).slice(2);
  const nom = "test-claude-" + Date.now() + ".txt";
  const meta = JSON.stringify({ name: nom, mimeType: "text/plain", parents: [dossier] });
  const corps = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: text/plain\r\n\r\n`),
    Buffer.from("Fichier de test, supprime automatiquement."),
    Buffer.from(`\r\n--${limite}--`),
  ]);

  const rUp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": `multipart/related; boundary=${limite}`,
      },
      body: corps,
    }
  );
  const texteUp = await rUp.text();
  if (!rUp.ok) {
    console.log("  ECHEC (HTTP " + rUp.status + ") :");
    console.log(texteUp);
    console.log("");
    if (texteUp.includes("notFound") || texteUp.includes("File not found")) {
      console.log(">>> Le dossier GOOGLE_DRIVE_FOLDER_ID n'existe pas ou");
      console.log("    n'appartient pas au compte qui a autorise l'application.");
    } else if (texteUp.includes("storageQuotaExceeded")) {
      console.log(">>> Le Drive du compte est plein.");
    } else if (texteUp.includes("insufficient")) {
      console.log(">>> Autorisation Drive insuffisante : refaites");
      console.log("    http://localhost:3001/api/google/auth");
    }
    return;
  }
  const fichier = JSON.parse(texteUp);
  console.log("  OK — fichier cree :", fichier.name);

  // --- 3. Nettoyage
  console.log("Etape 3/3 — suppression du fichier de test …");
  const rDel = await fetch(`https://www.googleapis.com/drive/v3/files/${fichier.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access_token}` },
  });
  console.log(rDel.ok || rDel.status === 204 ? "  OK — supprime" : "  Non supprime (HTTP " + rDel.status + ") : a retirer a la main dans Drive");

  console.log("");
  console.log("=".repeat(60));
  console.log("  *** LE TELEVERSEMENT FONCTIONNE ***");
  console.log("  Les PDF joints aux cours partiront bien sur Drive.");
  console.log("=".repeat(60));
})();

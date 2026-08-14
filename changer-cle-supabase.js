// Remplace SUPABASE_SERVICE_ROLE_KEY dans .env.local.
// La cle est saisie ici, en local : elle n'est jamais affichee en entier
// et ne quitte pas votre machine. Une sauvegarde est faite avant.

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const FICHIER = path.join(__dirname, ".env.local");
const CLE = "SUPABASE_SERVICE_ROLE_KEY";

function masque(v) {
  return `${v.slice(0, 12)}…${v.slice(-4)}  [${v.length} caracteres]`;
}

function horodatage() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

console.log("=".repeat(60));
console.log("  REMPLACEMENT DE LA CLE SUPABASE service_role");
console.log("=".repeat(60));

if (!fs.existsSync(FICHIER)) {
  console.log("Fichier introuvable :", FICHIER);
  process.exit(1);
}

const contenu = fs.readFileSync(FICHIER, "utf8");
const lignes = contenu.split(/\r?\n/);
const index = lignes.findIndex((l) => l.startsWith(CLE + "="));

if (index >= 0) {
  const actuelle = lignes[index].slice(CLE.length + 1).trim();
  console.log("Cle actuelle  :", actuelle ? masque(actuelle) : "(vide)");
} else {
  console.log("Cle actuelle  : (aucune ligne " + CLE + " dans .env.local)");
}
console.log("");
console.log("Collez la NOUVELLE cle (clic droit dans cette fenetre = coller),");
console.log("puis appuyez sur Entree. Laissez vide pour annuler.");
console.log("");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Nouvelle cle > ", (reponse) => {
  rl.close();
  const cle = (reponse || "").trim().replace(/^["']|["']$/g, "");

  if (!cle) {
    console.log("\nAnnule. Aucun changement.");
    return;
  }
  if (cle.startsWith(CLE + "=")) {
    console.log("\nVous avez colle le nom de la variable en plus de la valeur.");
    console.log("Ne collez que la cle elle-meme. Relancez le script.");
    return;
  }
  if (!cle.startsWith("sb_secret_") && !cle.startsWith("eyJ")) {
    console.log("\nCette valeur ne ressemble pas a une cle Supabase.");
    console.log("Elle doit commencer par 'sb_secret_' (nouveau format)");
    console.log("ou 'eyJ' (ancien format JWT). Rien n'a ete modifie.");
    return;
  }
  if (cle.startsWith("sb_publishable_")) {
    console.log("\nC'est la cle PUBLIQUE, pas la cle secrete. Rien n'a ete modifie.");
    return;
  }

  // Sauvegarde
  const sauvegarde = FICHIER + ".bak-" + horodatage();
  fs.copyFileSync(FICHIER, sauvegarde);

  const nouvelleLigne = CLE + "=" + cle;
  if (index >= 0) {
    lignes[index] = nouvelleLigne;
  } else {
    lignes.push(nouvelleLigne);
  }
  fs.writeFileSync(FICHIER, lignes.join("\n"), "utf8");

  console.log("");
  console.log("Sauvegarde  :", path.basename(sauvegarde));
  console.log("Nouvelle cle:", masque(cle));
  console.log("");
  console.log("*** .env.local mis a jour ***");
  console.log("");
  console.log("Etape suivante : lancez restart-school.bat, puis testez la");
  console.log("creation d'un compte dans la page Utilisateurs.");
  console.log("Ne desactivez les anciennes cles dans Supabase QU'APRES ce test.");
});

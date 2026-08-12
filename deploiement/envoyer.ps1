# =====================================================================
#  maxschool — construire l'application et l'envoyer sur le serveur
#
#  A lancer SUR VOTRE PC, dans PowerShell, depuis le dossier du projet.
#
#  Exemple :
#     cd "E:\claude 2026\school"
#     .\deploiement\envoyer.ps1 -Ip 152.70.1.2 -Cle "$env:USERPROFILE\Downloads\ssh-key.key"
#
#  Pourquoi construire ici plutot que sur le serveur : la machine
#  gratuite n'a qu'1 Go de memoire, insuffisant pour compiler Next.js.
# =====================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [Parameter(Mandatory = $true)][string]$Cle,
  [string]$Domaine = "maxschool.duckdns.org",
  [string]$Utilisateur = "ubuntu"
)

$ErrorActionPreference = "Stop"

function Etape($n, $t) { Write-Host "`n==> [$n] $t" -ForegroundColor Cyan }
function Souci($t)     { Write-Host "    $t" -ForegroundColor Yellow }

# ------------------------------------------------------------------ verifications
$Projet = Split-Path -Parent $PSScriptRoot
Set-Location $Projet

if (-not (Test-Path (Join-Path $Projet "package.json"))) {
  throw "package.json introuvable. Lancez ce script depuis le dossier du projet."
}
if (-not (Test-Path $Cle)) {
  throw "Cle SSH introuvable : $Cle"
}
foreach ($outil in @("npm", "ssh", "scp", "tar")) {
  if (-not (Get-Command $outil -ErrorAction SilentlyContinue)) {
    throw "'$outil' est introuvable. Installez Node.js et le client OpenSSH de Windows."
  }
}

# ------------------------------------------------------------------ 1. build
Etape 1 "Construction de l'application"

# NEXT_PUBLIC_ROOT_DOMAIN est fige dans le code au moment du build :
# c'est ici qu'il doit etre defini, pas sur le serveur.
$env:NEXT_PUBLIC_ROOT_DOMAIN = $Domaine
Write-Host "    NEXT_PUBLIC_ROOT_DOMAIN = $Domaine"
# NODE_ENV n'est volontairement pas force ici : il ferait sauter
# l'installation des dependances de developpement, indispensables au build.

if (-not (Test-Path (Join-Path $Projet "node_modules"))) {
  Write-Host "    Installation des dependances..."
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci a echoue." }
}

npm run build
if ($LASTEXITCODE -ne 0) { throw "La construction a echoue. Corrigez les erreurs ci-dessus." }

$Standalone = Join-Path $Projet ".next\standalone"
if (-not (Test-Path $Standalone)) {
  throw "Dossier .next\standalone absent. Verifiez que next.config.ts contient bien : output: 'standalone'"
}

# ------------------------------------------------------------------ 2. assemblage
Etape 2 "Assemblage du paquet"

# Next.js ne recopie pas les fichiers statiques dans standalone : a faire a la main.
$CibleStatic = Join-Path $Standalone ".next\static"
if (Test-Path $CibleStatic) { Remove-Item $CibleStatic -Recurse -Force }
New-Item -ItemType Directory -Path $CibleStatic -Force | Out-Null
Copy-Item (Join-Path $Projet ".next\static\*") $CibleStatic -Recurse -Force

$Public = Join-Path $Projet "public"
if (Test-Path $Public) {
  Copy-Item $Public (Join-Path $Standalone "public") -Recurse -Force
}

$Archive = Join-Path $env:TEMP "maxschool.tar.gz"
if (Test-Path $Archive) { Remove-Item $Archive -Force }
tar -czf $Archive -C $Standalone .
if ($LASTEXITCODE -ne 0) { throw "La creation de l'archive a echoue." }

$Taille = [math]::Round((Get-Item $Archive).Length / 1MB, 1)
Write-Host "    Paquet pret : $Taille Mo"

# ------------------------------------------------------------------ 3. envoi
Etape 3 "Envoi vers $Ip"

$Cible = "$Utilisateur@$Ip"
scp -i $Cle -o StrictHostKeyChecking=accept-new $Archive "${Cible}:/tmp/maxschool.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "L'envoi a echoue. Verifiez l'adresse IP et la cle." }

# ------------------------------------------------------------------ 4. installation
Etape 4 "Mise en place sur le serveur"

$Distant = @'
set -e
sudo systemctl stop maxschool 2>/dev/null || true
sudo rm -rf /opt/maxschool
sudo mkdir -p /opt/maxschool
sudo tar -xzf /tmp/maxschool.tar.gz -C /opt/maxschool
sudo chown -R maxschool:maxschool /opt/maxschool
rm -f /tmp/maxschool.tar.gz
sudo systemctl start maxschool
sleep 3
sudo systemctl is-active --quiet maxschool && echo "SERVICE ACTIF" || (sudo journalctl -u maxschool -n 30 --no-pager; exit 1)
'@

# Le script est transmis sur l'entree standard : plus fiable que de le
# passer en argument, ou les retours a la ligne posent probleme.
$Distant | ssh -i $Cle -o StrictHostKeyChecking=accept-new $Cible "bash -s"
if ($LASTEXITCODE -ne 0) {
  Souci "L'application n'a pas demarre. Les messages ci-dessus indiquent la cause."
  Souci "Le plus souvent : /etc/maxschool.env est vide ou incomplet."
  exit 1
}

Remove-Item $Archive -Force

Write-Host "`n  ================================================================" -ForegroundColor Green
Write-Host "    EN LIGNE" -ForegroundColor Green
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "    Plateforme   https://$Domaine"
Write-Host "    Une ecole    https://son-slug.$Domaine"
Write-Host ""
Write-Host "    Relancer plus tard : la meme commande suffit."
Write-Host ""

#!/usr/bin/env bash
# =====================================================================
#  maxschool — installation sur une machine Ubuntu
#  (pensé pour Oracle Cloud « Always Free », valable sur tout VPS)
#
#  Met en place :
#    - Node.js 22
#    - Caddy compilé avec le module DuckDNS (certificat wildcard)
#    - le service systemd de l'application
#    - le pare-feu et la mémoire d'échange
#
#  Réexécutable sans risque.
#
#  Usage :
#     sudo bash installer-serveur.sh maxschool.duckdns.org VOTRE_TOKEN_DUCKDNS
# =====================================================================
set -euo pipefail

DOMAINE="${1:-}"
TOKEN="${2:-}"
APP_DIR=/opt/maxschool
ENV_FILE=/etc/maxschool.env
UTILISATEUR=maxschool
PORT=3000

msg()   { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
avert() { printf '\033[1;33m    %s\033[0m\n' "$*"; }
erreur(){ printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || erreur "Lancez ce script avec sudo."
[ -n "$DOMAINE" ] && [ -n "$TOKEN" ] || erreur "Usage :
    sudo bash installer-serveur.sh maxschool.duckdns.org VOTRE_TOKEN_DUCKDNS

Le token se trouve en haut de la page duckdns.org une fois connecté."

msg "1/8  Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ca-certificates gnupg tar

msg "2/8  Mémoire d'échange"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    2 Go ajoutés."
else
  echo "    Déjà en place."
fi

msg "3/8  Node.js 22"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
echo "    Node $(node -v)"

msg "4/8  Compte de service"
id -u "$UTILISATEUR" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$UTILISATEUR"
mkdir -p "$APP_DIR"

msg "5/8  Fichier des secrets"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Secrets de l'application — NE JAMAIS mettre ce fichier dans Git.
# Reprenez les valeurs de votre .env.local.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
NEXT_PUBLIC_CURRENCY=DA
EOF
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
  avert "$ENV_FILE créé, mais VIDE."
  avert "Remplissez-le avant de démarrer :  sudo nano $ENV_FILE"
else
  echo "    Déjà présent, laissé intact."
fi
# NEXT_PUBLIC_ROOT_DOMAIN est figé au moment du build, pas ici :
# voir envoyer.ps1 côté PC.

msg "6/8  Caddy avec le module DuckDNS"
# Le paquet Caddy standard ne sait pas parler à DuckDNS. On récupère une
# version compilée à la demande, contenant le module dns.providers.duckdns.
if ! caddy list-modules 2>/dev/null | grep -q 'dns.providers.duckdns'; then
  ARCH=$(dpkg --print-architecture)   # amd64 ou arm64
  echo "    Téléchargement d'une version avec le module DuckDNS ($ARCH)..."
  curl -fsSL -o /tmp/caddy \
    "https://caddyserver.com/api/download?os=linux&arch=${ARCH}&p=github.com/caddy-dns/duckdns"
  install -m 755 /tmp/caddy /usr/bin/caddy
  rm -f /tmp/caddy
  id -u caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
  mkdir -p /etc/caddy
  if [ ! -f /etc/systemd/system/caddy.service ]; then
    cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  fi
fi
caddy list-modules | grep -q 'dns.providers.duckdns' \
  || erreur "Le module DuckDNS n'est pas dans le binaire Caddy. Relancez le script."
echo "    $(caddy version | head -1)"

msg "7/8  Configuration du certificat wildcard"
cat > /etc/caddy/Caddyfile <<EOF
{
	# Un seul certificat couvre le domaine et TOUS les sous-domaines
	# d'école. C'est ce qui rend l'inscription libre possible.
	email admin@$DOMAINE
}

$DOMAINE, *.$DOMAINE {
	tls {
		dns duckdns $TOKEN
		resolvers 1.1.1.1
	}
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
chmod 640 /etc/caddy/Caddyfile
chown root:caddy /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable caddy >/dev/null
systemctl restart caddy
echo "    Caddy configuré pour $DOMAINE et *.$DOMAINE"
avert "Le premier certificat prend 1 à 3 minutes (validation DNS)."

msg "8/8  Service de l'application"
cat > /etc/systemd/system/maxschool.service <<EOF
[Unit]
Description=maxschool (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$UTILISATEUR
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable maxschool >/dev/null

msg "Pare-feu"
apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
echo "    Ports 80 et 443 ouverts localement."
avert "Pensez aussi aux règles Ingress dans la console Oracle (guide, étape 5)."

if [ -f "$APP_DIR/server.js" ]; then
  systemctl restart maxschool
  sleep 3
  systemctl is-active --quiet maxschool \
    && echo "    Application démarrée." \
    || avert "L'application n'a pas démarré : journalctl -u maxschool -n 40"
else
  avert "Application pas encore envoyée. Lancez envoyer.ps1 depuis votre PC."
fi

cat <<EOF

  ================================================================
    MACHINE PRETE
  ================================================================

    Plateforme   https://$DOMAINE
    Une école    https://son-slug.$DOMAINE

  Il reste a :
    1. remplir  sudo nano $ENV_FILE
    2. envoyer l'application depuis votre PC  (envoyer.ps1)
    3. sudo systemctl restart maxschool

  Commandes utiles :
    systemctl status maxschool       etat
    journalctl -u maxschool -f       messages en direct
    journalctl -u caddy -n 30        obtention du certificat

EOF

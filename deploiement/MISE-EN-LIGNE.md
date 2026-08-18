> **Adresse unique — état actuel du projet.**
> L'application vit sur **une seule adresse : <https://maxschool.duckdns.org>**.
> Il n'y a plus de sous-domaine par école (`el-nour.maxschool...`) : tout le
> monde se connecte au même endroit, l'école est déduite du compte. Toute
> autre adresse publique est redirigée automatiquement (voir
> `ADRESSE-UNIQUE.md`). Les passages ci-dessous qui décrivent des
> sous-domaines ou un certificat wildcard ne s'appliquent plus.

> **Ce document est le plan B.** Il suppose une carte bancaire (Oracle en
> exige une pour vérifier l'identité). Sans carte, suivez plutôt
> `VERCEL-DUCKDNS.md`. Gardez ce guide de côté : il redeviendra utile le
> jour où vous facturerez des écoles, l'usage commercial étant interdit
> sur le plan gratuit de Vercel.

# Mettre maxschool en ligne sur `maxschool.duckdns.org`

Objectif : `https://maxschool.duckdns.org` pour la plateforme, et
`https://el-nour.maxschool.duckdns.org` pour chaque école inscrite —
automatiquement, sans intervention de votre part.

Coût : 0 €. Durée : deux heures la première fois, cinq minutes ensuite.

---

## Pourquoi pas Vercel

Votre application donne un sous-domaine à chaque école. Il faut donc un
certificat **wildcard** (`*.maxschool.duckdns.org`), et Vercel n'en
délivre qu'à une condition : que les serveurs de noms du domaine lui
soient délégués. DuckDNS ne le permet pas.

En revanche, DuckDNS sait publier l'enregistrement TXT que Let's Encrypt
réclame pour valider un wildcard. Sur **votre propre serveur**, Caddy
s'en sert et obtient le certificat tout seul. D'où ce guide.

Bénéfice secondaire : le plan gratuit de Vercel interdit l'usage
commercial. En vous hébergeant, la question ne se pose plus.

---

## Vue d'ensemble

```
Navigateur                      Machine Oracle (gratuite, 24h/24)
    |                                    |
    |  https://el-nour.maxschool...      |
    +----------------------------------> Caddy  (certificat wildcard)
                                          |
                                          +--> Next.js  (127.0.0.1:3000)
                                                  |
                                                  +--> Supabase  (externe)
                                                  +--> Google Drive (externe)
```

Votre base de données reste chez Supabase, vos PDF chez Google Drive.
Seule l'application déménage.

---

## Étape 1 — Créer le compte Oracle Cloud

1. <https://www.oracle.com/cloud/free/> → **Start for free**
2. Région : **France Central (Paris)** ou **Germany Central (Frankfurt)**.
   Ce choix est définitif.
3. Une carte bancaire est demandée pour vérifier l'identité : environ 1 €
   débité puis remboursé. Le compte reste gratuit, Oracle ne peut pas
   vous facturer sans passage explicite en compte payant.
4. Attendez « Your account is ready » (5 à 20 minutes).

---

## Étape 2 — Créer la machine

Menu ☰ → **Compute** → **Instances** → **Create instance**

| Réglage | Valeur |
|---|---|
| Name | `maxschool` |
| Image | **Ubuntu 22.04** ou 24.04 |
| Shape | **VM.Standard.E2.1.Micro** |
| Assign a public IPv4 address | **Yes** |

Section **Add SSH keys** → **Generate a key pair for me** →
**Save private key**. Ce fichier `.key` est votre seul moyen d'accès et
n'est pas récupérable : rangez-le soigneusement.

Notez l'**adresse IP publique** affichée après la création.

> Pourquoi cette machine plutôt que l'ARM, bien plus puissante : Oracle
> récupère les machines ARM inactives. La micro AMD échappe à cette règle.
> Elle suffit largement, l'application ne fait que servir des pages.

---

## Étape 3 — Pointer DuckDNS vers la machine

Sur <https://www.duckdns.org>, ligne `maxschool` :

- **current ip** → l'adresse IP publique de l'étape 2 → **update ip**
- Notez le **token** affiché en haut de page.

Si ce token a déjà circulé (capture d'écran, message), utilisez
**recreate token** avant de continuer.

---

## Étape 4 — Ouvrir les ports côté Oracle

**Networking** → **Virtual Cloud Networks** → votre VCN →
**Security Lists** → **Default Security List** → **Add Ingress Rules**

| Source CIDR | Protocole | Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

Sans cette étape, rien ne répondra — et le certificat ne sera jamais
délivré.

---

## Étape 5 — Se connecter à la machine

Dans **PowerShell**, sur votre PC :

```powershell
icacls "$env:USERPROFILE\Downloads\ssh-key.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i "$env:USERPROFILE\Downloads\ssh-key.key" ubuntu@VOTRE_IP
```

La première ligne restreint les droits du fichier ; sans elle, SSH le
refuse.

---

## Étape 6 — Installer

Envoyez le script depuis votre PC (**nouvelle fenêtre PowerShell**) :

```powershell
cd "E:\claude 2026\school"
scp -i "$env:USERPROFILE\Downloads\ssh-key.key" `
    deploiement\installer-serveur.sh ubuntu@VOTRE_IP:~/
```

Puis, dans la fenêtre connectée à la machine :

```bash
sudo bash installer-serveur.sh maxschool.duckdns.org VOTRE_TOKEN_DUCKDNS
```

Le script installe Node.js, télécharge une version de Caddy contenant le
module DuckDNS, configure le certificat wildcard, le pare-feu et le
service. Comptez cinq minutes.

---

## Étape 7 — Renseigner les secrets

Toujours sur la machine :

```bash
sudo nano /etc/maxschool.env
```

Recopiez les valeurs depuis votre `.env.local` :

| Variable | Origine |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | déjà dans votre `.env.local` |
| `GOOGLE_DRIVE_FOLDER_ID` | déjà dans votre `.env.local` |
| `NEXT_PUBLIC_CURRENCY` | `DA` |

`Ctrl+O` puis `Entrée` pour enregistrer, `Ctrl+X` pour sortir.

> `NEXT_PUBLIC_ROOT_DOMAIN` ne figure pas dans cette liste : cette
> variable-là est figée dans le code au moment de la compilation. C'est
> `envoyer.ps1` qui s'en charge, à l'étape suivante.

---

## Étape 8 — Envoyer l'application

Sur votre PC :

```powershell
cd "E:\claude 2026\school"
.\deploiement\envoyer.ps1 -Ip VOTRE_IP -Cle "$env:USERPROFILE\Downloads\ssh-key.key"
```

Le script compile l'application sur votre PC — la machine gratuite n'a
pas assez de mémoire pour ça — puis n'envoie que le résultat, quelques
dizaines de mégaoctets, et redémarre le service.

**C'est cette commande, et elle seule, que vous relancerez à chaque mise
à jour.**

---

## Étape 9 — Google OAuth

Google Cloud Console → **Identifiants** → votre client OAuth Web →
**URI de redirection autorisés**, ajoutez :

```
https://maxschool.duckdns.org/api/google/callback
```

Google n'accepte pas les jokers ici. Si l'envoi de PDF se fait depuis les
sous-domaines d'école, ajoutez aussi les sous-domaines réellement
utilisés, au fur et à mesure.

---

## Étape 10 — Vérifier

1. `https://maxschool.duckdns.org` → la page de connexion, avec le
   cadenas.
2. `https://test.maxschool.duckdns.org` → doit répondre aussi (page
   d'erreur applicative, mais **en https**). C'est la preuve que le
   wildcard fonctionne.
3. Créez une école via `/signup`, puis connectez-vous sur son
   sous-domaine.

Si le certificat n'arrive pas, regardez ce que dit Caddy :

```bash
sudo journalctl -u caddy -n 50 --no-pager
```

---

## Vie courante

| Besoin | Commande |
|---|---|
| Mettre à jour l'application | `.\deploiement\envoyer.ps1 -Ip ... -Cle ...` depuis le PC |
| État | `systemctl status maxschool` |
| Messages en direct | `journalctl -u maxschool -f` |
| Redémarrer | `sudo systemctl restart maxschool` |
| Modifier un secret | `sudo nano /etc/maxschool.env` puis `sudo systemctl restart maxschool` |

Le certificat wildcard se renouvelle tout seul tous les 60 jours. Vous
n'avez rien à faire.

---

## Sécurité — à faire avant la première école cliente

- **Supprimez `service-account-google.json`** du projet s'il n'est pas
  utilisé (l'application passe par OAuth).
- **Ne mettez jamais `.env.local` dans Git.** Il est déjà dans
  `.gitignore` — vérifiez avec `git status` avant chaque `push`.
- **`SUPABASE_SERVICE_ROLE_KEY` contourne toute la sécurité RLS.** Elle
  ne doit exister qu'à deux endroits : votre `.env.local` et
  `/etc/maxschool.env` (droits 600, lisible par root seul).
- **Sauvegardez Supabase.** L'application est reconstruisible en une
  commande ; vos données d'écoles, non. Activez les sauvegardes dans le
  tableau de bord Supabase.

---

## Le jour où `.eu.org` aboutit

Rien à refaire du côté serveur. Trois gestes :

1. Chez `nic.eu.org`, pointez le domaine vers cette machine.
2. Sur la machine, remplacez `maxschool.duckdns.org` par le nouveau nom
   dans `/etc/caddy/Caddyfile` — en gardant le bloc `tls` seulement si
   vous restez sur DuckDNS ; avec un vrai domaine, supprimez-le, Caddy
   validera par HTTP.
3. Sur le PC, relancez `envoyer.ps1` avec `-Domaine votrenouveaunom`.

Gardez l'ancienne adresse active quelques semaines, le temps que les
écoles s'habituent.

---

## En cas de problème

**« Le site est inaccessible »**
→ Étape 4 oubliée, ou mauvaise IP dans DuckDNS.
Depuis la machine : `curl -I http://localhost:3000` doit répondre.

**Certificat refusé, `*.maxschool.duckdns.org` en erreur**
→ Token DuckDNS incorrect dans `/etc/caddy/Caddyfile`. Vérifiez-le, puis
`sudo systemctl restart caddy`. Let's Encrypt limite les tentatives :
attendez une heure entre deux essais infructueux.

**Le service redémarre en boucle**
→ `journalctl -u maxschool -n 50`. Presque toujours
`/etc/maxschool.env` incomplet.

**Une école inscrite ne peut pas se connecter**
→ `NEXT_PUBLIC_ROOT_DOMAIN` n'a pas été pris en compte à la compilation.
Relancez `envoyer.ps1` : il le positionne automatiquement.

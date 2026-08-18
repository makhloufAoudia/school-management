> **Adresse unique — état actuel du projet.**
> L'application vit sur **une seule adresse : <https://maxschool.duckdns.org>**.
> Il n'y a plus de sous-domaine par école (`el-nour.maxschool...`) : tout le
> monde se connecte au même endroit, l'école est déduite du compte. Toute
> autre adresse publique est redirigée automatiquement (voir
> `ADRESSE-UNIQUE.md`). Les passages ci-dessous qui décrivent des
> sous-domaines ou un certificat wildcard ne s'appliquent plus.

# Mettre maxschool en ligne sur Vercel

Sans carte bancaire, sans serveur à administrer, gratuitement.

Résultat visé :

- `https://maxschool.duckdns.org` → la plateforme
- `https://el-nour.maxschool.duckdns.org` → une école inscrite,
  **créée automatiquement** au moment de l'inscription

---

## Ce qui rend la chose possible

DuckDNS résout déjà **tous** les sous-domaines vers la même adresse —
vérifié : `test.maxschool.duckdns.org` répond sans configuration. Le DNS
est donc réglé.

Reste le certificat. Vercel ne délivre pas de wildcard sans délégation de
serveurs de noms, ce que DuckDNS ne permet pas. Mais Vercel accepte
d'enregistrer les sous-domaines **un par un**, avec un certificat chacun,
et son API permet de le faire par programme. C'est ce que fait désormais
`lib/vercel-domain.ts`, appelé à chaque inscription d'école.

Limite du plan gratuit : **50 domaines par projet**. Au-delà, il faudra
passer au plan Pro — ou à l'auto-hébergement décrit dans `MISE-EN-LIGNE.md`.

---

## Étape 1 — Pousser le code sur GitHub

Le dépôt existe déjà (`makhloufAoudia/school-management`). Depuis
PowerShell :

```powershell
cd "E:\claude 2026\school"
git status
```

Vérifiez qu'il n'y a **ni `.env.local` ni `service-account-google.json`**
dans la liste. Puis :

```powershell
git add .
git commit -m "Sous-domaines automatiques via l'API Vercel"
git push
```

---

## Étape 2 — Importer le projet sur Vercel

1. <https://vercel.com/signup> → **Continue with GitHub**. Aucune carte
   n'est demandée sur le plan Hobby.
2. **Add New… → Project** → sélectionnez `school-management`.
3. Ne changez aucun réglage de build : Next.js est détecté tout seul.
4. **N'appuyez pas encore sur Deploy** — passez d'abord à l'étape 3.

---

## Étape 3 — Les variables d'environnement

Toujours dans l'écran d'import, section **Environment Variables**.
Recopiez depuis votre `.env.local` :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | depuis `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | depuis `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | depuis `.env.local` |
| `GOOGLE_OAUTH_CLIENT_ID` | depuis `.env.local` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | depuis `.env.local` |
| `GOOGLE_REFRESH_TOKEN` | depuis `.env.local` |
| `GOOGLE_DRIVE_FOLDER_ID` | depuis `.env.local` |
| `NEXT_PUBLIC_CURRENCY` | `DA` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `maxschool.duckdns.org` |

`VERCEL_API_TOKEN` et `VERCEL_PROJECT_ID` viendront à l'étape 6 : le
projet doit exister pour avoir un identifiant.

Puis **Deploy**. Trois à cinq minutes.

> `NEXT_PUBLIC_ROOT_DOMAIN` est lue **à la compilation**. Chaque fois que
> vous la modifiez, il faut redéployer — la changer seule ne produit
> aucun effet.

---

## Étape 4 — Brancher le domaine

C'est l'étape décisive, et la seule dont l'issue n'est pas garantie
d'avance : Vercel n'a pas prévu qu'on lui confie un sous-domaine de
DuckDNS.

1. Projet → **Settings** → **Domains** → **Add Domain**
2. Saisissez `maxschool.duckdns.org`
3. Vercel affiche la configuration DNS attendue. Deux cas :

   **Il propose un enregistrement A avec une adresse IP** — c'est le bon
   cas. Copiez cette adresse, allez sur <https://www.duckdns.org>, mettez-la
   dans **current ip** pour `maxschool`, puis **update ip**.

   **Il exige un CNAME** — DuckDNS ne sait pas en créer. Essayez tout de
   même l'adresse IP de Vercel : `76.76.21.21`. Si au bout de dix minutes
   le domaine reste en « Invalid Configuration », c'est bloqué. Voyez la
   section « Si ça coince » plus bas.

Comptez jusqu'à dix minutes pour le certificat.

---

## Étape 5 — Vérifier le principe

Une fois `maxschool.duckdns.org` en vert, testez un sous-domaine :

1. **Settings → Domains → Add Domain** → `test.maxschool.duckdns.org`
2. Il devrait passer en vert sans aucune manipulation DNS — le DNS
   wildcard de DuckDNS s'en charge.
3. Ouvrez `https://test.maxschool.duckdns.org` : vous devez obtenir une
   page de l'application, en https.

Si ce test réussit, l'automatisation fonctionnera. Supprimez ensuite ce
domaine de test.

---

## Étape 6 — Activer l'ajout automatique

1. **Jeton** : <https://vercel.com/account/tokens> → **Create Token**.
   Nom : `maxschool-domains`. Portée : votre compte. Expiration : sans.
   Copiez-le immédiatement, il ne sera plus affiché.

2. **Identifiant du projet** : Settings → General → **Project ID**
   (commence par `prj_`).

3. Settings → **Environment Variables**, ajoutez :

   | Variable | Valeur |
   |---|---|
   | `VERCEL_API_TOKEN` | le jeton créé |
   | `VERCEL_PROJECT_ID` | `prj_...` |

4. **Deployments** → dernier déploiement → `…` → **Redeploy**.

---

## Étape 7 — Google OAuth

Google Cloud Console → **Identifiants** → votre client OAuth Web →
**URI de redirection autorisés**, ajoutez :

```
https://maxschool.duckdns.org/api/google/callback
```

Google refuse les jokers ici : ajoutez les sous-domaines d'école au fur
et à mesure, si le téléversement de PDF s'y fait.

---

## Étape 8 — L'essai qui compte

1. Ouvrez `https://maxschool.duckdns.org/signup`
2. Créez une école, par exemple « École El Nour »
3. La page affiche le lien de connexion `el-nour.maxschool.duckdns.org`
4. Ouvrez-le : la page de connexion doit s'afficher **en https**
5. Connectez-vous avec l'e-mail et le mot de passe saisis

Si le sous-domaine ne répond pas, allez voir **Settings → Domains** : il
devrait y figurer. S'il n'y est pas, les journaux du déploiement
contiennent la ligne `[signup] Sous-domaine … non declare : …` qui donne
la raison exacte.

---

## Si ça coince à l'étape 4

Deux blocages possibles, et leur issue :

**« duckdns.org est déjà utilisé par un autre compte Vercel »**
Quelqu'un d'autre a rattaché un sous-domaine DuckDNS avant vous. Rien à
négocier : il faut un autre domaine.

**Vercel exige un CNAME que DuckDNS ne sait pas créer**
Même conclusion.

Dans les deux cas, la sortie coûte environ **2 € par an** : un domaine
`.xyz` ou `.site` chez Porkbun ou Namecheap, payable par PayPal — donc
sans carte bancaire, si vous avez un compte PayPal alimenté. Vous
déléguez alors les serveurs de noms à Vercel, vous ajoutez
`*.votredomaine` d'un coup, et l'automatisation de l'étape 6 devient même
inutile.

Troisième voie, entièrement gratuite mais plus lente : attendre la
validation de votre demande `.eu.org`, qui autorise la délégation de
serveurs de noms. Un à trois mois.

---

## En attendant, ce qui marche déjà

Même si le domaine coince, l'application est en ligne sur l'adresse
`.vercel.app` fournie automatiquement. Le super-admin peut s'y connecter
et créer des écoles depuis l'écran « Écoles ». Seule l'inscription libre
avec sous-domaine reste en attente.

---

## Rappel

Le plan gratuit *Hobby* de Vercel est réservé à un usage non commercial.
Tant que vous testez, ou équipez une école sans la facturer, vous êtes
dans les règles. Le jour où vous facturez, il faudra le plan Pro
(≈ 20 $/mois) ou l'auto-hébergement décrit dans `MISE-EN-LIGNE.md`.

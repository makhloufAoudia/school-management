# Inscription d'école + domaine personnalisé

## Ce qui a été ajouté (inscription libre d'une école)

Une école peut maintenant s'inscrire elle-même, sans passer par Supabase :

- **Page `/signup`** : formulaire (nom de l'école, nom du directeur, e-mail, mot de passe).
- **Action serveur `signUpSchool`** (`lib/actions/signup.ts`) :
  1. génère un slug unique à partir du nom de l'école,
  2. crée l'école + son année scolaire (RPC `provision_school`),
  3. crée le compte administrateur avec mot de passe (e-mail confirmé d'office),
  4. rollback automatique de l'école si la création du compte échoue.
- **Lien « Créer une école »** ajouté sur la page de connexion (visible uniquement sur l'espace plateforme).
- **`/signup` rendue publique** dans le middleware.

Sécurité conservée : le nouveau compte est créé en `role = admin` rattaché à SA nouvelle école (jamais super-admin). L'isolation des données reste garantie par la RLS Supabase.

> Note : la page d'inscription est en français uniquement pour l'instant (le reste de l'app est multilingue). On pourra la traduire plus tard.

## Pré-requis important : le domaine personnalisé

Ton app isole chaque école sur son **propre sous-domaine** (`nom-ecole.tondomaine.com`). Sur l'URL `.vercel.app` par défaut, les sous-domaines ne fonctionnent pas — donc **l'inscription n'est pleinement utilisable qu'avec un domaine personnalisé + wildcard**. Sans ça, une école inscrite ne pourra pas se connecter.

### Étapes (une seule fois)

1. **Achète un domaine** chez un registrar (Namecheap, OVH, Cloudflare…) — ex. `monecole.com` (~10 €/an).

2. **Ajoute le domaine à Vercel** : projet `school-management` → **Settings → Domains** → ajoute :
   - `monecole.com`
   - `*.monecole.com` (le wildcard, indispensable pour les sous-domaines par école)

3. **Pointe les serveurs de noms (nameservers)** de ton domaine vers ceux de Vercel (Vercel te les affiche). C'est **obligatoire** pour que le certificat SSL wildcard soit généré automatiquement. Le wildcard est disponible sur le plan gratuit à cette condition.

4. **Ajoute la variable d'environnement** sur Vercel (Settings → Environment Variables) :
   ```
   NEXT_PUBLIC_ROOT_DOMAIN = monecole.com
   ```
   (sans `https://`, sans `www`). C'est elle qui indique à l'app comment lire le sous-domaine d'école.

5. **Mets à jour l'URI de redirection Google OAuth** (pour Drive), dans Google Cloud Console → ton client OAuth :
   - `https://monecole.com/api/google/callback`
   - éventuellement `https://*.monecole.com/api/google/callback` si l'upload se fait depuis les sous-domaines. (Google n'accepte pas toujours le wildcard ici ; le plus sûr est d'ajouter les sous-domaines réellement utilisés.)

6. **Redéploie** (Deployments → `...` → Redeploy) pour activer `NEXT_PUBLIC_ROOT_DOMAIN`.

### Résultat

- `monecole.com` → espace plateforme (super-admin, page d'inscription).
- Une école qui s'inscrit sous le nom « École El Nour » → accessible sur `el-nour.monecole.com`.
- Le directeur se connecte sur son sous-domaine avec l'e-mail + mot de passe choisis à l'inscription.

## Tant que tu n'as pas de domaine

L'app reste utilisable sur `.vercel.app` **pour le super-admin uniquement** (espace plateforme). Tu peux déjà tester la création d'écoles côté super-admin depuis l'écran « Écoles ». L'inscription libre `/signup` fonctionnera pleinement une fois le domaine + wildcard + `NEXT_PUBLIC_ROOT_DOMAIN` en place.

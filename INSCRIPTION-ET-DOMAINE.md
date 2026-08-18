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

## Le domaine : une seule adresse

L'application entière vit sur **<https://maxschool.duckdns.org>**.

Il n'y a **plus de sous-domaine par école**. Une école qui s'inscrit n'a
rien de particulier à configurer : son directeur, ses enseignants et ses
parents se connectent tous sur la même adresse, et Supabase rattache
chaque compte à son école (l'isolation des données reste assurée par la
RLS, pas par l'adresse).

Concrètement :

- `https://maxschool.duckdns.org` → connexion, pour tout le monde.
- `https://maxschool.duckdns.org/signup` → inscription d'une nouvelle école.
- Le lien de connexion renvoyé après l'inscription, ainsi que les liens
  d'invitation des enseignants et des parents, pointent tous vers cette
  adresse (voir `lib/site-url.ts` et la variable `NEXT_PUBLIC_SITE_URL`).

Aucun domaine payant, aucun certificat wildcard, aucune délégation de
serveurs de noms n'est nécessaire. Détails et procédure dans
`ADRESSE-UNIQUE.md`.

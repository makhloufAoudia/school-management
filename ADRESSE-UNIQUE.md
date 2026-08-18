# Une seule adresse : https://maxschool.duckdns.org

Ce document résume ce qui a été mis en place pour que l'application
n'existe plus qu'à **une seule adresse**, et ce qu'il vous reste à faire.

---

## Ce qui a changé dans le code

**1. Tous les liens fabriqués par l'application pointent vers l'adresse unique.**

Un nouveau fichier, `lib/site-url.ts`, contient une seule fonction :
`siteOrigin()`. Elle renvoie la valeur de `NEXT_PUBLIC_SITE_URL`.
Elle est utilisée par :

| Fichier | Lien concerné |
|---|---|
| `lib/actions/accounts.ts` | invitation d'un enseignant ou d'un parent |
| `lib/actions/users.ts` | réinitialisation de mot de passe |
| `lib/actions/schools.ts` | invitation de l'admin d'une école |
| `lib/actions/signup.ts` | lien de connexion après inscription d'une école |

Avant, ces liens reprenaient l'adresse par laquelle vous étiez arrivé.
Si vous travailliez sur `http://localhost:3001`, l'e-mail envoyé à un
parent contenait un lien vers `localhost` — donc inutilisable pour lui.
Ce n'est plus possible.

**2. Toute autre adresse publique est redirigée.**

`middleware.ts` compare l'adresse d'arrivée à `NEXT_PUBLIC_SITE_URL`. Si
quelqu'un arrive par une ancienne URL (`...vercel.app`, une adresse de
prévisualisation, un ancien sous-domaine d'école), il est renvoyé vers
`https://maxschool.duckdns.org` **sur la même page**. `localhost` et les
adresses IP ne sont jamais redirigés : le développement local continue
de fonctionner normalement.

**3. Le code des sous-domaines par école a été mis de côté.**

`lib/vercel-domain.ts` (création automatique d'un sous-domaine par école
via l'API Vercel) n'était plus appelé. Il est déplacé dans le dossier
`_to_delete/`, avec l'ancienne version de `middleware.ts`. **Rien n'a été
supprimé** : vérifiez, puis supprimez ce dossier vous-même quand vous
serez rassuré.

---

## Ce qu'il vous reste à faire

### 1. Sur Vercel (indispensable — c'est là qu'est hébergé le site)

`.env.local` ne sert que sur votre machine. Le site en ligne lit ses
variables dans Vercel :

1. <https://vercel.com> → projet **school-management**
2. **Settings → Environment Variables → Add**
   - Name : `NEXT_PUBLIC_SITE_URL`
   - Value : `https://maxschool.duckdns.org`
   - Cochez les trois environnements (Production, Preview, Development)
3. **Deployments** → sur le dernier déploiement, menu `...` → **Redeploy**

> Cette variable est figée au moment du *build* : sans redéploiement,
> elle n'a aucun effet.

### 2. En local

Rien à faire, `NEXT_PUBLIC_SITE_URL` a déjà été ajouté en haut de
`.env.local`. Relancez simplement `restart-school.bat` pour reconstruire.

### 3. Vérification

Une fois redéployé :

- ouvrez `https://maxschool.duckdns.org` → la page de connexion s'affiche ;
- ouvrez l'ancienne URL `...vercel.app` → vous devez être renvoyé sur
  `maxschool.duckdns.org` ;
- invitez un enseignant de test → le lien reçu doit commencer par
  `https://maxschool.duckdns.org`.

---

## Si vous changez d'adresse un jour

Une seule ligne à modifier : `NEXT_PUBLIC_SITE_URL`, dans `.env.local`
**et** dans les variables Vercel. Puis rebuild / redeploy. La redirection
utilise un code 307 (temporaire), donc aucun navigateur ne garde
l'ancienne adresse en mémoire.
